# CLAUDE.md · oc-adaptant-interno

Convenciones y reglas operativas del repositorio del **Organizational Commons Interno** de Adaptant — para uso de socios, asesores e inversores con acceso diferenciado.

Este archivo es el contrato. Cualquier agente de coding (Claude Code u otro) que trabaje sobre el repo lo lee primero y respeta lo que dice.

---

## 1 · Qué es este repo

El OC Interno es la capa conversacional con IA sobre la información societaria, fiscal, financiera y estratégica del grupo **BHP SA · Adaptant SAS · d-Vops LLC**.

Replica el patrón arquitectónico del OC GBM Costa Rica con tres diferencias críticas:

1. **Proxy de API obligatorio** — la API key de Anthropic vive en Cloudflare Workers (variable de entorno del servidor), nunca en el navegador. Exponer la key sería desastre.
2. **Tres niveles de acceso por password** — socios, asesores, inversores. Cada nivel ve un subconjunto distinto del datamart y un SYSTEM_PROMPT distinto.
3. **Confidencialidad como principio activo** — el modelo nunca menciona información que el nivel actual no debe ver, ni siquiera para decir "no puedo decirte eso".

## 2 · Stack

| Componente | Tecnología | Por qué |
|---|---|---|
| Hosting sitio estático | Netlify | Auto-deploy desde Git, cero costo, dominio propio |
| Proxy de API | Cloudflare Workers | API key segura, web search habilitado, $0/mes en uso normal |
| Modelo | Anthropic Claude (Sonnet 4.6 por defecto) | Calidad de razonamiento + web search nativo |
| Datamarts | JSON estático en `/datamarts/` | Versionado en Git, editable a mano o por script |
| Generación de docs | docx.js en navegador | Coherente con patrón GBM |

## 3 · Estructura del repo

```
/
├── index.html              Landing + login + chat (todo en una)
├── arquitectura.html       Explicación visual del modelo
├── estado.html             Vista rápida del estado actual (semáforo)
├── feedback.html           Formulario para sugerencias
│
├── assets/
│   ├── styles.css          Identidad visual Adaptant
│   ├── chat.js             Lógica del chat (consume worker)
│   └── auth.js             Lógica de password → token de sesión
│
├── datamarts/
│   ├── entidades.json      Las tres entidades (público hasta cierto detalle)
│   ├── deuda_arca.json     Deuda fiscal BHP + socios (restringido)
│   ├── deuda_privada.json  Moroni, Macro, IIBB San Juan (restringido)
│   ├── vencimientos.json   Calendario de obligaciones próximas
│   ├── adaptant_sas.json   Estado Adaptant (visible inversores)
│   └── dvops_llc.json      d-Vops LLC (restringido — solo socios/asesores)
│
├── system_prompts/
│   ├── 00_personalidad.md           Tono, principios, postura
│   ├── 01_briefing_completo.md      Briefing maestro (socios + asesores)
│   ├── 02_datamart_guide.md         Cómo conversar sobre el datamart
│   ├── 03_vista_inversor.md         Subset visible para inversores
│   └── 04_modelo_privacidad.md      Reglas duras de qué nunca decir
│
├── worker/
│   ├── worker.js           Cloudflare Worker: proxy + auth + selección de prompt
│   ├── wrangler.toml       Config del Worker
│   └── .dev.vars.example   Plantilla de variables de entorno
│
├── CLAUDE.md               Este archivo
└── README.md               Documentación operativa
```

## 4 · Identidad visual Adaptant

| Token | Valor | Uso |
|---|---|---|
| `--tc` | `#C94B1A` | Terracota — color de acento principal |
| `--negro` | `#1A1A1A` | Texto principal, headers |
| `--crema` | `#F5F0EB` | Fondo cálido |
| `--crema2` | `#EBE4DA` | Fondo de bloques destacados |
| `--gris` | `#666666` | Texto secundario |
| `--gris2` | `#999999` | Texto terciario, metadatos |

**Tipografía:**
- Display / títulos: `DM Serif Display`
- Texto: `DM Sans`
- Código / mono: `DM Mono`

Las fuentes se cargan desde Google Fonts. Si Adaptant cambia de identidad, este bloque es lo único que se toca.

## 5 · Modelo de privacidad por nivel

Tres passwords definen tres SYSTEM_PROMPTs distintos. El Worker selecciona el SYSTEM_PROMPT correcto en función del token validado, y cada uno tiene **solo el datamart que ese nivel debe ver**.

