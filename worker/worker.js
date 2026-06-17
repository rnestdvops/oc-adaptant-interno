/**
 * OC Adaptant Interno — Cloudflare Worker
 *
 * Responsabilidades:
 *  1. Validar password del usuario y devolver token de sesión
 *  2. Proxear llamadas a la API de Anthropic con SYSTEM_PROMPT + datamarts
 *     correspondientes al nivel del token
 *  3. Habilitar web_search del lado servidor
 *
 * Variables de entorno requeridas (configurar en Cloudflare):
 *  - ANTHROPIC_API_KEY
 *  - PWD_SOCIOS
 *  - PWD_ASESORES
 *  - PWD_INVERSORES
 *  - SESSION_SECRET     (clave para firmar tokens, cualquier string largo)
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// ─── Helpers de token ─────────────────────────────────────────────────────────

async function signToken(payload, secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, data);
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  const payloadB64 = btoa(JSON.stringify(payload));
  return `${payloadB64}.${sigB64}`;
}

async function verifyToken(token, secret) {
  try {
    const [payloadB64, sigB64] = token.split(".");
    if (!payloadB64 || !sigB64) return null;
    const payload = JSON.parse(atob(payloadB64));

    // Expiración 12 horas
    if (Date.now() - payload.iat > 12 * 60 * 60 * 1000) return null;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sig = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
    const data = encoder.encode(JSON.stringify(payload));
    const valid = await crypto.subtle.verify("HMAC", key, sig, data);
    return valid ? payload : null;
  } catch (e) {
    return null;
  }
}

// ─── Selección de SYSTEM_PROMPT por nivel ─────────────────────────────────────

async function buildSystemPrompt(level, env) {
  // En producción los .md y .json se cargarán desde KV o R2.
  // Para el primer deploy, los .md viven inline acá o se sirven desde el sitio
  // y el Worker hace fetch a esos archivos.
  // Esta versión usa fetch al sitio Netlify (same domain config en CORS).

  const SITE_BASE = env.SITE_BASE || "https://oc-adaptant.netlify.app";

  const fetchText = async (path) => {
    const r = await fetch(`${SITE_BASE}${path}`);
    if (!r.ok) throw new Error(`No se pudo cargar ${path}`);
    return await r.text();
  };

  const fetchJson = async (path) => {
    const r = await fetch(`${SITE_BASE}${path}`);
    if (!r.ok) throw new Error(`No se pudo cargar ${path}`);
    return await r.json();
  };

  // Separamos en dos bloques para tener dos cache breakpoints independientes:
  //   1) promptParts  → capas .md (cambian raramente — semanas)
  //   2) datamartParts → datamarts JSON (cambian semanalmente o más)
  // Cuando solo cambian los datamarts (caso típico), el cache del bloque 1
  // se mantiene y solo se reescribe el bloque 2. Ahorra ~90% del costo de
  // input en queries repetidas dentro de la ventana del cache (5 min TTL).
  const promptParts = [];
  const datamartParts = [];

  // Capa 00 — siempre
  promptParts.push(await fetchText("/system_prompts/00_personalidad.md"));

  if (level === "socios" || level === "asesores") {
    // Capa 01 — briefing completo
    promptParts.push(await fetchText("/system_prompts/01_briefing_completo.md"));
    // Capa 02 — datamart guide
    promptParts.push(await fetchText("/system_prompts/02_datamart_guide.md"));
    // Capa 04 — modelo privacidad
    promptParts.push(await fetchText("/system_prompts/04_modelo_privacidad.md"));

    // Datamarts inyectados
    const datamarts = [
      "entidades.json",
      "deuda_arca.json",
      "deuda_privada.json",
      "vencimientos.json",
      "adaptant_sas.json",
      "dvops_llc.json",
      "cash_flow.json",
      "costos_operativos.json",
      "personal.json",
      "nerdcube_legacy.json",
      "movimientos_bancarios.json",
      "chase_dvops.json",
      "mp_bhp.json",
      "mp_nerdcube.json",
      "proceso_ordenamiento.json",
    ];
    datamartParts.push("\n\n## Datamarts cargados\n");
    for (const dm of datamarts) {
      const data = await fetchJson(`/datamarts/${dm}`);
      datamartParts.push(`\n### ${dm}\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`);
    }
  } else if (level === "inversores") {
    // Solo capa 03 + 04 + datamart Adaptant
    promptParts.push(await fetchText("/system_prompts/03_vista_inversor.md"));
    promptParts.push(await fetchText("/system_prompts/04_modelo_privacidad.md"));

    const datamarts = ["entidades.json", "adaptant_sas.json"];
    datamartParts.push("\n\n## Información disponible\n");
    for (const dm of datamarts) {
      const data = await fetchJson(`/datamarts/${dm}`);
      // Para entidades, filtrar solo Adaptant SAS
      if (dm === "entidades.json") {
        const filtered = {
          ...data,
          entidades: data.entidades.filter(e => e.visibility === "publico")
        };
        datamartParts.push(`\n### ${dm}\n\`\`\`json\n${JSON.stringify(filtered, null, 2)}\n\`\`\`\n`);
      } else {
        datamartParts.push(`\n### ${dm}\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`);
      }
    }
  }

  // Devolvemos como array de content blocks con cache_control. Anthropic
  // intenta cachear todo el prefix hasta cada cache_control. Si el contenido
  // del bloque es idéntico a una request anterior dentro de los últimos
  // 5 min, se cobra como cache_read (~10% del costo input). Si no, es
  // cache_write (~125%) y queda cacheado para las siguientes.
  return [
    {
      type: "text",
      text: promptParts.join("\n\n"),
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: datamartParts.join("\n\n"),
      cache_control: { type: "ephemeral" },
    },
  ];
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

async function handleAuth(request, env) {
  const body = await request.json();
  const { password } = body;

  let level = null;
  if (password === env.PWD_SOCIOS) level = "socios";
  else if (password === env.PWD_ASESORES) level = "asesores";
  else if (password === env.PWD_INVERSORES) level = "inversores";

  if (!level) {
    return new Response(JSON.stringify({ error: "Credenciales inválidas" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const token = await signToken({ level, iat: Date.now() }, env.SESSION_SECRET);
  return new Response(JSON.stringify({ token, level }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function handleChat(request, env, ctx) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Sin token" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const payload = await verifyToken(token, env.SESSION_SECRET);
  if (!payload) {
    return new Response(JSON.stringify({ error: "Token inválido o expirado" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const body = await request.json();
  const { messages } = body;

  let systemPrompt;
  try {
    systemPrompt = await buildSystemPrompt(payload.level, env);
  } catch (e) {
    return new Response(JSON.stringify({ error: `Build prompt: ${e.message}` }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const anthropicBody = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 3,
      },
    ],
  };

  const anthropicResp = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(anthropicBody),
  });

  const data = await anthropicResp.json();

  // Si la API de Anthropic devolvió un error, traducir a mensaje amigable
  // en lugar de propagar el JSON crudo al frontend.
  if (!anthropicResp.ok || data?.type === "error") {
    const friendly = mapAnthropicError(data, anthropicResp);
    return new Response(JSON.stringify({
      ok: false,
      friendly_message: friendly.message,
      retry_after_s: friendly.retry_after_s,
      error_type: friendly.type,
    }), {
      status: anthropicResp.status,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  // Log automático en KV de cada query exitosa para auditoría y mejora de
  // datamarts. Asíncrono via ctx.waitUntil — no bloquea la respuesta.
  // Solo se loguean queries que llegaron a Anthropic con éxito; errores
  // no se persisten (ya hay rate limit / error_type en el response del worker).
  const queryId = crypto.randomUUID();
  ctx.waitUntil(logQuery(env, {
    query_id: queryId,
    ts: Date.now(),
    level: payload.level,
    messages,
    response: data,
  }));

  // Inyectamos query_id en el body de respuesta para que el frontend pueda
  // adjuntarlo cuando el usuario vote feedback. Es metadata del wrapper,
  // no toca los content blocks de Anthropic.
  const enrichedResponse = { ...data, query_id: queryId };

  return new Response(JSON.stringify(enrichedResponse), {
    status: anthropicResp.status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ─── Log automático de queries (auditoría) ────────────────────────────────────

async function logQuery(env, { query_id, ts, level, messages, response }) {
  try {
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    const question = typeof lastUser?.content === "string"
      ? lastUser.content
      : (Array.isArray(lastUser?.content)
          ? lastUser.content.filter(b => b.type === "text").map(b => b.text).join("\n")
          : "");

    const answerText = (response?.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n\n");

    const MAX_PREVIEW = 2000;
    const answer_preview = answerText.length > MAX_PREVIEW
      ? answerText.slice(0, MAX_PREVIEW) + "… [truncado]"
      : answerText;

    const entry = {
      query_id,
      ts,
      level,
      question,
      answer_preview,
      answer_truncated: answerText.length > MAX_PREVIEW,
      usage: response?.usage || null,
    };

    const key = `query:${ts}:${query_id}`;
    await env.FEEDBACK_KV.put(key, JSON.stringify(entry));
  } catch (e) {
    // Silencioso: si falla el log no debe romper la conversación.
  }
}

// ─── Mapeo de errores de la API a mensajes amigables ──────────────────────────

function mapAnthropicError(data, resp) {
  const type = data?.error?.type || "unknown_error";
  const retryAfter = parseInt(resp.headers.get("retry-after") || "0", 10);

  const MENSAJES = {
    rate_limit_error: retryAfter > 0
      ? `Llegamos al techo de uso del modelo por minuto. Esperá ~${retryAfter}s y volvé a preguntar — la pregunta y el contexto siguen acá.`
      : "Llegamos al techo de uso del modelo por minuto. Esperá un minuto y volvé a preguntar — la pregunta y el contexto siguen acá.",
    overloaded_error:
      "El modelo está saturado en este momento. Reintentá en unos segundos.",
    authentication_error:
      "Hay un problema con la configuración del servicio. Avisale a Ernesto o Franco para que revisen.",
    invalid_request_error:
      "El pedido salió mal armado. Probá reformular la pregunta o cerrar sesión y volver a entrar para limpiar el contexto.",
    request_too_large:
      "Esta conversación ya quedó muy larga para que el modelo la procese. Cerrá sesión y arrancá una nueva para limpiar contexto.",
    not_found_error:
      "No encontré lo que estabas buscando. Probá reformular la pregunta.",
    permission_error:
      "Este recurso no está habilitado para tu nivel de acceso.",
    api_error:
      "Algo falló del lado del modelo. Reintentá en unos segundos — si vuelve a pasar, avisame.",
    unknown_error:
      "Algo salió mal y no pude completar la consulta. Reintentá en unos segundos.",
  };

  return {
    type,
    message: MENSAJES[type] || MENSAJES.unknown_error,
    retry_after_s: retryAfter || null,
  };
}

// ─── Endpoints de feedback (KV) ───────────────────────────────────────────────

async function requireAuth(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  return await verifyToken(token, env.SESSION_SECRET);
}

async function handleFeedbackSubmit(request, env) {
  const payload = await requireAuth(request, env);
  if (!payload) {
    return new Response(JSON.stringify({ error: "Sin token o token inválido" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const body = await request.json();
  const { vote, question, answer, comment, query_id } = body;

  if (vote !== "up" && vote !== "down") {
    return new Response(JSON.stringify({ error: "vote debe ser 'up' o 'down'" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const entry = {
    vote,
    level: payload.level,
    question: question || "",
    answer: answer || "",
    comment: comment || "",
    query_id: query_id || null,
    ts: Date.now(),
  };

  const key = `feedback:${entry.ts}:${crypto.randomUUID()}`;
  await env.FEEDBACK_KV.put(key, JSON.stringify(entry));

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function handleFeedbackList(request, env) {
  const payload = await requireAuth(request, env);
  if (!payload) {
    return new Response(JSON.stringify({ error: "Sin token o token inválido" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const list = await env.FEEDBACK_KV.list({ prefix: "feedback:" });
  const entries = await Promise.all(
    list.keys.map(async (k) => {
      const raw = await env.FEEDBACK_KV.get(k.name);
      return raw ? JSON.parse(raw) : null;
    })
  );

  const sorted = entries.filter(Boolean).sort((a, b) => b.ts - a.ts);

  return new Response(JSON.stringify({ entries: sorted }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ─── Router principal ─────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/auth" && request.method === "POST") {
      return handleAuth(request, env);
    }

    if (url.pathname === "/chat" && request.method === "POST") {
      return handleChat(request, env, ctx);
    }

    if (url.pathname === "/feedback" && request.method === "POST") {
      return handleFeedbackSubmit(request, env);
    }

    if (url.pathname === "/feedback" && request.method === "GET") {
      return handleFeedbackList(request, env);
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
};
