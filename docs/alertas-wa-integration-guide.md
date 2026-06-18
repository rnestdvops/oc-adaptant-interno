# Guía de integración: Alertas de agentes + CTA WhatsApp
## Para replicar en otro Organizational Commons (misma arquitectura Netlify + Cloudflare + KV)

---

## Qué hace este sistema

1. **Agentes autónomos** corren en el Worker de Cloudflare (a mano o por cron) y guardan alertas en KV
2. **Sidebar derecho** en el chat muestra las alertas CRÍTICO/URGENTE de la última corrida, permanentemente visible
3. **CTA por alerta**: botón WA en cada card que abre WhatsApp Web con el mensaje pre-redactado y un link de vuelta al Commons con la pregunta pre-cargada
4. **Auto-envío**: cuando el destinatario abre el link del Commons, la pregunta se envía sola al chat

---

## Parte 1 — Worker (Cloudflare)

### 1.1 Variables de entorno requeridas

Las mismas que ya tenés + asegurate de tener el KV binding correcto (uno por instancia).

```
ANTHROPIC_API_KEY=...
PWD_ADMIN=...
PWD_USUARIO=...
SESSION_SECRET=...
SITE_BASE=https://tu-instancia.netlify.app
```

### 1.2 Constantes CORS — agregar DELETE

```javascript
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",  // ← DELETE es nuevo
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};
```

### 1.3 Endpoint GET /alerts

```javascript
async function handleAlertsList(request, env) {
  const payload = await requireAuth(request, env);
  if (!payload) return new Response(JSON.stringify({ error: "Sin token" }), {
    status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

  const list = await env.FEEDBACK_KV.list({ prefix: "alert:" });
  const entries = await Promise.all(
    list.keys.map(async (k) => {
      const raw = await env.FEEDBACK_KV.get(k.name);
      return raw ? { ...JSON.parse(raw), _key: k.name } : null;
    })
  );
  const sorted = entries.filter(Boolean).sort((a, b) => b.ts - a.ts);
  return new Response(JSON.stringify({ entries: sorted, total: sorted.length }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
```

### 1.4 Endpoint DELETE /alerts (limpiar KV)

```javascript
async function handleAlertsDelete(request, env) {
  const payload = await requireAuth(request, env);
  if (!payload || payload.level !== "admin") {
    return new Response(JSON.stringify({ error: "Solo admin puede limpiar alertas" }), {
      status: 403, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
  const list = await env.FEEDBACK_KV.list({ prefix: "alert:" });
  await Promise.all(list.keys.map(k => env.FEEDBACK_KV.delete(k.name)));
  return new Response(JSON.stringify({ ok: true, deleted: list.keys.length }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
```

### 1.5 Helpers de agentes

```javascript
async function callClaudeForAgent(env, { systemText, userText, tools = [] }) {
  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: systemText,
    messages: [{ role: "user", content: userText }],
  };
  if (tools.length) body.tools = tools;
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${data?.error?.message}`);
  return data;
}

function extractAgentJSON(text) {
  const cb = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (cb) { try { return JSON.parse(cb[1].trim()); } catch (_) {} }
  const inline = text.match(/\{[\s\S]*\}/);
  if (inline) { try { return JSON.parse(inline[0]); } catch (_) {} }
  return null;
}

async function fetchSystemPromptText(env) {
  const base = env.SITE_BASE || "https://tu-instancia.netlify.app";
  const r = await fetch(`${base}/system_prompts/sistema.md`);
  if (!r.ok) throw new Error(`No se pudo cargar system prompt (${r.status})`);
  return await r.text();
}

