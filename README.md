# OC Adaptant Interno

Organizational Commons interno del grupo **BHP SA · Adaptant SAS · d-Vops LLC** — capa conversacional con IA sobre la información societaria, fiscal, financiera y estratégica del grupo.

Tres niveles de acceso (socios, asesores, inversores) con SYSTEM_PROMPT y datamarts diferenciados por nivel. Sitio estático en Netlify + proxy de API en Cloudflare Workers.

---

## Arquitectura en una imagen

```
Browser → Netlify (sitio estático)
              ↓ POST /chat con token
         Cloudflare Worker (proxy)
              ↓ valida token, arma SYSTEM_PROMPT por nivel
         API Anthropic (Claude + web_search)
```

La API key de Anthropic **nunca está del lado cliente**. Vive como secret del Worker.

---

## Estructura del repo

Ver `CLAUDE.md` para convenciones completas.

```
/
├── index.html              Login
├── chat.html               Chat principal
├── assets/                 CSS + JS del frontend
├── datamarts/              JSON estructurado por dominio
├── system_prompts/         Capas del SYSTEM_PROMPT
├── worker/                 Cloudflare Worker (proxy + auth)
├── CLAUDE.md               Convenciones del repo
└── README.md               Este archivo
```

---

## Setup en 8 pasos

### 1 · Repositorio en Git

```bash
cd oc-adaptant-interno
git init
git add .
git commit -m "init: OC Adaptant Interno v0"
gh repo create oc-adaptant-interno --private --source=. --push
```

### 2 · Cuenta en Cloudflare (gratis)

Crear cuenta en https://dash.cloudflare.com si no tenés.

Instalar wrangler:

```bash
npm install -g wrangler
wrangler login
```

### 3 · Configurar secrets del Worker

```bash
cd worker

# Anthropic API key (de console.anthropic.com)
wrangler secret put ANTHROPIC_API_KEY

# Passwords de los tres niveles (elegí los que quieras)
wrangler secret put PWD_SOCIOS
wrangler secret put PWD_ASESORES
wrangler secret put PWD_INVERSORES

# Secret para firmar tokens de sesión (cualquier string largo y aleatorio)
wrangler secret put SESSION_SECRET
```

### 4 · Deploy del Worker

```bash
cd worker
wrangler deploy
```

Anotá la URL que devuelve: algo como `https://oc-adaptant-interno.YOURNAME.workers.dev`.

### 5 · Cuenta en Netlify

Crear cuenta en https://app.netlify.com — conectar con el repo de GitHub.

En Netlify:

- **Repo:** `oc-adaptant-interno`
- **Branch:** `main`
- **Build command:** (vacío)
- **Publish directory:** `/` (raíz)
- **Auto-deploy:** habilitado

### 6 · Actualizar URL del Worker en el frontend

Editar en **dos lugares** la URL del Worker:

- `index.html` línea con `window.OC_WORKER_URL = ...`
- `chat.html` línea con `window.OC_WORKER_URL = ...`

Reemplazar `oc-adaptant-interno.YOURNAME.workers.dev` por la URL real.

Commit y push. Netlify redeploya solo.

### 7 · Actualizar SITE_BASE en el Worker

Editar `worker/wrangler.toml`:

```toml
[vars]
SITE_BASE = "https://TU-SITIO.netlify.app"
```

Redesplegar:

```bash
cd worker
wrangler deploy
```

### 8 · Verificar

Entrar a la URL de Netlify, probar cada password, hacer una pregunta de prueba en cada nivel.

---

## Actualización del datamart

Los archivos `datamarts/*.json` son la fuente de verdad operativa. Cada vez que cambia un dato relevante:

1. Editar el JSON correspondiente.
2. Actualizar el campo `last_updated` con la fecha de hoy.
3. Commit con formato: `data(<datamart>): <cambio> [<fecha>]`.
4. Push. Netlify redeploya automáticamente. El Worker tomará el JSON nuevo en la próxima consulta.

**Ejemplo:**

```bash
# Después de pagar la cuota Moroni
vim datamarts/deuda_privada.json
# cambiar estado del período 8 a "pagado"
git add datamarts/deuda_privada.json
git commit -m "data(deuda_privada): Moroni período 8 pagado [16/06/2026]"
git push
```

---

## Actualización del SYSTEM_PROMPT

Cuando cambia algo del briefing maestro, de la estrategia, o de las reglas de privacidad:

1. Editar el `.md` correspondiente en `system_prompts/`.
2. Commit con formato: `prompt(<capa>): <cambio>`.
3. Push.

---

## Costos operativos

| Servicio | Costo mensual |
|---|---|
| Netlify (sitio estático, plan free) | $0 |
| Cloudflare Workers (free tier: 100k requests/día) | $0 |
| API Anthropic (uso variable, Sonnet 4.6) | ~$10-40/mes según volumen |
| **Total estimado** | **$10-40/mes** |

---

## Seguridad

- API key de Anthropic: solo como secret del Worker, nunca expuesta.
- Passwords: solo como secrets del Worker.
- Tokens de sesión: firmados con HMAC-SHA256, expiran a las 12 horas.
- Browser storage: solo `sessionStorage` (se borra al cerrar pestaña).
- HTTPS: forzado por Netlify y Cloudflare.

**Lo que NO está implementado y conviene sumar si crece el uso:**

- Rate limiting por IP en el Worker.
- Logs de uso (quién consultó qué) — útil para auditoría.
- Rotación periódica de passwords y `SESSION_SECRET`.
- IP allowlist opcional para nivel socios.

---

## Roadmap inmediato

| Próximo | Detalle |
|---|---|
| Cargar suscripciones SaaS | `datamarts/adaptant_sas.json` — `costos_operativos_mensuales` |
| Cargar extractos d-Vops | `datamarts/dvops_llc.json` — ingresos, clientes, transferencias |
| Cargar pipeline Adaptant | proyectos potenciales y confirmados |
| Cash flow proyectado | derivar de pipeline + costos + compromisos |
| Briefing semanal automático | endpoint del Worker que genera un resumen Word descargable |

---

## Convenciones de commit

| Prefijo | Uso |
|---|---|
| `data(<archivo>):` | Cambio en un datamart |
| `prompt(<capa>):` | Cambio en un system prompt |
| `feat:` | Funcionalidad nueva |
| `fix:` | Corrección de bug |
| `refactor:` | Cambio de código sin cambio funcional |
| `docs:` | Cambio en README / CLAUDE.md / docs/* |

---

## Documentación relacionada

- `CLAUDE.md` — convenciones del repo, contrato para agentes de coding.
- `docs/ARQUITECTURA_v1.0.md` — documento de línea base del sistema al primer despliegue (junio 2026). Versión Word en `docs/ARQUITECTURA_v1.0.docx`.

---

*Versión 0.1 · Junio 2026 · Confidencial — Adaptant Studio*