| Nivel | Password env var | SYSTEM_PROMPT base | Datamarts incluidos |
|---|---|---|---|
| **Socios** | `PWD_SOCIOS` | 00 + 01 + 02 + 04 | todos |
| **Asesores** | `PWD_ASESORES` | 00 + 01 + 02 + 04 | todos excepto secciones marcadas `socios_only` |
| **Inversores** | `PWD_INVERSORES` | 00 + 03 + 04 | solo `entidades.json` (público) + `adaptant_sas.json` |

**Regla dura:** el SYSTEM_PROMPT del nivel inversor no contiene ninguna información sobre BHP, deudas, embargos, ni datos personales de socios. No se trata de "decirle al modelo que no lo diga" — directamente esa información no entra al contexto. Es el principio del OC aplicado: privacidad por naturaleza, no por permiso aplicado a posteriori.

## 6 · Reglas de actualización del datamart

| Datamart | Frecuencia | Origen | Quién |
|---|---|---|---|
| `deuda_arca.json` | Semanal | Sistema ARCA / contador | Ernesto |
| `deuda_privada.json` | Mensual | Cronogramas Macro/IIBB + estado Moroni | Ernesto |
| `vencimientos.json` | Semanal | Calendario fiscal + cuotas planes | Ernesto |
| `adaptant_sas.json` | Cuando cambie | Estado constitución / primer cliente | Franco |
| `dvops_llc.json` | Mensual | Extractos Chase + Relay | Ernesto |
| `entidades.json` | Cuando cambie | Datos societarios | Ernesto |

Cuando se actualiza un datamart, el commit message tiene formato: `data(<datamart>): <cambio> [<fecha>]`.

Ejemplo: `data(deuda_arca): IVA 03/2026 pagado, capital baja a $28.596.241 [22/06/2026]`.

**Novedades del Commons:** cada vez que un commit `data(...)` incorpora un cambio relevante, agregar también un item en `datamarts/novedades.json` (fecha + resumen breve + `visibility` del item). Esa lista se muestra como bienvenida al entrar al chat (ver `assets/chat.js` → `loadNovedades()` y el endpoint `GET /novedades` del Worker, que filtra por nivel de sesión) para invitar a preguntar sobre lo último cargado. Mantener máximo 6-8 items, el más nuevo primero.

## 7 · Honestidad temporal

El modelo debe:

- Decir explícitamente cuándo fue la última actualización del datamart consultado.
- Marcar con `[no disponible — pendiente de carga]` cualquier dato que la pregunta requiera pero no esté.
- Usar web search para complementar (tipo de cambio, vencimientos ARCA, moratorias vigentes, tasas), siempre identificando qué viene de web y qué del datamart interno.

## 8 · Líneas rojas operativas

Estas reglas vienen del Bloque 5 del briefing y son sagradas:

- El modelo nunca sugiere movimientos que configuren vaciamiento, evasión o quiebra fraudulenta.
- El modelo nunca sugiere transferir activos entre entidades sin contraprestación a valor de mercado.
- El modelo nunca redacta documentación que sirva como continuidad económica entre BHP y Adaptant.
- Cuando una decisión requiere acuerdo de ambos socios (ver Bloque 5.5), el modelo lo recuerda al final de la respuesta.

## 9 · Flujo de desarrollo

1. **Chat con Claude (Project Knowledge):** decisiones de qué hacer, iteración visual, prototipos.
2. **Claude Code sobre el repo local:** implementación de cambios, validación del diff, push.
3. **Auto-deploy en Netlify:** cada push a `main` dispara deploy del sitio.
4. **Worker en Cloudflare:** `wrangler deploy` manual cuando cambie la lógica del Worker.

## 10 · Glosario

- **Briefing maestro:** documento `Commons_Briefing_BHP_Adaptant_jun2026.docx`. Es la Capa 1 base del SYSTEM_PROMPT.
- **Nivel de acceso:** uno de `socios | asesores | inversores`. Define qué SYSTEM_PROMPT y datamarts entran al contexto.
- **ARCA:** AFIP renombrada en 2024 — Agencia de Recaudación y Control Aduanero.
- **d-Vops LLC:** entidad de EEUU (Wyoming). Corazón del cash flow actual. Factura al exterior.
- **Concurso:** concurso preventivo de BHP SA iniciado en 2017, en fase de cierre.

---

*Documento vivo. Actualizar cuando cambien convenciones, stack o modelo de privacidad. Versión 1.0 — junio 2026.*
