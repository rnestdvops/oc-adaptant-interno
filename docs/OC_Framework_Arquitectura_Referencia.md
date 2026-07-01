# OC Framework — Arquitectura de Referencia

**Versión:** 2.0 (generalizada a partir del estado real de OC Adaptant Interno al 01/07/2026)
**Propósito de este documento:** servir de brief autocontenido para diseñar una **nueva instancia** del Organizational Commons (OC) en un dominio distinto — en este caso, un área de tecnología que entrega proyectos de software y necesita consolidar Service Desk, Remedy y otras fuentes en una única memoria conversacional.

Este documento no asume que quien lo lee conoce el proyecto OC Adaptant Interno. Es la especificación del **patrón**, no la implementación de un caso particular. La Parte B aplica el patrón al caso concreto de tecnología/entrega de valor.

---

## PARTE A — El patrón OC

### 1 · Qué es un OC (Organizational Commons)

Un OC es una **capa conversacional con IA sobre información operativa dispersa**. No es un dashboard, no es un BI, no es un buscador de documentos, no es un ERP.

Es una memoria compartida que:
- Sabe el contexto completo del dominio (no hay que reconstruírselo en cada pregunta).
- Responde en lenguaje natural con el dato exacto y su fecha de corte.
- Distingue niveles de acceso — cada persona ve solo lo que le corresponde, sin que el modelo tenga que "decidir" ocultar algo.
- Deriva a un humano o proceso externo cuando la pregunta requiere juicio profesional o una acción que el sistema no debe tomar solo.

### Los tres principios no negociables

1. **Proxy de API obligatorio.** La API key del proveedor de LLM (Anthropic, u otro) vive en el servidor (Cloudflare Worker u equivalente), nunca en el navegador. El cliente jamás toca la API directamente.
2. **Privacidad por naturaleza, no por permiso.** Si un nivel de acceso no debe ver cierta información, esa información **no entra al contexto del modelo** para ese nivel. No es una instrucción de "no lo digas" — es la ausencia física del dato en el prompt.
3. **Honestidad temporal.** Toda respuesta basada en un datamart indica (implícita o explícitamente) la fecha de corte del dato. El sistema nunca hace pasar un dato viejo por uno actual.

---

### 2 · Las capas del sistema

El OC se construye en capas que se agregan incrementalmente. No hace falta implementarlas todas desde el día uno — el orden importa porque cada capa depende de que la anterior esté estable.

| Capa | Nombre | Qué resuelve |
|---|---|---|
| **C1** | Datamarts | Los datos estructurados en JSON, versionados en Git, con dueño y fecha de actualización |
| **C2** | System prompts en capas | Personalidad, guía de uso de datamarts, reglas de privacidad — separado del código |
| **C3** | Niveles de acceso | Password → token → selección de prompt + datamarts según el rol |
| **C4a** | Chat reactivo | El usuario pregunta, el modelo responde — el circuito básico funcional |
| **C4b** | Capa agentic | Procesos programados (cron) que leen el commons y generan alertas proactivas — sin tocar sistemas transaccionales |
| **C5** | Feedback + auditoría | 👍/👎 en cada respuesta, log de queries, historial de errores — para calibrar el sistema con uso real |
| **C6** | Novedades / changelog | Bienvenida que resume lo último cargado (invita a preguntar) + bitácora curada de versiones del producto |

Un OC mínimo viable es **C1 + C2 + C3 + C4a**. Todo lo demás se agrega cuando el uso real lo justifica.

---

### 3 · Stack tecnológico de referencia

