# Briefing: migración + port de features al OC GBM

**Para:** Claude Code operando sobre el repo del OC GBM Costa Rica  
**Origen:** OC Adaptant Interno (repo `oc-adaptant-interno`)  
**Fecha:** 2026-06-18

Este documento es autosuficiente. No necesitás contexto de conversaciones anteriores.

---

## Situación de partida

El OC GBM está montado **solo en Netlify** — sitio estático sin Cloudflare Worker. La API key de Anthropic probablemente está expuesta en el frontend. Hay que migrarla a un Cloudflare Worker antes de agregar cualquier feature nueva.

Arquitectura objetivo (igual al OC Adaptant Interno):

```
Browser
  └── assets/auth.js    → POST /auth  → Worker valida password → token HMAC
  └── assets/chat.js    → POST /chat  → Worker llama Anthropic (key segura)
  └── feedback.html     → GET /feedback, /queries, /alerts → Worker lee KV

Cloudflare Worker
  ├── Auth multinivel con tokens HMAC-SHA256 (12h)
  ├── Proxy a Anthropic (API key solo en CF, nunca en browser)
  ├── Prompt caching con 2 breakpoints
  ├── KV: feedback, queries, alertas de agentes
  └── Cron Triggers: agentes que corren en background

Netlify (sitio estático)
  ├── HTML/JS/CSS del chat y feedback
  ├── system_prompts/*.md  (el Worker los fetchea en cada request)
  └── datamarts/*.json     (el Worker los fetchea en cada request)
```

---

## Lo que hay que hacer (en orden)

- **Prerequisitos** — Cloudflare account + wrangler instalado
- **Fase 0** — Crear y deployar el Worker (bloqueante)
- **Fase 1** — Port de features (feedback, queries, agentes, changelog, tabs)

No avanzar a Fase 1 sin que Fase 0 esté validada.

---

# PREREQUISITOS · Cloudflare y wrangler

## P.1 — Cuenta de Cloudflare

El responsable de GBM necesita una cuenta en cloudflare.com. Si no tiene:

1. Crear cuenta gratuita en https://cloudflare.com
2. El plan Free es suficiente — Workers, KV y Cron Triggers están incluidos en el free tier dentro de los límites normales de uso

## P.2 — Instalar wrangler

Wrangler es la CLI de Cloudflare para deployar Workers. Desde la raíz del repo GBM:

```bash
npm install --save-dev wrangler
```

O globalmente si se prefiere:

```bash
npm install -g wrangler
```

Verificar instalación:

```bash
npx wrangler --version
```

## P.3 — Autenticarse en Cloudflare

```bash
npx wrangler login
```

Abre un browser. El responsable de GBM inicia sesión con su cuenta de Cloudflare. Después de aprobar, el CLI queda autenticado localmente.

Verificar que funciona:

```bash
npx wrangler whoami
```

Debe mostrar el email de la cuenta y el account ID.

## P.4 — Node.js requerido

wrangler requiere Node.js ≥ 18. Verificar:

```bash
node --version
```

Si es menor a 18, actualizar desde nodejs.org antes de continuar.

---

# FASE 0 · Crear y deployar el Worker

## 0.1 — Leer el estado actual del repo GBM

Antes de tocar nada, entender cómo se hace actualmente la llamada a Anthropic:

- Buscar `fetch("https://api.anthropic.com"` o `ANTHROPIC` en todo el repo
- Buscar si hay `netlify/functions/` con algún handler de API
- Identificar si hay sistema de autenticación (passwords, tokens)
- Identificar los niveles de acceso actuales (¿cuántos perfiles hay? ¿qué nombres?)
- Identificar qué `system_prompts/` y `datamarts/` existen

Anotar todo esto antes de empezar — define qué hay que migrar.

---

## 0.2 — Crear la estructura del Worker

En la raíz del repo GBM, crear el directorio `worker/`:

```
worker/
├── worker.js       (crear — ver 0.5)
├── wrangler.toml   (crear — ver 0.3)
└── .dev.vars       (crear — NO commitear)
```

Agregar al `.gitignore` del repo si no están ya:

```
worker/.wrangler/
worker/.dev.vars
version.json
```

---

## 0.3 — wrangler.toml

Crear `worker/wrangler.toml`. Reemplazar los valores en mayúsculas:

```toml
name = "oc-gbm"
main = "worker.js"
compatibility_date = "2024-01-01"

[vars]
SITE_BASE = "https://URL-NETLIFY-GBM.netlify.app"

[[kv_namespaces]]
binding = "FEEDBACK_KV"
id = "REEMPLAZAR_DESPUES_DE_CREAR_KV"

[triggers]
crons = ["0 11 * * *"]
```

Crear el KV namespace (ejecutar desde `worker/`):

```bash
npx wrangler kv namespace create FEEDBACK_KV
```

Copiar el `id` que devuelve y pegarlo en `wrangler.toml` reemplazando `REEMPLAZAR_DESPUES_DE_CREAR_KV`.

---

## 0.4 — Secrets de entorno

Las variables secretas NUNCA van en el repo. El responsable de GBM debe ejecutar estos comandos desde `worker/`. Cada uno abre un prompt para ingresar el valor:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put PWD_ADMIN
npx wrangler secret put PWD_USUARIO
npx wrangler secret put SESSION_SECRET
```

`SESSION_SECRET` puede ser cualquier string largo aleatorio (ej: `openssl rand -hex 32`).

**Ajustar los nombres** según cuántos niveles de acceso tenga GBM. El patrón es `PWD_<NIVEL>` para cada nivel. Si GBM tiene 3 niveles, agregar el tercero con `wrangler secret put PWD_TERCER_NIVEL`.

Para desarrollo local crear `worker/.dev.vars` (NO commitear — ya está en .gitignore):

```
ANTHROPIC_API_KEY=sk-ant-...
PWD_ADMIN=clave-admin
PWD_USUARIO=clave-usuario
SESSION_SECRET=string-largo-aleatorio
SITE_BASE=https://URL-NETLIFY-GBM.netlify.app
```

---

## 0.5 — worker.js completo

Crear `worker/worker.js` con este contenido. **Ajustar obligatoriamente** las secciones marcadas con `// AJUSTAR`:

```javascript
/**
 * OC GBM — Cloudflare Worker
 *
 * Variables de entorno requeridas (configurar con wrangler secret put):
 *  - ANTHROPIC_API_KEY
 *  - PWD_ADMIN       (ajustar nombres según niveles de GBM)
 *  - PWD_USUARIO
 *  - SESSION_SECRET
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// ─── Tokens HMAC-SHA256 ───────────────────────────────────────────────────────

async function signToken(payload, secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, data);
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${btoa(JSON.stringify(payload))}.${sigB64}`;
}

async function verifyToken(token, secret) {
  try {
    const [payloadB64, sigB64] = token.split(".");
    if (!payloadB64 || !sigB64) return null;
    const payload = JSON.parse(atob(payloadB64));
    if (Date.now() - payload.iat > 12 * 60 * 60 * 1000) return null;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const sig = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sig, encoder.encode(JSON.stringify(payload)));
    return valid ? payload : null;
  } catch (e) { return null; }
}

// ─── SYSTEM_PROMPT por nivel ──────────────────────────────────────────────────

async function buildSystemPrompt(level, env) {
  const SITE_BASE = env.SITE_BASE || "https://URL-NETLIFY-GBM.netlify.app";

  const fetchText = async (path) => {
    const r = await fetch(`${SITE_BASE}${path}`);
    if (!r.ok) throw new Error(`No se pudo cargar ${path}`);
    return r.text();
  };

  const fetchJson = async (path) => {
    const r = await fetch(`${SITE_BASE}${path}`);
    if (!r.ok) throw new Error(`No se pudo cargar ${path}`);
    return r.json();
  };

  const promptParts = [];
  const datamartParts = [];

  // AJUSTAR: definir qué archivos carga cada nivel de GBM.
  // promptParts → capas .md (raramente cambian → cache de Anthropic los mantiene)
  // datamartParts → datamarts JSON (cambian frecuentemente → segundo bloque de cache)
  if (level === "admin") {
    promptParts.push(await fetchText("/system_prompts/00_personalidad.md"));
    promptParts.push(await fetchText("/system_prompts/01_briefing_gbm.md"));
    // Agregar más capas .md si existen

    // AJUSTAR: listar los datamarts del nivel admin de GBM
    const datamarts = [
      // "clientes.json",
      // "proyectos.json",
      // etc.
    ];
    datamartParts.push("\n\n## Datamarts cargados\n");
    for (const dm of datamarts) {
      const data = await fetchJson(`/datamarts/${dm}`);
      datamartParts.push(`\n### ${dm}\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`);
    }

  } else if (level === "usuario") {
    // AJUSTAR: subset de datamarts para nivel usuario
    promptParts.push(await fetchText("/system_prompts/00_personalidad.md"));
    promptParts.push(await fetchText("/system_prompts/01_briefing_gbm.md"));
    const datamarts = [];
    datamartParts.push("\n\n## Datamarts cargados\n");
    for (const dm of datamarts) {
      const data = await fetchJson(`/datamarts/${dm}`);
      datamartParts.push(`\n### ${dm}\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`);
    }
  }

  // Dos bloques con cache_control para prompt caching de Anthropic.
  // Bloque 1 (prompts .md): se cachea mientras no cambie → ahorra ~90% del costo input.
  // Bloque 2 (datamarts): cache independiente → si solo cambian datos, bloque 1 ya está cacheado.
  return [
    { type: "text", text: promptParts.join("\n\n"), cache_control: { type: "ephemeral" } },
    { type: "text", text: datamartParts.join("\n\n"), cache_control: { type: "ephemeral" } },
  ];
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function handleAuth(request, env) {
  const { password } = await request.json();

  // AJUSTAR: agregar o quitar niveles según GBM
  let level = null;
  if (password === env.PWD_ADMIN) level = "admin";
  else if (password === env.PWD_USUARIO) level = "usuario";

  if (!level) {
    return new Response(JSON.stringify({ error: "Credenciales inválidas" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const token = await signToken({ level, iat: Date.now() }, env.SESSION_SECRET);
  return new Response(JSON.stringify({ token, level }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

async function handleChat(request, env, ctx) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Sin token" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const payload = await verifyToken(authHeader.replace("Bearer ", ""), env.SESSION_SECRET);
  if (!payload) {
    return new Response(JSON.stringify({ error: "Token inválido o expirado" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const { messages } = await request.json();

  let systemPrompt;
  try {
    systemPrompt = await buildSystemPrompt(payload.level, env);
  } catch (e) {
    return new Response(JSON.stringify({ error: `Build prompt: ${e.message}` }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const anthropicResp = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
    }),
  });

  const data = await anthropicResp.json();

  if (!anthropicResp.ok || data?.type === "error") {
    const friendly = mapAnthropicError(data, anthropicResp);
    return new Response(JSON.stringify({
      ok: false,
      friendly_message: friendly.message,
      retry_after_s: friendly.retry_after_s,
      error_type: friendly.type,
    }), { status: anthropicResp.status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }

  const queryId = crypto.randomUUID();
  ctx.waitUntil(logQuery(env, { query_id: queryId, ts: Date.now(), level: payload.level, messages, response: data }));

  return new Response(JSON.stringify({ ...data, query_id: queryId }), {
    status: anthropicResp.status, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ─── Log de queries ───────────────────────────────────────────────────────────

async function logQuery(env, { query_id, ts, level, messages, response }) {
  try {
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    const question = typeof lastUser?.content === "string"
      ? lastUser.content
      : (Array.isArray(lastUser?.content)
          ? lastUser.content.filter(b => b.type === "text").map(b => b.text).join("\n") : "");
    const answerText = (response?.content || []).filter(b => b.type === "text").map(b => b.text).join("\n\n");
    const MAX_PREVIEW = 2000;
    const entry = {
      query_id, ts, level, question,
      answer_preview: answerText.length > MAX_PREVIEW ? answerText.slice(0, MAX_PREVIEW) + "… [truncado]" : answerText,
      answer_truncated: answerText.length > MAX_PREVIEW,
      usage: response?.usage || null,
    };
    await env.FEEDBACK_KV.put(`query:${ts}:${query_id}`, JSON.stringify(entry));
  } catch (e) { /* silencioso */ }
}

// ─── Errores amigables ────────────────────────────────────────────────────────

function mapAnthropicError(data, resp) {
  const type = data?.error?.type || "unknown_error";
  const retryAfter = parseInt(resp.headers.get("retry-after") || "0", 10);
  const MENSAJES = {
    rate_limit_error: retryAfter > 0
      ? `Techo de uso del modelo. Esperá ~${retryAfter}s y reintentá.`
      : "Techo de uso del modelo. Esperá un minuto y reintentá.",
    overloaded_error: "El modelo está saturado. Reintentá en unos segundos.",
    authentication_error: "Problema de configuración. Avisale al administrador.",
    invalid_request_error: "El pedido salió mal. Reformulá la pregunta o reiniciá sesión.",
    request_too_large: "La conversación quedó muy larga. Cerrá sesión y arrancá una nueva.",
    not_found_error: "No encontré lo que buscabas. Reformulá la pregunta.",
    permission_error: "Este recurso no está habilitado para tu nivel.",
    api_error: "Error del modelo. Reintentá en unos segundos.",
    unknown_error: "Algo salió mal. Reintentá en unos segundos.",
  };
  return { type, message: MENSAJES[type] || MENSAJES.unknown_error, retry_after_s: retryAfter || null };
}

// ─── requireAuth helper ───────────────────────────────────────────────────────

async function requireAuth(request, env) {
  const h = request.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return verifyToken(h.replace("Bearer ", ""), env.SESSION_SECRET);
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

async function handleFeedbackSubmit(request, env) {
  const payload = await requireAuth(request, env);
  if (!payload) return new Response(JSON.stringify({ error: "Sin token" }), {
    status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
  const { vote, question, answer, comment, query_id } = await request.json();
  if (vote !== "up" && vote !== "down") return new Response(JSON.stringify({ error: "vote inválido" }), {
    status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
  const ts = Date.now();
  await env.FEEDBACK_KV.put(`feedback:${ts}:${crypto.randomUUID()}`, JSON.stringify({
    vote, level: payload.level,
    question: question || "", answer: answer || "",
    comment: comment || "", query_id: query_id || null, ts,
  }));
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function handleFeedbackList(request, env) {
  const payload = await requireAuth(request, env);
  if (!payload) return new Response(JSON.stringify({ error: "Sin token" }), {
    status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
  const list = await env.FEEDBACK_KV.list({ prefix: "feedback:" });
  const entries = (await Promise.all(list.keys.map(async k => {
    const raw = await env.FEEDBACK_KV.get(k.name);
    return raw ? JSON.parse(raw) : null;
  }))).filter(Boolean).sort((a, b) => b.ts - a.ts);
  return new Response(JSON.stringify({ entries }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ─── Queries ──────────────────────────────────────────────────────────────────

async function handleQueriesList(request, env) {
  const payload = await requireAuth(request, env);
  if (!payload) return new Response(JSON.stringify({ error: "Sin token" }), {
    status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
  const list = await env.FEEDBACK_KV.list({ prefix: "query:" });
  const entries = (await Promise.all(list.keys.map(async k => {
    const raw = await env.FEEDBACK_KV.get(k.name);
    return raw ? JSON.parse(raw) : null;
  }))).filter(Boolean).sort((a, b) => b.ts - a.ts);
  return new Response(JSON.stringify({ entries, total: entries.length, list_complete: list.list_complete === true }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ─── Alertas ──────────────────────────────────────────────────────────────────

async function handleAlertsList(request, env) {
  const payload = await requireAuth(request, env);
  if (!payload) return new Response(JSON.stringify({ error: "Sin token" }), {
    status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
  const list = await env.FEEDBACK_KV.list({ prefix: "alert:" });
  const entries = (await Promise.all(list.keys.map(async k => {
    const raw = await env.FEEDBACK_KV.get(k.name);
    return raw ? { ...JSON.parse(raw), _key: k.name } : null;
  }))).filter(Boolean).sort((a, b) => b.ts - a.ts);
  return new Response(JSON.stringify({ entries, total: entries.length }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ─── Agents run ───────────────────────────────────────────────────────────────

async function handleAgentRun(request, env) {
  const payload = await requireAuth(request, env);
  // AJUSTAR: reemplazar "admin" con el nivel admin real de GBM
  if (!payload || payload.level !== "admin") {
    return new Response(JSON.stringify({ error: "Solo el nivel admin puede disparar agentes" }), {
      status: 403, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
  const { agent_id } = (await request.json()) || {};
  if (agent_id === "primer-agente-gbm") {
    await runPrimerAgenteGBM(env);
    return new Response(JSON.stringify({ ok: true, agent_id, ran_at: Date.now() }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
  return new Response(JSON.stringify({ error: `Agente desconocido: ${agent_id}` }), {
    status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ─── Cron / Agentes ───────────────────────────────────────────────────────────

async function dispatchScheduled(event, env) {
  // Mapeo cron → agente. Mantener en sync con wrangler.toml [triggers].
  if (event.cron === "0 11 * * *") {
    await runPrimerAgenteGBM(env);
  }
}

async function runPrimerAgenteGBM(env) {
  // AJUSTAR: implementar la lógica real del primer agente de GBM.
  // Este stub valida que la infra funciona — reemplazar con fetch al
  // datamart relevante + filtrado + alerta con datos reales.
  const ts = Date.now();
  await env.FEEDBACK_KV.put(
    `alert:${ts}:primer-agente-gbm:${crypto.randomUUID()}`,
    JSON.stringify({
      agent_id: "primer-agente-gbm",
      ts,
      titulo: "Agente de prueba — infra C4b validada",
      cuerpo_markdown: "- Agente ejecutado correctamente. Reemplazar con lógica real.",
      items_count: 0,
      items: [],
    })
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/auth" && request.method === "POST")   return handleAuth(request, env);
    if (url.pathname === "/chat" && request.method === "POST")   return handleChat(request, env, ctx);
    if (url.pathname === "/feedback" && request.method === "POST") return handleFeedbackSubmit(request, env);
    if (url.pathname === "/feedback" && request.method === "GET")  return handleFeedbackList(request, env);
    if (url.pathname === "/queries"  && request.method === "GET")  return handleQueriesList(request, env);
    if (url.pathname === "/alerts"   && request.method === "GET")  return handleAlertsList(request, env);
    if (url.pathname === "/agents/run" && request.method === "POST") return handleAgentRun(request, env);
    if (url.pathname === "/health")
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(dispatchScheduled(event, env));
  },
};
```

---

## 0.6 — Primer deploy del Worker

Desde `worker/`:

```bash
npx wrangler deploy
```

Anotar la URL que devuelve — formato `https://oc-gbm.NOMBRE.workers.dev`. Esa es la Worker URL que va en todos los HTMLs.

Si el deploy falla con error de KV, verificar que el `id` en `wrangler.toml` es correcto.

---

## 0.7 — assets/auth.js

Reemplazar el `auth.js` existente. **Crítico: siempre envuelto en IIFE** — sin esto hay conflictos de scope con `chat.js` porque ambos son scripts clásicos que comparten scope global.

```javascript
// auth.js — SIEMPRE envuelto en IIFE. No sacar el wrapper bajo ningún concepto.
(function () {
  const WORKER_URL = window.OC_WORKER_URL || "https://URL-WORKER-GBM.workers.dev";

  // AJUSTAR: sugeridas por nivel según los perfiles de GBM
  const SUGERIDAS_POR_NIVEL = {
    admin: [
      // "¿Cuál es el estado del proyecto X?",
      // "Resumen de actividad de esta semana",
    ],
    usuario: [
      // "¿Cómo puedo consultar Y?",
    ],
  };

  async function login(password) {
    const resp = await fetch(`${WORKER_URL}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "Error de autenticación");
    }
    return resp.json();
  }

  function saveSession({ token, level }) {
    sessionStorage.setItem("oc_token", token);
    sessionStorage.setItem("oc_level", level);
  }

  function getSession() {
    const token = sessionStorage.getItem("oc_token");
    const level = sessionStorage.getItem("oc_level");
    return token && level ? { token, level } : null;
  }

  function clearSession() {
    sessionStorage.removeItem("oc_token");
    sessionStorage.removeItem("oc_level");
  }

  function getSugeridas(level) {
    return SUGERIDAS_POR_NIVEL[level] || [];
  }

  window.OCAuth = { login, saveSession, getSession, clearSession, getSugeridas, WORKER_URL };
})();
```

---

## 0.8 — assets/chat.js

Reemplazar el `chat.js` existente con este, que llama al Worker en lugar de a Anthropic directamente:

```javascript
// chat.js — requiere que auth.js haya expuesto window.OCAuth primero.
const { WORKER_URL: CHAT_WORKER_URL, getSession, clearSession, getSugeridas } = window.OCAuth;

const history = [];

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/((?:^\|.*\|\s*\n?)+)/gm, (match) => {
    const lines = match.trim().split("\n");
    if (lines.length < 2) return match;
    const headers = lines[0].split("|").slice(1, -1).map(s => s.trim());
    if (!/^\|[\s\-:|]+\|$/.test(lines[1].trim())) return match;
    const rows = lines.slice(2).map(l => l.split("|").slice(1, -1).map(s => s.trim()));
    let t = "<table><thead><tr>" + headers.map(h => `<th>${h}</th>`).join("") + "</tr></thead><tbody>";
    rows.forEach(r => { t += "<tr>" + r.map(c => `<td>${c}</td>`).join("") + "</tr>"; });
    return t + "</tbody></table>";
  });
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/^(- |\* )(.+)$/gm, "<li>$2</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");
  html = html.split(/\n\n+/).map(p => {
    if (/^<(h[1-6]|ul|ol|table|pre|blockquote)/.test(p.trim())) return p;
    if (!p.trim()) return "";
    return "<p>" + p.replace(/\n/g, "<br>") + "</p>";
  }).join("\n");
  return html;
}

function addMessage(role, text, queryId) {
  const messagesEl = document.getElementById("messages");
  const welcome = document.getElementById("welcome");
  if (welcome) welcome.remove();
  const wrap = document.createElement("div");
  wrap.className = `message ${role}`;
  // AJUSTAR: cambiar "OC GBM" por el nombre que use GBM en la UI
  wrap.innerHTML = `
    <div class="message-role">${role === "user" ? "Vos" : "OC GBM"}</div>
    <div class="message-body">${renderMarkdown(text)}</div>
  `;
  if (role === "assistant") {
    const lastUser = [...history].reverse().find(m => m.role === "user");
    wrap.appendChild(buildFeedbackRow(lastUser?.content || "", text, queryId));
  }
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function buildFeedbackRow(question, answer, queryId) {
  const row = document.createElement("div");
  row.className = "feedback-row";
  const upBtn = document.createElement("button");
  upBtn.className = "feedback-btn"; upBtn.title = "Esta respuesta estuvo bien"; upBtn.textContent = "👍";
  const downBtn = document.createElement("button");
  downBtn.className = "feedback-btn"; downBtn.title = "Esta respuesta no estuvo bien"; downBtn.textContent = "👎";
  const finish = (label) => {
    upBtn.disabled = downBtn.disabled = true;
    const t = document.createElement("span"); t.className = "feedback-thanks"; t.textContent = label;
    row.appendChild(t);
  };
  upBtn.onclick = async () => {
    upBtn.classList.add("active", "up");
    await sendFeedback({ vote: "up", question, answer, query_id: queryId });
    finish("Gracias por el feedback.");
  };
  downBtn.onclick = () => {
    downBtn.classList.add("active", "down");
    upBtn.disabled = downBtn.disabled = true;
    row.appendChild(buildFeedbackForm(question, answer, row, queryId));
  };
  row.appendChild(upBtn); row.appendChild(downBtn);
  return row;
}

function buildFeedbackForm(question, answer, row, queryId) {
  const form = document.createElement("div");
  form.className = "feedback-form";
  form.innerHTML = `
    <textarea placeholder="¿Qué esperabas o qué faltó en la respuesta?"></textarea>
    <div class="feedback-form-actions">
      <button type="button" class="send">Enviar</button>
      <button type="button" class="cancel">Cancelar</button>
    </div>
  `;
  const textarea = form.querySelector("textarea");
  form.querySelector(".send").onclick = async () => {
    await sendFeedback({ vote: "down", question, answer, comment: textarea.value, query_id: queryId });
    form.remove();
    const t = document.createElement("span"); t.className = "feedback-thanks"; t.textContent = "Gracias, lo vamos a revisar.";
    row.appendChild(t);
  };
  form.querySelector(".cancel").onclick = () => form.remove();
  return form;
}

async function sendFeedback(payload) {
  const session = getSession();
  if (!session) return;
  try {
    await fetch(`${CHAT_WORKER_URL}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify(payload),
    });
  } catch (e) { /* silencioso */ }
}

async function loadVersionInfo() {
  const headerEl = document.getElementById("version-info");
  const lastUpdateEl = document.getElementById("last-update-date");
  const today = new Date().toLocaleDateString("es-AR");
  let hash = "dev", deployedAt = null;
  try {
    const resp = await fetch("/version.json", { cache: "no-store" });
    if (resp.ok) { const d = await resp.json(); hash = d.hash || hash; deployedAt = d.deployed_at || null; }
  } catch (e) {}
  if (headerEl) headerEl.textContent = `v${hash} · ${today}`;
  if (lastUpdateEl) {
    if (deployedAt) { const [y,m,d] = deployedAt.split("-"); lastUpdateEl.textContent = `${d}/${m}/${y}`; }
    else lastUpdateEl.textContent = today;
  }
}

function showThinking() {
  const el = document.createElement("div");
  el.className = "message assistant"; el.id = "thinking-msg";
  el.innerHTML = `<div class="message-role">OC GBM</div><div class="message-body"><span class="thinking">pensando</span></div>`;
  document.getElementById("messages").appendChild(el);
  document.getElementById("messages").scrollTop = 999999;
}

function clearThinking() {
  document.getElementById("thinking-msg")?.remove();
}

async function send(userText) {
  if (!userText.trim()) return;
  const session = getSession();
  if (!session) { window.location.href = "/"; return; }

  addMessage("user", userText);
  history.push({ role: "user", content: userText });

  const sendBtn = document.getElementById("send-btn");
  const ta = document.getElementById("composer-input");
  sendBtn.disabled = true; ta.value = "";
  showThinking();

  try {
    const resp = await fetch(`${CHAT_WORKER_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ messages: history }),
    });
    clearThinking();

    if (resp.status === 401) {
      clearSession();
      addMessage("assistant", "La sesión expiró. Recargá la página para volver a entrar.");
      return;
    }

    const data = await resp.json();

    if (data.ok === false && data.friendly_message) {
      addMessage("assistant", data.friendly_message);
      history.pop(); return;
    }
    if (data.error) {
      addMessage("assistant", "Algo salió mal. Reintentá en unos segundos.");
      history.pop(); return;
    }

    const textBlocks = data.content.filter(b => b.type === "text").map(b => b.text).join("\n\n");
    if (textBlocks) {
      addMessage("assistant", textBlocks, data.query_id);
      history.push({ role: "assistant", content: textBlocks });
    } else {
      addMessage("assistant", "(sin respuesta de texto)", data.query_id);
    }
  } catch (e) {
    clearThinking();
    addMessage("assistant", "No pude conectarme con el servidor. Revisá tu conexión.");
    history.pop();
  } finally {
    sendBtn.disabled = false; ta.focus();
  }
}

function setupChat() {
  const session = getSession();
  if (!session) { window.location.href = "/"; return; }

  document.getElementById("session-level").textContent = session.level;
  loadVersionInfo();

  const sidebar = document.getElementById("suggested-questions");
  getSugeridas(session.level).forEach(q => {
    const btn = document.createElement("button");
    btn.className = "suggested-q"; btn.textContent = q;
    btn.onclick = () => send(q);
    sidebar.appendChild(btn);
  });

  document.getElementById("logout-btn").onclick = () => { clearSession(); window.location.href = "/"; };

  const ta = document.getElementById("composer-input");
  const sendBtn = document.getElementById("send-btn");
  sendBtn.onclick = () => send(ta.value);
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(ta.value); } });
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 160) + "px"; });
  ta.focus();
}

document.addEventListener("DOMContentLoaded", setupChat);
```

---

## 0.9 — Inyectar Worker URL en cada HTML

En **cada HTML** que use `auth.js` o `chat.js`, agregar **antes** del `<script src="/assets/auth.js">`:

```html
<script>
  window.OC_WORKER_URL = "https://URL-WORKER-GBM.workers.dev";
</script>
<script src="/assets/auth.js"></script>
```

---

## 0.10 — Validar Fase 0 antes de continuar

1. `npx wrangler deploy` desde `worker/` — debe terminar sin errores
2. Push a GitHub → Netlify auto-deploya
3. Entrar al sitio → login con clave admin → debe entrar al chat
4. Hacer una pregunta → debe responder (ahora vía Worker → Anthropic)
5. Verificar en Cloudflare dashboard → Workers & Pages → oc-gbm → Logs que las requests llegan

**Si algo falla acá, diagnosticar antes de continuar.**

---

# FASE 1 · Port de features

---

## 1.1 — netlify.toml

Crear en la raíz del repo:

```toml
[build]
  publish = "."
  command = 'echo "{\"hash\":\"${COMMIT_REF:0:7}\",\"deployed_at\":\"$(date -u +%Y-%m-%d)\"}" > version.json'
```

Asegurarse de que `version.json` está en `.gitignore`.

---

## 1.2 — datamarts/changelog.json

Crear `datamarts/changelog.json` con la historia del OC GBM:

```json
{
  "last_updated": "2026-06-18",
  "data_owner": "RESPONSABLE GBM",
  "visibility": "todos",
  "proposito": "Bitácora de actualizaciones del OC GBM, versión a versión.",
  "convencion_versionado": "Semver pre-1.0 (0.X.Y)",
  "releases": [
    {
      "version": "0.2.0",
      "fecha": "2026-06-18",
      "titulo": "Migración a Cloudflare Worker + features de auditoría y agentización",
      "added": [
        "Cloudflare Worker como proxy seguro — API key fuera del browser",
        "Autenticación por password con tokens HMAC-SHA256 (12h)",
        "Log automático de queries en KV con historial consultable",
        "Feedback 👍/👎 por respuesta con cross-reference a query",
        "Capa agentic C4b: Cron Triggers + agente configurable",
        "feedback.html con 4 pestañas: Alertas, Feedback, Historial, Historia de Actualizaciones",
        "Prompt caching de Anthropic con 2 breakpoints",
        "Versión dinámica desde version.json generado en cada deploy de Netlify"
      ]
    },
    {
      "version": "0.1.0",
      "fecha": "FECHA_PRIMER_DEPLOY_GBM",
      "titulo": "Primer deploy del OC GBM",
      "added": [
        "Sitio estático en Netlify",
        "Chat reactivo con system prompt GBM"
      ]
    }
  ]
}
```

---

## 1.3 — feedback.html con 4 pestañas

Crear o reemplazar `feedback.html`. Ajustar `OC_WORKER_URL`, el nivel admin en el botón de disparar agente, y el `agent_id`:

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OC GBM · Insights de uso</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/assets/styles.css" />
  <meta name="robots" content="noindex, nofollow" />
</head>
<body>
  <div class="app">
    <div class="topbar">
      <div class="brand">
        <div class="brand-mark">GBM · OC</div>
        <div class="brand-title">Insights de uso</div>
      </div>
      <div class="session-info">
        <a class="logout-btn" href="/chat.html">Volver al chat</a>
      </div>
    </div>
    <div class="feedback-page">
      <div class="tabs">
        <button class="tab-btn active" data-tab="alerts">Alertas de agentes</button>
        <button class="tab-btn" data-tab="feedback">Feedback</button>
        <button class="tab-btn" data-tab="queries">Historial de consultas</button>
        <button class="tab-btn" data-tab="updates">Historia de Actualizaciones</button>
      </div>
      <div class="tab-panel active" id="tab-alerts">
        <p id="alerts-status" style="font-size:13px;color:var(--gris);">Cargando...</p>
        <div id="alerts-list"></div>
      </div>
      <div class="tab-panel" id="tab-feedback">
        <p id="feedback-status" style="font-size:13px;color:var(--gris);">Cargando...</p>
        <div id="feedback-list"></div>
      </div>
      <div class="tab-panel" id="tab-queries">
        <p id="queries-status" style="font-size:13px;color:var(--gris);">Cargando...</p>
        <div id="queries-list"></div>
      </div>
      <div class="tab-panel" id="tab-updates">
        <p id="updates-status" style="font-size:13px;color:var(--gris);">Cargando...</p>
        <div id="updates-list"></div>
      </div>
    </div>
  </div>

  <script>
    window.OC_WORKER_URL = "https://URL-WORKER-GBM.workers.dev"; // AJUSTAR
  </script>
  <script src="/assets/auth.js"></script>
  <script>
    const { getSession, WORKER_URL: FB_WORKER_URL } = window.OCAuth;
    const fmtDate = ts => new Date(ts).toLocaleString("es-AR");
    const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

    async function loadFeedback() {
      const session = getSession();
      const statusEl = document.getElementById("feedback-status");
      const listEl   = document.getElementById("feedback-list");
      try {
        const resp = await fetch(`${FB_WORKER_URL}/feedback`, { headers: { Authorization: `Bearer ${session.token}` } });
        if (resp.status === 401) { statusEl.textContent = "Sesión expirada."; return; }
        const { entries = [] } = await resp.json();
        if (!entries.length) { statusEl.textContent = "Sin feedback registrado aún."; return; }
        statusEl.textContent = `${entries.length} registro(s).`;
        listEl.innerHTML = entries.map(e => `
          <div class="feedback-entry">
            <div class="meta">
              <span class="vote-tag ${e.vote}">${e.vote==="up"?"👍 ok":"👎 mejorar"}</span>
              <span>${e.level}</span><span>${fmtDate(e.ts)}</span>
              ${e.query_id?`<span class="query-link" title="${esc(e.query_id)}">linked</span>`:""}
            </div>
            ${e.question?`<div class="q">Pregunta: ${esc(e.question)}</div>`:""}
            ${e.answer?`<div class="a">Respuesta: ${esc(e.answer).slice(0,400)}${e.answer.length>400?"…":""}</div>`:""}
            ${e.comment?`<div class="comment">"${esc(e.comment)}"</div>`:""}
          </div>`).join("");
      } catch(err) { statusEl.textContent = `Error: ${err.message}`; }
    }

    async function loadQueries() {
      const session = getSession();
      const statusEl = document.getElementById("queries-status");
      const listEl   = document.getElementById("queries-list");
      try {
        const resp = await fetch(`${FB_WORKER_URL}/queries`, { headers: { Authorization: `Bearer ${session.token}` } });
        if (resp.status === 401) { statusEl.textContent = "Sesión expirada."; return; }
        const data = await resp.json();
        const entries = data.entries || [];
        if (!entries.length) { statusEl.textContent = "Sin consultas registradas aún."; return; }
        const totalTokens = entries.reduce((a,e) => a+(e.usage?.input_tokens||0)+(e.usage?.output_tokens||0), 0);
        const cacheRead   = entries.reduce((a,e) => a+(e.usage?.cache_read_input_tokens||0), 0);
        const cachePct    = totalTokens > 0 ? Math.round((cacheRead/(totalTokens+cacheRead))*100) : 0;
        statusEl.innerHTML = `<strong>${entries.length}</strong> consulta(s) · tokens nuevos: <strong>${totalTokens.toLocaleString("es-AR")}</strong> · cache hit: <strong>${cachePct}%</strong>`;
        listEl.innerHTML = entries.map(e => {
          const u = e.usage||{};
          const tok = u.input_tokens!=null ? `<span class="tok">in:${u.input_tokens} · cache_read:${u.cache_read_input_tokens||0} · out:${u.output_tokens||0}</span>` : "";
          return `<details class="query-entry">
            <summary>
              <div class="query-summary-row">
                <span class="level-tag ${e.level}">${e.level}</span>
                <span class="query-date">${fmtDate(e.ts)}</span>${tok}
                ${e.answer_truncated?`<span class="trunc-tag">truncado</span>`:""}
              </div>
              <div class="query-question">${esc(e.question||"(sin pregunta)")}</div>
            </summary>
            <div class="query-details">
              <div class="query-answer">${esc(e.answer_preview||"")}</div>
              <div class="query-meta-row"><span class="mono">query_id: ${esc(e.query_id||"—")}</span></div>
            </div>
          </details>`;
        }).join("");
      } catch(err) { statusEl.textContent = `Error: ${err.message}`; }
    }

    function setupTabs() {
      document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const t = btn.dataset.tab;
          document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b===btn));
          document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id===`tab-${t}`));
        });
      });
    }

    async function loadUpdates() {
      const statusEl = document.getElementById("updates-status");
      const listEl   = document.getElementById("updates-list");
      try {
        const resp = await fetch("/datamarts/changelog.json", { cache: "no-store" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const { releases = [] } = await resp.json();
        if (!releases.length) { statusEl.textContent = "Sin releases registradas."; return; }
        statusEl.innerHTML = `<strong>${releases.length}</strong> release(s) · última: <strong>v${esc(releases[0].version)}</strong> (${esc(releases[0].fecha)})`;
        const sec = (label, cls, items) => !items?.length ? "" :
          `<div class="release-section ${cls}"><div class="release-section-label">${label}</div><ul>${items.map(it=>`<li>${esc(it)}</li>`).join("")}</ul></div>`;
        listEl.innerHTML = releases.map(r => `
          <div class="release-entry">
            <div class="release-header">
              <span class="release-version">v${esc(r.version)}</span>
              <span class="release-titulo">${esc(r.titulo||"")}</span>
              <span class="release-fecha mono">${esc(r.fecha||"")}</span>
            </div>
            ${sec("Added","added",r.added)}${sec("Changed","changed",r.changed)}
            ${sec("Fixed","fixed",r.fixed)}${sec("Removed","removed",r.removed)}
            ${r.notas?`<div class="release-notas">${esc(r.notas)}</div>`:""}
          </div>`).join("");
      } catch(err) { statusEl.textContent = `Error: ${err.message}`; }
    }

    async function loadAlerts() {
      const session = getSession();
      const statusEl = document.getElementById("alerts-status");
      const listEl   = document.getElementById("alerts-list");
      try {
        const resp = await fetch(`${FB_WORKER_URL}/alerts`, { headers: { Authorization: `Bearer ${session.token}` } });
        if (resp.status === 401) { statusEl.textContent = "Sesión expirada."; return; }
        const { entries = [] } = await resp.json();

        // AJUSTAR: "admin" → nivel admin real de GBM; "primer-agente-gbm" → agent_id real
        const runBtn = session.level === "admin"
          ? `<button class="run-agent-btn" id="run-agent-btn">Disparar agente ahora</button>` : "";

        statusEl.innerHTML = entries.length
          ? `<strong>${entries.length}</strong> alerta(s). ${runBtn}`
          : `Sin alertas generadas aún. ${runBtn}`;

        listEl.innerHTML = entries.map(e => {
          const itemsHtml = (e.items||[]).map(it => {
            const monto = it.monto_usd!=null ? `USD ${Number(it.monto_usd).toLocaleString("en-US",{minimumFractionDigits:2})}` : "";
            const nivelTag = it.nivel ? `<span class="alert-level-tag ${(it.nivel||'').toLowerCase()}">${esc(it.nivel)}</span>` : "";
            return `<div class="alert-item">
              <span class="alert-date mono">${esc(it.fecha||"")}</span>
              <div class="alert-item-body">
                <div class="alert-entidad">${esc(it.entidad||"")}</div>
                <div class="alert-obligacion">${esc(it.obligacion||"")}</div>
                ${monto?`<div class="alert-monto mono">${monto}</div>`:""}
              </div>${nivelTag}</div>`;
          }).join("");
          return `<div class="alert-entry">
            <div class="alert-header">
              <span class="agent-tag">${esc(e.agent_id)}</span>
              <span class="alert-titulo">${esc(e.titulo||"")}</span>
              <span class="alert-ts">${fmtDate(e.ts)}</span>
            </div>
            <div class="alert-items">${itemsHtml}</div>
          </div>`;
        }).join("");

        const btn = document.getElementById("run-agent-btn");
        if (btn) {
          btn.onclick = async () => {
            btn.disabled = true; btn.textContent = "Ejecutando...";
            try {
              await fetch(`${FB_WORKER_URL}/agents/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
                body: JSON.stringify({ agent_id: "primer-agente-gbm" }), // AJUSTAR
              });
              await loadAlerts();
            } catch(err) { btn.disabled = false; btn.textContent = `Error: ${err.message}`; }
          };
        }
      } catch(err) { statusEl.textContent = `Error: ${err.message}`; }
    }

    async function init() {
      const session = getSession();
      if (!session) { window.location.href = "/"; return; }
      setupTabs();
      await Promise.all([loadUpdates(), loadAlerts(), loadFeedback(), loadQueries()]);
    }

    document.addEventListener("DOMContentLoaded", init);
  </script>
</body>
</html>
```

---

## 1.4 — styles.css — clases nuevas

Agregar al final de `assets/styles.css` si estas clases no existen ya:

```css
/* ── Tabs ─────────────────────────────────────────────────── */
.feedback-page { padding: 24px; max-width: 900px; margin: 0 auto; }
.tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--crema2, #ebe4da); margin-bottom: 24px; flex-wrap: wrap; }
.tab-btn { background: none; border: none; padding: 10px 18px; font-family: inherit; font-size: 13px; font-weight: 500; color: var(--gris, #666); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: color .15s, border-color .15s; }
.tab-btn:hover { color: var(--negro, #1a1a1a); }
.tab-btn.active { color: var(--tc, #c94b1a); border-bottom-color: var(--tc, #c94b1a); }
.tab-panel { display: none; }
.tab-panel.active { display: block; }
/* ── Query entries ────────────────────────────────────────── */
.query-entry { border: 1px solid var(--crema2, #ebe4da); border-radius: 6px; margin-bottom: 8px; }
.query-entry summary { padding: 10px 14px; cursor: pointer; list-style: none; }
.query-summary-row { display: flex; gap: 10px; align-items: center; margin-bottom: 4px; flex-wrap: wrap; }
.level-tag { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; background: var(--crema2, #ebe4da); color: var(--gris, #666); }
.query-date { font-size: 12px; color: var(--gris, #666); }
.query-question { font-size: 13px; font-weight: 500; }
.query-details { padding: 10px 14px; border-top: 1px solid var(--crema2, #ebe4da); font-size: 12px; }
.query-answer { white-space: pre-wrap; color: var(--gris, #666); margin-bottom: 6px; }
.query-meta-row { color: var(--gris2, #999); }
.tok { font-family: monospace; font-size: 11px; color: var(--gris2, #999); }
.trunc-tag { font-size: 10px; background: #fff3cd; color: #856404; padding: 1px 6px; border-radius: 10px; }
/* ── Alert entries ────────────────────────────────────────── */
.alert-entry { border: 1px solid var(--crema2, #ebe4da); border-radius: 6px; margin-bottom: 12px; overflow: hidden; }
.alert-header { display: flex; gap: 10px; align-items: baseline; padding: 10px 14px; background: var(--crema, #f5f0eb); flex-wrap: wrap; }
.agent-tag { font-size: 11px; font-weight: 600; background: var(--tc, #c94b1a); color: #fff; padding: 2px 8px; border-radius: 10px; }
.alert-titulo { font-size: 13px; font-weight: 500; flex: 1; }
.alert-ts { font-size: 11px; color: var(--gris, #666); }
.alert-items { padding: 10px 14px; display: flex; flex-direction: column; gap: 8px; }
.alert-item { display: flex; gap: 10px; align-items: flex-start; }
.alert-date { font-family: monospace; font-size: 12px; color: var(--gris, #666); min-width: 90px; }
.alert-item-body { flex: 1; }
.alert-entidad { font-size: 12px; font-weight: 600; }
.alert-obligacion { font-size: 12px; color: var(--gris, #666); }
.alert-monto { font-family: monospace; font-size: 12px; }
.alert-level-tag { font-size: 10px; padding: 2px 6px; border-radius: 10px; font-weight: 600; }
.alert-level-tag.crítico { background: #f8d7da; color: #721c24; }
.alert-level-tag.urgente { background: #fff3cd; color: #856404; }
.alert-level-tag.alto { background: #d1ecf1; color: #0c5460; }
.run-agent-btn { margin-left: 12px; padding: 4px 12px; background: var(--tc, #c94b1a); color: #fff; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; font-family: inherit; }
.run-agent-btn:hover { opacity: 0.85; }
.run-agent-btn:disabled { opacity: 0.5; cursor: not-allowed; }
/* ── Release entries ──────────────────────────────────────── */
.release-entry { border: 1px solid var(--crema2, #ebe4da); border-radius: 6px; margin-bottom: 16px; overflow: hidden; }
.release-header { display: flex; gap: 12px; align-items: baseline; padding: 12px 16px; background: var(--crema, #f5f0eb); flex-wrap: wrap; }
.release-version { font-size: 13px; font-weight: 700; background: var(--tc, #c94b1a); color: #fff; padding: 2px 10px; border-radius: 12px; }
.release-titulo { font-size: 14px; font-weight: 600; flex: 1; }
.release-fecha { font-size: 12px; color: var(--gris, #666); }
.release-section { padding: 8px 16px; }
.release-section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
.release-section.added   .release-section-label { color: #198754; }
.release-section.changed .release-section-label { color: #0c5460; }
.release-section.fixed   .release-section-label { color: #856404; }
.release-section.removed .release-section-label { color: #721c24; }
.release-section ul { margin: 0; padding-left: 18px; }
.release-section li { font-size: 13px; margin-bottom: 2px; }
.release-notas { padding: 8px 16px; font-size: 12px; color: var(--gris, #666); font-style: italic; }
.mono { font-family: monospace; }
```

---

## Checklist final

**Prerequisitos:**
- [ ] Cuenta de Cloudflare creada
- [ ] `npm install --save-dev wrangler` en el repo
- [ ] `npx wrangler login` — autenticado con la cuenta de CF
- [ ] `npx wrangler whoami` muestra el email correcto

**Fase 0 — Worker:**
- [ ] `worker/` creado con `worker.js` y `wrangler.toml`
- [ ] KV namespace creado con `wrangler kv namespace create FEEDBACK_KV`
- [ ] `id` del KV pegado en `wrangler.toml`
- [ ] Secrets configurados con `wrangler secret put` (API key, passwords, SESSION_SECRET)
- [ ] `npx wrangler deploy` exitoso — anotar la Worker URL
- [ ] `assets/auth.js` reemplazado con versión IIFE + Worker URL correcta
- [ ] `assets/chat.js` reemplazado con versión que llama al Worker
- [ ] `window.OC_WORKER_URL` inyectado en todos los HTMLs
- [ ] Login funciona y chat responde vía Worker ✓

**Fase 1 — Features:**
- [ ] `netlify.toml` creado con build command para `version.json`
- [ ] `version.json` en `.gitignore`
- [ ] `datamarts/changelog.json` creado con historia de GBM
- [ ] `feedback.html` creado/reemplazado con 4 pestañas
- [ ] Clases CSS agregadas a `styles.css`
- [ ] Git push → Netlify deploy → las 4 pestañas cargan
- [ ] Click en "Disparar agente" → aparece alerta → infra C4b validada ✓
