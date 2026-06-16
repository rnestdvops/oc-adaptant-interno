# ARQUITECTURA · OC Interno Adaptant · v1.0

**Versión:** 1.0
**Fecha:** Junio 2026
**Commit base:** b014deb
**Documento:** línea base del sistema al momento del primer despliegue

---

## 1 · Qué es el OC Interno

El Organizational Commons (OC) Interno es una capa conversacional con IA sobre la información societaria, fiscal, financiera y estratégica del grupo. **No es un dashboard, no es un ERP, no es un buscador de documentos.**

Es una memoria operativa compartida que sabe el contexto completo y permite hacer preguntas en lenguaje natural, recibir respuestas verificadas con fuente y fecha, y derivar al asesor correspondiente cuando la pregunta requiere juicio profesional.

### Principios de diseño

- **Privacidad por naturaleza:** la información restringida no entra al contexto del modelo — no se trata de decirle que no diga algo.
- **Honestidad temporal:** toda respuesta indica la fecha del dato, no solo el dato.
- **Cero API key en el navegador:** el cliente nunca toca Anthropic directamente.

---

## 2 · Stack tecnológico

| Componente | Tecnología | Justificación |
|---|---|---|
| Sitio estático | HTML/CSS/JS · Netlify | Sin build step, deploy automático en cada push a main |
| Proxy + auth | Cloudflare Worker | API key segura en servidor, web search habilitado, $0/mes en uso normal |
| Modelo | claude-sonnet-4-6 (4096 tokens) | Calidad de razonamiento + tool web_search_20250305 nativa |
| Datamarts | JSON estático en `/datamarts/` | Versionados en Git, editables a mano o por script |
| Feedback | Cloudflare KV (`FEEDBACK_KV`) | Sin base de datos, serverless, mismo proveedor que el Worker |
| Versionado | `version.json` generado en build | Hash corto visible en la UI con `$COMMIT_REF` de Netlify |

---

## 3 · Estructura del repositorio

*Repo: `github.com/rnestdvops/oc-adaptant-interno`*

```
/
├── index.html              Login (único punto de entrada)
├── chat.html               Interfaz de chat (post-login)
├── feedback.html           Vista de feedback acumulado
│
├── assets/
│   ├── styles.css          Tokens de marca Adaptant + componentes UI
│   ├── auth.js             Login, sesión, sugeridas por nivel (IIFE)
│   └── chat.js             Chat, thumbs, versión, envío de feedback
│
├── datamarts/              JSONs con datos del grupo
│   ├── entidades.json
│   ├── deuda_arca.json     (socios/asesores only)
│   ├── deuda_privada.json  (socios/asesores only)
│   ├── vencimientos.json   (socios/asesores only)
│   ├── adaptant_sas.json
│   ├── dvops_llc.json      (socios/asesores only)
│   ├── cash_flow.json
│   ├── costos_operativos.json
│   ├── personal.json
│   └── nerdcube_legacy.json
│
├── system_prompts/
│   ├── 00_personalidad.md
│   ├── 01_briefing_completo.md
│   ├── 02_datamart_guide.md
│   ├── 03_vista_inversor.md
│   └── 04_modelo_privacidad.md
│
├── worker/
│   ├── worker.js           Cloudflare Worker
│   └── wrangler.toml       Config del Worker + binding KV
│
└── docs/
    ├── ARQUITECTURA_v1.0.md    Este documento
    └── ARQUITECTURA_v1.0.docx   Versión Word para impresión / distribución
```

---

## 4 · Flujo de una sesión

### 4.1 Login y obtención del token

1. El usuario abre `index.html` y escribe su password en el campo de acceso.
2. El browser hace `POST /auth` al Cloudflare Worker con el password en el body.
3. El Worker compara el password contra las variables de entorno `PWD_SOCIOS` / `PWD_ASESORES` / `PWD_INVERSORES`.
4. Si coincide, devuelve un token firmado con HMAC-SHA256 + el `level` correspondiente.
5. El browser guarda el token en `sessionStorage` y redirige a `chat.html`.

### 4.2 Construcción del SYSTEM_PROMPT (en el Worker)