| Componente | Tecnología | Por qué |
|---|---|---|
| Hosting del sitio estático | Netlify (o equivalente) | Auto-deploy desde Git, cero costo, dominio propio |
| Proxy de API | Cloudflare Workers | API key segura, tool use / web search habilitado del lado servidor, costo ~$0/mes en uso normal |
| Modelo | Claude (Sonnet por defecto; escalar a Opus si el razonamiento lo justifica) | Calidad de razonamiento + prompt caching nativo |
| Datamarts | JSON estático en `/datamarts/` | Versionado en Git, editable a mano, por script, o por integración automática |
| Persistencia de feedback/alertas/errores | Cloudflare KV | Serverless, mismo proveedor que el Worker, sin base de datos que mantener |
| Generación de docs (si aplica) | docx.js en navegador | Solo si el OC necesita producir documentos formales |

**Nota de portabilidad:** ninguna de estas piezas es específica del dominio. El mismo stack sirve para finanzas, legal, ventas, o entrega de tecnología — lo que cambia es el contenido de los datamarts y los system prompts.

---

### 4 · Estructura de repositorio genérica

```
/
├── index.html              Landing + login + chat (o separado en index.html + chat.html)
├── feedback.html           Panel de feedback / historial / alertas (uso interno del equipo que mantiene el OC)
│
├── assets/
│   ├── styles.css          Identidad visual del dominio (tokens de marca)
│   ├── chat.js             Lógica del chat: envío, render, feedback, novedades, sugeridas
│   └── auth.js             Login → token de sesión, preguntas sugeridas por nivel
│
├── datamarts/
│   ├── entidades.json          (o equivalente: qué existe en este dominio)
│   ├── <dominio>_*.json        Uno o varios JSON por área de datos
│   ├── changelog.json          Bitácora curada de versiones del producto OC (Keep a Changelog)
│   └── novedades.json          Lista rotativa de últimas actualizaciones de DATOS (no de producto)
│
├── system_prompts/
│   ├── 00_personalidad.md          Tono, principios, postura del asistente
│   ├── 01_briefing_completo.md     Contexto de dominio completo (nivel máximo de acceso)
│   ├── 02_datamart_guide.md        Cómo conversar sobre cada datamart, patrones de respuesta
│   ├── 03_vista_<nivel_reducido>.md Subset para niveles con menos acceso
│   └── 04_modelo_privacidad.md     Reglas duras de qué nunca decir / cómo tratar tensión entre datamarts
│
├── worker/
│   ├── worker.js           Cloudflare Worker: proxy + auth + selección de prompt + endpoints + agentes cron
│   └── wrangler.toml       Config del Worker (bindings KV, variables, triggers cron)
│
├── CLAUDE.md               Contrato operativo del repo (convenciones, líneas rojas, flujo de trabajo)
└── docs/
    └── ARQUITECTURA_v1.0.md   Estado documentado del sistema en el momento del primer despliegue
```

**Integraciones externas (si el dominio las requiere)** viven en un repo aparte, no en el del OC. Patrón de referencia: `arca-monitor`, un pipeline independiente que corre diariamente, lee un sistema externo (en ese caso AFIP/ARCA vía scraping), detecta novedades contra el estado anterior, y **empuja el JSON actualizado al repo del OC vía commit automático**. El OC nunca llama al sistema externo directamente — siempre consume el datamart ya consolidado. Esto es exactamente el patrón que aplica para Service Desk / Remedy en la Parte B.

---

### 5 · Modelo de niveles de acceso

Cada nivel de acceso es: **una password** → **un token firmado** → **un SYSTEM_PROMPT específico** → **un subconjunto de datamarts**.

Ejemplo de tabla (la de OC Adaptant Interno, como referencia — 5 niveles reales hoy):

| Nivel | Password env var | Capas de prompt | Datamarts incluidos |
|---|---|---|---|
| Socios | `PWD_SOCIOS` | 00+01+02+04 | Todos |
| Asesores | `PWD_ASESORES` | 00+01+02+04 | Todos excepto secciones `*_only` de otro nivel |
| Contador | `PWD_CONTADOR` | Igual que asesores | Igual que asesores (rol distinguible en log de queries) |
| Inversores | `PWD_INVERSORES` | 00+03+04 | Solo datamarts marcados `publico` |
| Demo | `PWD_DEMO` | 00+05 | Datos reales sin información sensible — para mostrar el producto a prospectos |