async function saveAlert(env, alert) {
  await env.FEEDBACK_KV.put(
    `alert:${alert.ts}:${alert.agent_id}:${crypto.randomUUID()}`,
    JSON.stringify(alert)
  );
}
```

### 1.6 Estructura del JSON que deben generar los agentes

Cada agente debe responder con este esquema. El campo `responsables` es clave para los CTAs.

```json
{
  "titulo": "Descripción del agente — 2026-06-18",
  "items": [
    {
      "entidad": "Nombre del cliente o entidad",
      "obligacion": "Descripción concreta de la alerta o acción requerida",
      "nivel": "CRÍTICO",
      "fecha": "2026-06-18",
      "monto_usd": 150000,
      "responsables": [
        { "nombre": "Nombre Apellido", "rol": "AE" },
        { "nombre": "Nombre Apellido", "rol": "SE" }
      ]
    }
  ]
}
```

**Niveles válidos:** `CRÍTICO` · `URGENTE` · `ALTO`  
El sidebar solo muestra CRÍTICO y URGENTE. Los tres se guardan en KV y se ven en el panel de administración.

### 1.7 Ejemplo de agente — adaptalo a tu contexto

```javascript
async function runAgenteEjemplo(env) {
  const ts = Date.now();
  const today = new Date(ts).toISOString().slice(0, 10);
  try {
    const systemText = await fetchSystemPromptText(env);
    const data = await callClaudeForAgent(env, {
      systemText,
      userText: `Sos un agente de [TU CONTEXTO]. Identificá las [SITUACIONES] más críticas.

Criterios:
- CRÍTICO: [definición]
- URGENTE: [definición]

Para cada item, incluí 1-2 responsables usando los nombres EXACTOS de [TU TABLA DE PERSONAS].
El responsable principal va primero.

Respondé ÚNICAMENTE con un objeto JSON válido sin texto adicional ni markdown:
{"titulo":"[Tipo de alerta] — ${today}","items":[{"entidad":"nombre","obligacion":"descripción concreta","nivel":"CRÍTICO|URGENTE|ALTO","fecha":"${today}","responsables":[{"nombre":"Nombre Apellido","rol":"ROL"}]}]}`,
    });
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const parsed = extractAgentJSON(text);
    await saveAlert(env, {
      agent_id: "tu-agente-id",
      ts,
      titulo: parsed?.titulo || `[Alerta] — ${today}`,
      items: (parsed?.items || []).slice(0, 20),
    });
  } catch (e) {
    await saveAlert(env, { agent_id: "tu-agente-id", ts, titulo: `Error: ${e.message}`, items: [] });
  }
}
```

### 1.8 Endpoint POST /agents/run

```javascript
async function handleAgentRun(request, env, ctx) {
  const payload = await requireAuth(request, env);
  if (!payload || payload.level !== "admin") {
    return new Response(JSON.stringify({ error: "Solo admin puede disparar agentes" }), {
      status: 403, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
  const body = await request.json();
  const { agent_id } = body || {};

  const agentes = {
    "todos":          () => Promise.all([runAgenteEjemplo(env) /*, más agentes */]),
    "tu-agente-id":   runAgenteEjemplo,
    // agregar más agentes acá
  };

  const fn = agentes[agent_id];
  if (!fn) return new Response(JSON.stringify({ error: `Agente desconocido: ${agent_id}` }), {
    status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

  ctx.waitUntil(fn(env));  // responde inmediato, corre en background
  return new Response(JSON.stringify({ ok: true, agent_id, queued_at: Date.now() }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
```

### 1.9 Cron diario (opcional)

```javascript
// En wrangler.toml:
// [triggers]
// crons = ["0 11 * * *"]

async function dispatchScheduled(event, env) {
  if (event.cron === "0 11 * * *") {
    await Promise.all([runAgenteEjemplo(env)]);
  }
}

export default {
  async fetch(request, env, ctx) { /* ... router ... */ },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dispatchScheduled(event, env));
  },
};
```

### 1.10 Router — rutas a agregar

```javascript
if (url.pathname === "/alerts" && request.method === "GET")
  return handleAlertsList(request, env);

if (url.pathname === "/alerts" && request.method === "DELETE")
  return handleAlertsDelete(request, env);

if (url.pathname === "/agents/run" && request.method === "POST")
  return handleAgentRun(request, env, ctx);
```

---

## Parte 2 — Frontend (demo.html / chat principal)

### 2.1 CSS a agregar en `<style>`

```css
/* ALERT SIDEBAR */
.alert-sidebar{width:260px;min-width:260px;background:var(--surface);border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;transition:width 0.2s ease,min-width 0.2s ease}
.alert-sidebar.collapsed{width:36px;min-width:36px}
.alert-sidebar-hdr{padding:14px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;cursor:pointer;flex-shrink:0;user-select:none}
.alert-sidebar-title{font-family:'DM Mono',monospace;font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;white-space:nowrap;overflow:hidden;flex:1}
.alert-sidebar-toggle{font-size:10px;color:var(--muted);flex-shrink:0}
.alert-sidebar-body{flex:1;overflow-y:auto;padding:8px 0}
.alert-sidebar-body::-webkit-scrollbar{width:3px}
.alert-sidebar-body::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
.alert-mini{padding:10px 12px;border-bottom:1px solid var(--border)}
.alert-mini-agent{font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:3px}
.alert-mini-entidad{font-size:12px;font-weight:600;color:var(--text);margin-bottom:2px}
.alert-mini-obligacion{font-size:11px;color:var(--muted);line-height:1.4;margin-bottom:5px}
.nivel-badge{font-family:'DM Mono',monospace;font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;letter-spacing:0.06em}
.nivel-badge.critico{background:rgba(233,69,96,0.15);color:var(--accent)}
.nivel-badge.urgente{background:rgba(245,166,35,0.15);color:#F5A623}
.alert-sidebar-empty{padding:20px 12px;font-size:11px;color:var(--muted);text-align:center;line-height:1.6}
.alert-sidebar-ftr{padding:8px 12px;border-top:1px solid var(--border);font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);flex-shrink:0}
@media(max-width:768px){.alert-sidebar{display:none}}

/* RESPONSABLES CTA */
.alert-mini-resp{margin-top:7px;padding-top:7px;border-top:1px solid var(--border)}
.resp-row{display:flex;align-items:center;gap:4px;margin-bottom:3px}
.resp-name{font-size:10px;color:var(--text);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.resp-rol{font-family:'DM Mono',monospace;font-size:9px;color:var(--muted)}
.resp-actions{display:flex;gap:3px;flex-shrink:0}
.cta-btn{font-family:'DM Mono',monospace;font-size:9px;padding:2px 6px;border-radius:3px;border:1px solid;background:transparent;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;transition:all 0.15s;white-space:nowrap;line-height:1.4}
.cta-btn.email{color:var(--accent2);border-color:rgba(74,158,255,0.25)}
.cta-btn.email:hover{background:rgba(74,158,255,0.08);border-color:rgba(74,158,255,0.5);text-decoration:none}
.cta-btn.wa{color:var(--accent3);border-color:rgba(68,217,162,0.25)}
.cta-btn.wa:hover{background:rgba(68,217,162,0.08);border-color:rgba(68,217,162,0.5);text-decoration:none}
```

### 2.2 Constantes JS (dentro del bloque Babel, al inicio)

```javascript
// Número WA de demo — todos los botones WA apuntan acá hasta configurar números reales
const DEMO_WA = '506XXXXXXXX';  // ← reemplazar con el número de tu equipo (sin + ni espacios)

const TEAM_CONTACTS = {
  // Nombre exacto como aparece en FACT_Maestrias_Personas → email + wa
  // wa: todos apuntan a DEMO_WA hasta configurar números reales por persona
  "Nombre Apellido": { email: "nombre.apellido@tuempresa.com", wa: DEMO_WA },
  // ... completar con el equipo
};
```

### 2.3 Componente React `AlertSidebar`

Pegar antes de `function App()`:

```jsx
function AlertSidebar() {
  const [items, setItems] = React.useState([]);
  const [collapsed, setCollapsed] = React.useState(false);
  const [lastRun, setLastRun] = React.useState(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    const token = sessionStorage.getItem('oc_token');
    if (!token) { setLoaded(true); return; }
    fetch(`${WORKER_URL}/alerts`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(r => r.ok ? r.json() : { entries: [] })
    .then(data => {
      const entries = data.entries || [];
      // Más reciente por agente
      const latestByAgent = {};
      entries.forEach(e => {
        if (!latestByAgent[e.agent_id] || e.ts > latestByAgent[e.agent_id].ts)
          latestByAgent[e.agent_id] = e;
      });
      // Solo CRÍTICO y URGENTE
      const urgent = [];
      let maxTs = 0;
      Object.values(latestByAgent).forEach(e => {
        if (e.ts > maxTs) maxTs = e.ts;
        (e.items || [])
          .filter(it => it.nivel === 'CRÍTICO' || it.nivel === 'URGENTE')
          .forEach(it => urgent.push({ ...it, agent_id: e.agent_id }));
      });
      // CRÍTICO primero
      urgent.sort((a, b) => (a.nivel === 'CRÍTICO' && b.nivel !== 'CRÍTICO') ? -1 : 1);
      setItems(urgent);
      if (maxTs) setLastRun(new Date(maxTs).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }));
    })
    .catch(() => {})
    .finally(() => setLoaded(true));
  }, []);

  if (!loaded || (items.length === 0 && !lastRun)) return null;

  // Etiqueta corta por agent_id — personalizar según tus agentes
  const agentShort = id => ({
    'pipeline-riesgo': 'PIPELINE',
    'cross-sell': 'CROSS-SELL',
    'sicop-gobierno': 'SICOP',
    // agregar los tuyos
  })[id] || id.toUpperCase();

  const buildMailto = (r, it) => {
    const subj = encodeURIComponent(`⚠ ${it.nivel} OC: ${it.entidad}`);
    const body = encodeURIComponent(`Hola ${r.nombre},\n\nEl Organizational Commons detectó la siguiente alerta:\n\n• Cliente: ${it.entidad}\n• Situación: ${it.obligacion}\n• Nivel: ${it.nivel}\n\nPor favor tomá acción lo antes posible.\n\nSaludos,\nOC`);
    return `mailto:${TEAM_CONTACTS[r.nombre]?.email}?subject=${subj}&body=${body}`;
  };

  const buildWAMsg = (it, nombre) => {
    const pregunta = `¿Cuál es el estado actual de ${it.entidad} y qué deberíamos hacer ahora? Contexto: ${it.obligacion}`;
    const commonsUrl = `${window.location.origin}/demo.html?q=${encodeURIComponent(pregunta)}`;
    return encodeURIComponent(
      `⚠ *${it.nivel} — OC*\n\n` +
      `*Cliente:* ${it.entidad}\n` +
      `*Alerta:* ${it.obligacion}` +
      (it.fecha ? `\n*Fecha:* ${it.fecha}` : '') +
      (it.monto_usd ? `\n*Monto estimado:* USD ${Number(it.monto_usd).toLocaleString('en-US')}` : '') +
      (nombre ? `\n\nHola ${nombre}, el OC solicita tu atención urgente.` : `\n\nPor favor revisá con urgencia.`) +
      `\n\n🔗 Consultá el Commons:\n${commonsUrl}`
    );
  };

  const buildWA = (it, nombre) =>
    `https://web.whatsapp.com/send?phone=${DEMO_WA}&text=${buildWAMsg(it, nombre)}`;

  return (
    <div className={`alert-sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="alert-sidebar-hdr" onClick={() => setCollapsed(c => !c)}>
        {!collapsed && (
          <>
            <span className="alert-sidebar-title" style={{color:'var(--accent)'}}>
              Atención especial<span style={{color:'var(--muted)',fontWeight:400}}> (Agente)</span>
            </span>
            {items.length > 0 && (
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:'9px',background:'rgba(233,69,96,0.15)',color:'var(--accent)',padding:'1px 6px',borderRadius:'3px',flexShrink:0,marginLeft:'4px'}}>
                {items.length}
              </span>
            )}
          </>
        )}
        <span className="alert-sidebar-toggle">{collapsed ? '◁' : '▷'}</span>
      </div>
      {!collapsed && (
        <>
          <div className="alert-sidebar-body">
            {items.length === 0 ? (
              <div className="alert-sidebar-empty">Sin alertas urgentes en la última corrida.</div>
            ) : items.map((it, i) => (
              <div key={i} className="alert-mini">
                <div className="alert-mini-agent">{agentShort(it.agent_id)}</div>
                <div className="alert-mini-entidad">{it.entidad}</div>
                <div className="alert-mini-obligacion">{it.obligacion}</div>
                <div style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'5px',flexWrap:'wrap'}}>
                  <span className={`nivel-badge ${it.nivel === 'CRÍTICO' ? 'critico' : 'urgente'}`}>{it.nivel}</span>
                  <a href={buildWA(it)} className="cta-btn wa" target="_blank" rel="noreferrer">WA ↗</a>
                </div>
                {it.responsables?.length > 0 && (
                  <div className="alert-mini-resp">
                    {it.responsables.map((r, j) => {
                      const contact = TEAM_CONTACTS[r.nombre];
                      return (
                        <div key={j} className="resp-row">
                          <span className="resp-name">
                            {r.nombre}<span className="resp-rol"> {r.rol}</span>
                          </span>
                          <div className="resp-actions">
                            {contact?.email && (
                              <a href={buildMailto(r, it)} className="cta-btn email" title={`Mail a ${r.nombre}`}>✉</a>
                            )}
                            <a href={buildWA(it, r.nombre)} className="cta-btn wa" target="_blank" rel="noreferrer" title={`WA a ${r.nombre}`}>WA</a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
          {lastRun && <div className="alert-sidebar-ftr">corrida: {lastRun}</div>}
        </>
      )}
    </div>
  );
}
```

### 2.4 Montar el sidebar en el App

En el JSX del `App`, dentro de `<div className="app">`, después del bloque `.main`:

```jsx
<div className="app">
  <div className="sidebar">...</div>
  <div className="main">...</div>

  {/* ALERT SIDEBAR (derecha) */}
  <AlertSidebar />
</div>
```

### 2.5 Auto-envío de `?q=` — agregar en App

Dentro de `function App()`, después de los `useEffect` existentes:

```javascript
// Auto-envío si viene con ?q= en la URL (desde link de WA)
useEffect(() => {
  if (!isSetup) return;
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q');
  if (!q) return;
  window.history.replaceState({}, '', window.location.pathname); // limpiar URL
  setTimeout(() => sendMessage(q.trim()), 400);
}, [isSetup]);
```

---

## Parte 3 — Panel de administración (feedback.html)

### 3.1 Botones de agentes

```javascript
const AGENTES = [
  { id: "todos",          label: "▶ Disparar todos" },
  { id: "tu-agente-id",  label: "Nombre del agente" },
  // agregar más
];
```

### 3.2 Botón limpiar alertas (admin only)

```javascript
// En loadAlerts(), después de generar agenteBtns:
const limpiarBtn = session.level === "admin"
  ? `<button id="clear-alerts-btn" class="run-agent-btn" style="background:transparent;color:var(--muted);border-color:rgba(233,69,96,0.3);margin-left:12px">🗑 Limpiar alertas</button>`
  : "";

// Handler:
const clearBtn = document.getElementById("clear-alerts-btn");
if (clearBtn) {
  clearBtn.onclick = async () => {
    if (!confirm("¿Limpiar todas las alertas del KV?")) return;
    clearBtn.disabled = true;
    clearBtn.textContent = "Limpiando...";
    try {
      const resp = await fetch(`${WORKER_URL}/alerts`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = await resp.json();
      clearBtn.textContent = `✓ ${data.deleted || 0} alertas eliminadas`;
      setTimeout(() => loadAlerts(), 1500);
    } catch (err) {
      clearBtn.textContent = `Error: ${err.message}`;
      clearBtn.disabled = false;
    }
  };
}
```

---

## Parte 4 — Flujo operativo

### Primer setup
1. Definir los agentes y sus criterios CRÍTICO/URGENTE
2. Completar `TEAM_CONTACTS` con el equipo (emails reales, WA = número demo hasta tener los reales)
3. Deplegar Worker con las nuevas rutas
4. Limpiar alertas viejas del KV si las hay (botón 🗑)
5. Disparar agentes y verificar que el JSON incluye `responsables[]`

### Flujo diario
```
Cron 11:00 UTC → agentes corren en background
→ guardan alertas en KV con responsables[]
→ sidebar del chat muestra CRÍTICO/URGENTE al iniciar sesión
→ click WA ↗ → WhatsApp Web con mensaje + link al Commons
→ destinatario abre link → pregunta se envía sola al chat
```

### Troubleshooting frecuente

| Síntoma | Causa probable | Fix |
|---|---|---|
| WA button no aparece en CRÍTICO | Alertas viejas sin `responsables[]` | Limpiar KV y correr agentes de nuevo |
| "Failed to fetch" al limpiar | DELETE no estaba en CORS | Agregar DELETE a `Access-Control-Allow-Methods` |
| Agentes corren pero no hay responsables | Claude no sigue el formato JSON | Ser más explícito en el prompt: "nombres EXACTOS de [tabla]" |
| ?q= no auto-envía | `sendMessage` no está definida cuando dispara el useEffect | Verificar que el `useEffect` está dentro del App, después de definir `sendMessage` |
| WA abre app móvil en vez de web | URL usa `wa.me` en vez de `web.whatsapp.com` | Usar `https://web.whatsapp.com/send?phone=NUMBER&text=MSG` |

---

## Checklist de implementación

- [ ] `DELETE` en `CORS_HEADERS` del Worker
- [ ] `handleAlertsList` (GET /alerts)
- [ ] `handleAlertsDelete` (DELETE /alerts)
- [ ] `handleAgentRun` (POST /agents/run) con `ctx.waitUntil`
- [ ] Al menos un agente que genere JSON con `responsables[]`
- [ ] Cron configurado en wrangler.toml (opcional)
- [ ] CSS del sidebar en el HTML
- [ ] `DEMO_WA` con número real del equipo
- [ ] `TEAM_CONTACTS` con el equipo
- [ ] Componente `<AlertSidebar />` montado en el App
- [ ] `useEffect` para auto-envío de `?q=`
- [ ] Botones de agentes en feedback.html
- [ ] Botón 🗑 Limpiar alertas en feedback.html