1. El Worker verifica el token (firma + expiración 12 horas).
2. Según el `level` del token, hace fetch a los `.md` y `.json` correspondientes desde el sitio Netlify (`SITE_BASE`).
3. Ensambla el SYSTEM_PROMPT concatenando capas + datamarts serializados como JSON embebido.
4. Llama a la API de Anthropic con el modelo `claude-sonnet-4-6` y la herramienta `web_search` habilitada.
5. Devuelve la respuesta al browser (el browser nunca ve la API key ni los prompts).

### 4.3 Feedback

1. Cada respuesta del asistente tiene botones 👍 / 👎.
2. 👍 registra inmediatamente el voto sin comentario adicional.
3. 👎 despliega un textarea para comentario libre y envía al Worker vía `POST /feedback`.
4. El Worker guarda la entrada en Cloudflare KV bajo la clave `feedback:{ts}:{uuid}`.
5. La página `/feedback.html` consulta `GET /feedback` (requiere token válido) y lista las entradas ordenadas por fecha.

---

## 5 · Niveles de acceso y SYSTEM_PROMPT

Tres passwords → tres tokens → tres contextos distintos. La diferenciación ocurre en el Worker antes de que el modelo vea nada.

| Nivel | Env var | Capas del SYSTEM_PROMPT | Datamarts incluidos |
|---|---|---|---|
| `socios` | `PWD_SOCIOS` | 00 + 01 + 02 + 04 | Todos |
| `asesores` | `PWD_ASESORES` | 00 + 01 + 02 + 04 | Todos (sin secciones `socios_only`) |
| `inversores` | `PWD_INVERSORES` | 00 + 03 + 04 | `entidades.json` (filtrado: `publico`) + `adaptant_sas.json` |

### Regla de diseño

El nivel `inversores` no recibe en contexto ninguna referencia a BHP SA, deudas, embargos, ni datos personales de los socios. **No es una instrucción al modelo — directamente esa información no entra al SYSTEM_PROMPT del nivel inversor.** Es privacidad por naturaleza, no por permiso.

---

## 6 · Variables de entorno del Worker

### 6.1 Secrets (via `wrangler secret put` — nunca en archivos versionados)

| Variable | Descripción |
|---|---|
| `ANTHROPIC_API_KEY` | Key de API de Anthropic |
| `PWD_SOCIOS` | Password del nivel socios |
| `PWD_ASESORES` | Password del nivel asesores |
| `PWD_INVERSORES` | Password del nivel inversores |
| `SESSION_SECRET` | Clave HMAC para firmar/verificar tokens de sesión |

### 6.2 Variables públicas en `wrangler.toml`

| Variable | Valor |
|---|---|
| `SITE_BASE` | `https://oc-adaptant.netlify.app` |
| `FEEDBACK_KV` | binding → namespace `f3ffb30a15a640fc8ec4e38a740c9557` |

---

## 7 · Token de sesión

Formato custom (no JWT estándar) implementado con Web Crypto API:

```
base64(payload) . HMAC-SHA256(payload, SESSION_SECRET)
```

- `payload` = `{ level: "socios|asesores|inversores", iat: timestamp_ms }`
- Expiración: 12 horas desde `iat`.
- Almacenamiento en cliente: `sessionStorage` (se borra al cerrar la pestaña, no persiste entre sesiones).
- El browser envía el token en el header `Authorization: Bearer <token>` en cada request a `/chat` y `/feedback`.

---

## 8 · Sistema de feedback

### 8.1 Estructura de entrada en KV

Clave: `feedback:{timestamp}:{uuid}`

```json
{
  "vote": "down",
  "level": "socios",
  "question": "¿cuánto es la deuda de BHP?",
  "answer": "texto de la respuesta...",
  "comment": "faltó desagregar por período",
  "ts": 1781640376694
}
```

### 8.2 Endpoints

| Endpoint | Método | Auth requerida | Descripción |
|---|---|---|---|
| `/feedback` | POST | Bearer token válido | Registra una entrada de feedback en KV |
| `/feedback` | GET | Bearer token válido | Lista todas las entradas, ordenadas por `ts` desc |

---

## 9 · Versión del sitio en la UI

El header del chat muestra `v{hash} · {fecha de hoy}`:

- **Hash:** tomado de `/version.json`, generado en cada build de Netlify con el Build command:

  ```
  echo "{\"hash\":\"${COMMIT_REF:0:7}\"}" > version.json
  ```

- El archivo `version.json` está en `.gitignore` — es un artefacto de build, no se commitea.
- **Fecha:** `new Date().toLocaleDateString("es-AR")` en el cliente. Siempre refleja el día de consulta, no el día de deploy.
- **Fallback local:** si no existe `version.json` (desarrollo local), muestra `vdev`.

---

## 10 · Identidad visual

| Token CSS | Valor hex | Uso |
|---|---|---|
| `--tc` | `#C94B1A` | Terracota — acento principal |
| `--negro` | `#1A1A1A` | Texto principal |
| `--crema` | `#F5F0EB` | Fondo warm |
| `--crema2` | `#EBE4DA` | Bloques destacados |
| `--gris` | `#666666` | Texto secundario |
| `--gris2` | `#999999` | Metadatos, terciario |
| `--critico` | `#B83214` | Alertas críticas |
| `--urgente` | `#D9842B` | Urgencias |
| `--ok` | `#4F7A4F` | Estado positivo / thumbs up |

**Tipografía:** DM Serif Display (títulos) · DM Sans (texto) · DM Mono (badges, versión, código). Cargadas desde Google Fonts.

---

## 11 · Líneas rojas operativas del modelo

El SYSTEM_PROMPT incluye restricciones que no son configurables por conversación:

- Nunca sugiere movimientos que configuren vaciamiento, evasión o quiebra fraudulenta.
- Nunca sugiere transferencia de activos entre entidades sin contraprestación a valor de mercado.
- Nunca redacta documentación que sirva como continuidad económica entre BHP y Adaptant.
- Cuando una decisión requiere acuerdo de ambos socios, lo recuerda al final de la respuesta.

---

## 12 · Ciclo de actualización del datamart

| Datamart | Frecuencia | Fuente | Responsable |
|---|---|---|---|
| `deuda_arca.json` | Semanal | Sistema ARCA / contador | Ernesto |
| `deuda_privada.json` | Mensual | Macro / IIBB / Moroni | Ernesto |
| `vencimientos.json` | Semanal | Calendario fiscal + cuotas | Ernesto |
| `cash_flow.json` | Mensual | Extractos Chase / Relay / Banco | Ernesto |
| `adaptant_sas.json` | Cuando cambie | Estado constitución / cliente | Franco |
| `dvops_llc.json` | Mensual | Extractos Chase + Relay | Ernesto |
| `personal.json` | Cuando cambie | Situación personal socios | Ernesto |
| `entidades.json` | Cuando cambie | Datos societarios | Ernesto |

Formato de commit para actualizaciones de datos:

```
data(<datamart>): <cambio> [<fecha>]
```

Ejemplo: `data(deuda_arca): IVA 03/2026 pagado, capital baja a $28.596.241 [22/06/2026]`

---

## 13 · Flujo de desarrollo

| Herramienta | Rol en el flujo |
|---|---|
| Claude Chat (Project Knowledge) | Decisiones de diseño, iteración de prompts, prototipos |
| Claude Code (repo local) | Implementación, validación del diff, push a main |
| Netlify (auto-deploy) | Cualquier push a main despliega el sitio en ~30s |
| Cloudflare (`wrangler deploy`) | Manual cuando cambia `worker.js` o `wrangler.toml` |

---

## 14 · Pendientes y extensiones previstas

| Ítem | Descripción | Prioridad |
|---|---|---|
| Rotación de passwords | `PWD_SOCIOS` y `PWD_ASESORES` quedaron expuestas en historial de conversación | **URGENTE** |
| `arquitectura.html` | Vista explicativa del modelo para nuevos usuarios | Media |
| `estado.html` | Semáforo de estado del grupo — vencimientos próximos | Alta |
| Paginación en `/feedback.html` | KV `list` tiene máx 1000 keys sin cursor | Baja |
| Soporte mobile sidebar | Sidebar oculto en `<768px`, sugeridas no disponibles en móvil | Media |

---

*Este documento refleja el estado del sistema al commit `b014deb` (16/06/2026). Se genera a partir del código fuente en `rnestdvops/oc-adaptant-interno`.*