**Regla dura:** el SYSTEM_PROMPT de un nivel reducido no contiene la información restringida ni siquiera para "saber que existe y no decirla". El Worker arma el prompt por nivel ANTES de llamar al modelo — la construcción del contexto es donde vive la seguridad, no el comportamiento del modelo.

**Implementación técnica del token:** `base64(payload) . HMAC-SHA256(payload, SESSION_SECRET)`, con `payload = {level, iat}` y expiración de 12 horas. Guardado en `sessionStorage` (se borra al cerrar la pestaña).

---

### 6 · Convenciones de datamarts

Cada archivo JSON en `/datamarts/` sigue esta forma mínima:

```json
{
  "last_updated": "YYYY-MM-DD",
  "data_owner": "Nombre de quien mantiene el dato",
  "visibility": "publico | <nivel>_only | mixta_por_item",
  "proposito": "Una frase: para qué sirve este datamart y qué preguntas responde",
  "...": "contenido específico del dominio"
}
```

- **`visibility` a nivel de item** (no solo de archivo) cuando un mismo datamart mezcla contenido público y restringido — el Worker filtra el array antes de inyectarlo al prompt (patrón usado en `entidades.json` y `novedades.json` de OC Adaptant Interno).
- **Patrón resumen + detalle** para datasets grandes: un datamart `X.json` con agregados (por mes, por categoría) que se carga siempre, y un `X_detalle.json` con el registro individual que se carga solo bajo demanda explícita (evita inflar el prompt con miles de filas cuando el 95% de las preguntas se responden con el agregado).
- **Convención de commit:** `data(<datamart>): <cambio> [<fecha>]`. Esto no es solo higiene de Git — es lo que permite mantener `novedades.json` (capa C6) casi automáticamente: cada commit de datos relevante suma una entrada breve ahí.

---

### 7 · El Worker — responsabilidades y endpoints de referencia

El Worker es el único punto que:
1. Valida credenciales y emite tokens.
2. Arma el SYSTEM_PROMPT según nivel (con **prompt caching en 2 breakpoints** — capas `.md` que cambian poco, datamarts que cambian seguido — para no pagar el costo completo de input en cada query dentro de la ventana de cache).
3. Llama al proveedor del modelo con el prompt + herramientas habilitadas (web search, etc.).
4. Expone endpoints auxiliares, todos autenticados vía `Authorization: Bearer <token>`:

| Endpoint | Método | Uso |
|---|---|---|
| `/auth` | POST | Login → token |
| `/chat` | POST | Conversación principal |
| `/feedback` | POST/GET | 👍/👎 + comentario, historial |
| `/top-queries` | GET | Preguntas más frecuentes del nivel (para sugeridas dinámicas) |
| `/queries` | GET | Historial completo de consultas (auditoría) |
| `/novedades` | GET | Últimas actualizaciones de datos, filtradas por nivel (capa C6) |
| `/alerts` | GET/DELETE | Alertas generadas por agentes (capa C4b) |
| `/agents/run` | POST | Disparo manual de un agente (testing, restringido a nivel máximo) |
| `/errors` | GET | Historial de errores (restringido a nivel máximo) |

**Logger estructurado:** cada handler emite `console.log(JSON)` con `level`, `event`, `request_id`, `ts` — capturable en el dashboard del proveedor o vía CLI en tiempo real. Los errores relevantes además persisten en KV con TTL (30 días) para diagnóstico posterior.

---

### 8 · Capa agentic (C4b) — agentes que solo observan y alertan

Un agente en este patrón:
- Se dispara por **cron** (temporal) o por evento (si el proveedor lo soporta).
- **Lee** uno o más datamarts del commons.
- **Nunca** escribe en sistemas transaccionales externos (no paga, no cierra tickets, no actualiza el sistema origen).
- Si detecta condición relevante, persiste una alerta en KV; si no hay nada nuevo, no genera ruido.
- Se registra en un datamart propio (`agentes_activos.json`) con ficha: trigger, proceso, formato de output, canal, y **criterio explícito de retiro** (si el agente deja de ser útil, se saca — no se acumulan agentes zombis).

Este es el patrón exacto a replicar para "¿qué se desplegó hoy?" o "¿cuántas tareas cerramos ayer?" — un agente diario que lee el datamart de despliegues/tareas (ya consolidado por la integración externa) y arma un resumen, sin necesidad de que el usuario pregunte.

---

### 9 · Feedback y auditoría (C5)

- Cada respuesta del asistente tiene 👍 / 👎. 👎 abre un textarea para comentario libre.
- Cada query exitosa se loguea de forma asíncrona (no bloquea la respuesta al usuario) con pregunta, preview de respuesta, nivel, y métricas de uso de tokens (incluyendo cache hits, para verificar que el caching está funcionando).
- Un panel separado (`feedback.html` o equivalente) consulta estos endpoints y muestra pestañas: Feedback / Historial de consultas / Alertas / Errores (según el nivel de quien lo mira — típicamente restringido al equipo que mantiene el OC).

---

### 10 · Novedades y changelog (C6)

Dos bitácoras distintas, que conviene no mezclar:

- **`novedades.json`** — actualizaciones de **datos** (contenido del dominio). Se muestra como bienvenida en el chat, filtrada por nivel, con máximo 6-8 items rotativos. Objetivo: que quien entra sepa qué preguntar sin tener que adivinar.
- **`changelog.json`** — actualizaciones del **producto OC** (features, fixes). Sigue convención Keep a Changelog, versionado semver pre-1.0. Se carga en el contexto del modelo para que pueda responder "qué cambió en la herramienta", pero no se muestra como bienvenida (es información sobre la herramienta, no sobre el dominio).

---

### 11 · Identidad visual — tokens a reemplazar

El sistema de diseño es un set de variables CSS + 3 familias tipográficas (display / texto / mono). Reemplazar por la identidad de marca correspondiente al nuevo dominio. Ejemplo de la estructura (valores de OC Adaptant Interno, a sustituir):

```css
--tc: #C94B1A;      /* acento principal */
--negro: #1A1A1A;   /* texto principal */
--crema: #F5F0EB;   /* fondo */
--crema2: #EBE4DA;  /* bloques destacados */
--gris: #666666;    /* texto secundario */
--gris2: #999999;   /* texto terciario / metadatos */
--critico: #B83214; /* alertas críticas */
--urgente: #D9842B; /* urgencias */
--ok: #4F7A4F;       /* estado positivo */
```

---

### 12 · Flujo de desarrollo

1. **Chat con Claude (Project Knowledge):** decisiones de qué hacer, iteración de prompts/visual, prototipos — **este documento es el insumo para esa etapa cuando se arranca un OC nuevo.**
2. **Claude Code sobre el repo local:** implementación de cambios, validación del diff, push.
3. **Auto-deploy en Netlify** (o el hosting elegido): cada push a `main` dispara el deploy del sitio.
4. **Worker en Cloudflare:** `wrangler deploy` manual cuando cambia la lógica del Worker (el hosting estático no redeploya el Worker).

---

## PARTE B — Aplicación al caso: OC de Entrega de Valor (Área de Tecnología)

### 13 · Objetivo del nuevo OC

Un commons conversacional para un área de tecnología que **desarrolla proyectos de software**, que consolide información dispersa en múltiples sistemas (Service Desk, Remedy/ITSM, repositorios de código, CI/CD, encuestas de satisfacción) en una sola fuente de verdad conversacional sobre **qué valor se está entregando**.

Preguntas típicas que debe poder responder:
- ¿Cómo va el proyecto X?
- ¿Cuántas tareas cerramos ayer / esta semana?
- ¿Qué despliegues se hicieron esta semana / hoy?
- ¿Cuánto demoramos en entregar algo (lead time) desde que se pide hasta que se entrega?
- ¿Cuántos ítems hay en el backlog y qué añejamiento tienen (cuánto tiempo llevan esperando)?
- ¿Cuál es la experiencia de usuario / satisfacción del cliente con lo entregado?
- ¿Qué tickets de Service Desk / Remedy están abiertos, y desde cuándo?
- ¿Estamos cumpliendo los SLA comprometidos?

### 14 · Fuentes de datos a consolidar

| Fuente | Qué aporta | Patrón de integración |
|---|---|---|
| **Service Desk** | Tickets de soporte, tiempos de resolución, categorías de incidentes | Pipeline externo tipo `arca-monitor`: corre periódicamente, consulta la API del Service Desk, consolida y empuja JSON al repo del OC |
| **Remedy (BMC Remedy / ITSM)** | Incidentes, cambios, problemas, gestión de SLA | Mismo patrón — pipeline externo con credenciales propias, nunca el Worker del OC llamando directo al sistema |
| **Sistema de gestión de proyectos** (Jira/Azure DevOps/Linear u otro) | Backlog, sprints, tareas cerradas/abiertas, estimaciones vs real | Igual patrón — o webhook si el sistema lo soporta, escribiendo directo al datamart vía una función serverless intermedia |
| **CI/CD** (GitHub Actions, Jenkins, GitLab CI) | Despliegues realizados, frecuencia, éxito/fallo | Webhook post-deploy que apenda un registro al datamart de despliegues |
| **Encuestas CSAT/NPS** | Satisfacción del cliente con lo entregado | Carga periódica (manual o vía formulario) consolidada en datamart |

**Principio de integración:** el Worker del OC **nunca** llama directamente a Service Desk, Remedy, ni al sistema de proyectos. Cada fuente tiene su propio proceso de consolidación (igual que `arca-monitor`) que corre por fuera, transforma los datos crudos a un JSON consolidado y legible, y lo empuja al repo del OC vía commit. El OC consume solo datamarts ya consolidados — esto mantiene el Worker simple, evita exponer credenciales de sistemas externos en el mismo lugar que la API key del modelo, y permite que cada integración evolucione a su propio ritmo.

### 15 · Datamarts propuestos

| Datamart | Contenido | Frecuencia sugerida | Fuente |
|---|---|---|---|
| `proyectos.json` | Estado por proyecto: fase, % avance, próximos hitos, riesgos activos | Semanal o cuando cambie | Consolidado manual + sistema de gestión |
| `backlog.json` | Ítems abiertos con fecha de creación (para calcular añejamiento), prioridad, proyecto asociado | Diaria | Sistema de gestión de proyectos |
| `tareas_cerradas.json` | Agregado diario/semanal: cuántas tareas se cerraron, por proyecto y por persona/equipo (agregado, no individual — ver nota de privacidad) | Diaria | Sistema de gestión de proyectos |
| `despliegues.json` | Registro de despliegues: fecha, ambiente, proyecto, resultado (éxito/rollback), duración | En cada evento (webhook CI/CD) | Pipeline CI/CD |
| `service_desk.json` | Tickets: categoría, tiempo de resolución, SLA cumplido/incumplido, agregado por período | Diaria | Pipeline Service Desk |
| `remedy_tickets.json` | Incidentes/cambios/problemas ITSM: estado, severidad, SLA | Diaria | Pipeline Remedy |
| `lead_time.json` | Distribución de tiempo desde solicitud hasta entrega, por tipo de ítem | Semanal (calculado) | Derivado de backlog + tareas cerradas |
| `csat.json` | Resultados de encuestas de satisfacción, por proyecto/cliente | Cuando haya nueva encuesta | Manual o integración con herramienta de encuestas |
| `novedades.json` | Última actualización de datos — igual patrón que OC Adaptant Interno | Cada commit `data(...)` relevante | — |
| `changelog.json` | Versiones del producto OC | Cada release | — |

**Métricas clave a calcular/exponer** (para que el modelo las use al responder, no como dashboard separado):
- **Lead time**: tiempo desde que se solicita algo hasta que se entrega.
- **Throughput**: cuántos ítems se completan por período.
- **Backlog aging**: distribución de cuánto tiempo llevan esperando los ítems abiertos (ej: % del backlog con más de 30/60/90 días).
- **Deployment frequency**: cuántos despliegues por semana/mes, y tasa de éxito/rollback.
- **SLA compliance**: % de tickets resueltos dentro del SLA comprometido.
- **CSAT/NPS**: satisfacción reportada por los clientes internos/externos.

### 16 · Niveles de acceso propuestos

A definir con el cliente/dueño del área, pero un punto de partida razonable:

| Nivel posible | Ve | Para quién |
|---|---|---|
| Liderazgo / PMO | Todo: proyectos, backlog, SLA, CSAT, despliegues, con detalle | Líder de área, PM |
| Equipo técnico | Backlog, tareas, despliegues — sin datos de CSAT/cliente si son sensibles | Desarrolladores, ingenieros |
| Stakeholders / clientes internos | Estado de sus proyectos específicos, CSAT propio, sin ver otros proyectos ni datos internos del equipo | Áreas de negocio que piden el trabajo |
| Demo / prospectos | Estructura y capacidades del OC sin datos reales sensibles, para mostrar el producto | Ventas del propio OC como producto |

### 17 · Nota de privacidad específica de este dominio

A diferencia de OC Adaptant Interno (donde lo sensible es fiscal/financiero/societario), en un OC de entrega de tecnología el riesgo de privacidad más probable es **exponer performance individual de forma punitiva** (ej: "¿cuántas tareas cerró Fulano esta semana?"). Antes de modelar el system prompt, definir con el equipo:

- ¿Los datos de productividad se muestran solo agregados por equipo/proyecto, o también por persona?
- Si se muestran por persona, ¿a qué nivel de acceso, y con qué marco de uso (mejora continua, no evaluación de desempeño)?
- Igual que con las "líneas rojas" de Adaptant Interno, esto debería quedar explícito en `04_modelo_privacidad.md` de la nueva instancia — el modelo nunca debería habilitar un uso punitivo de los datos individuales aunque técnicamente estén en el datamart.

### 18 · Checklist para arrancar el proyecto nuevo

1. Definir nombre del proyecto y repo (`oc-<area>-interno` o similar).
2. Copiar la estructura de carpetas de la Parte A (sección 4), vacía.
3. Definir niveles de acceso reales (sección 16) y sus passwords.
4. Escribir `system_prompts/00_personalidad.md` con tono propio del área (puede tomar como referencia el de OC Adaptant Interno, adaptando vocabulario técnico).
5. Escribir `04_modelo_privacidad.md` con la regla de la sección 17 explícita.
6. Definir el primer datamart a cargar (recomendado: `backlog.json` + `despliegues.json` — son los que más rápido generan valor conversacional) y cargarlo con datos reales, aunque sea parcial.
7. Levantar el Worker con `/auth` + `/chat` (C4a) antes de pensar en agentes o novedades — validar que el circuito básico responde bien antes de agregar capas.
8. Recién ahí evaluar C4b (agentes: ej. "resumen diario de despliegues"), C5 (feedback) y C6 (novedades) según el uso real lo pida.
9. Para cada fuente externa (Service Desk, Remedy, CI/CD), crear un repo/pipeline separado que consolide y empuje al datamart — nunca conectar el Worker directo a esos sistemas.

---

*Documento generado a partir del estado real de `oc-adaptant-interno` al 01/07/2026 (5 niveles de acceso, capa agentic activa con 1 agente en producción, sistema de feedback + auditoría completo, capa de novedades recién agregada). Pensado para copiar-pegar en una conversación nueva de Claude (Project Knowledge) y usarlo como base de diseño del OC de tecnología, antes de volver a Claude Code para la implementación.*
