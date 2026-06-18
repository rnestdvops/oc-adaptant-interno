# Plan de agentización del OC Adaptant Interno

**Versión:** 1.0 · Junio 2026
**Marco de referencia:** *OC Framework v2.1 — El OC Agentizado* (Corona & Buglioni, 2026)
**Estado:** En implementación (Fase 1 infra + Agente #1)

---

## Por qué este documento existe

Este documento aplica al **OC Adaptant Interno** (esta misma implementación que estás usando) el protocolo de agentización definido en el paper *El OC Agentizado*. El doble propósito:

1. **Operativo:** liberar a Ernesto y Franco del monitoreo manual de vencimientos, cobranzas, ingresos en cuentas, e inconsistencias en datamarts. Devolver tiempo a tareas que requieren juicio humano.
2. **Producto:** este OC Interno es el primer *proof of concept* vivo del producto que Adaptant vende. La agentización aplicada acá genera material de caso real (no demo) para conversaciones comerciales — y descubre las fricciones reales del producto antes de que las descubra un cliente.

---

## Dónde estamos hoy en el marco del paper

| Capa | Definición del paper | Estado en OC Interno |
|---|---|---|
| **C1 Sistemas fuente** | CRM, ERP, RRHH, facturación | Mínimo: extractos bancarios, ARCA, comprobantes — entrada manual |
| **C2 Extracción** | ETL / sincronización | **No automatizado** — Ernesto curador manual |
| **C3 Commons (datamart)** | Núcleo metodológico, modelo de privacidad | ✅ Operativo en `datamarts/*.json` |
| **C4a Conversacional reactivo** | Recupera y sintetiza bajo demanda | ✅ **Operativo** (este chat) |
| **C4b Agentic** | Orquesta, prepara, alerta sin pedido | ❌ **Foco de este plan** |
| **C4c Juicio humano** | Validar, decidir, asumir responsabilidad | ✅ Ernesto + Franco siempre |
| **C5 Periferia** | Canal entre commons y personas | ✅ Web reactiva; canal proactivo pendiente |

El sistema está **purísimo en C4a**. Es exactamente lo que el paper llama Fase 1 — y es la base sobre la cual se puede agentizar legítimamente.

---

## Línea roja heredada del paper

> *"Si los agentes del OC empiezan a ejecutar acciones en los sistemas transaccionales, el OC deja de ser una infraestructura de autonomía y se convierte en una infraestructura de control más sofisticada."*

**Aplicación al OC Interno:** los agentes pueden **leer** datamarts, **detectar** patrones, **alertar**, **sincronizar**. **Nunca** modifican ARCA, MP, bancos, ni emiten facturas. Cada decisión sigue siendo humana — el agente solo hace visible lo que merece atención.

---

## Catálogo de agentes propuestos

Dos categorías según origen del patrón:

### Calendario-driven (legítimos día 1, no esperan acumulación de queries)

| # | Agente | Trigger | Output | Canal | Prioridad |
|---|---|---|---|---|---|
| 1 | **Vencimientos próximos 7 días** | Temporal diario 8:00 AR | Alerta priorizada | UI (KV) → email | 🔴 Alta |
| 2 | **Cobranzas pendientes** | Temporal semanal lunes 9:00 | Resumen ordenado | UI → email | 🟡 Media |
| 3 | **Ingreso en cuenta BHP** | Temporal diario 18:00 | Alerta "ingresó $X — retirar (Línea A3)" | UI → email | 🔴 Alta |
| 4 | **Coherencia de datamarts** | Temporal semanal viernes | Reporte de inconsistencias | UI → email | 🟡 Media |

### Uso-driven (esperan ≥4 semanas de patrones reales de query)

| # | Agente | Trigger | Output | Canal | Pre-requisito |
|---|---|---|---|---|---|
| 5 | **Patrones de consulta** | Temporal semanal | Análisis: qué se pregunta más, qué falta en el datamart | UI + datamart | ≥4 semanas de `/queries` acumuladas |
| 6 | **Sugeridas dinámicas** | Demanda al cargar chat | Top N preguntas reales del nivel, complementan hardcodeadas | Sidebar UI del chat | Igual a #5 |

El agente #6 es el chip de "top queries como sugeridas" que ya estaba parqueado.

---

## Ficha de cada agente — formato canónico del paper

Cada agente que entre en producción documenta sus 5 preguntas:

```yaml
id: vencimientos-7d
estado_ciclo_vida: propuesta | validacion | despliegue | operacion_monitoreada | operacion_estable | revision | retirado
trigger:
  tipo: temporal | evento | demanda
  detalle: "cron 0 11 * * * (UTC = 8 AM AR)"
output:
  tipo: resumen | alerta | recomendacion | documento_estructurado
  formato_exacto: "Markdown con tabla agrupada por categoría, ordenado por urgencia"
canal:
  tipo: ui_kv | email | slack | comentario_en_sistema_fuente | dashboard
  detalle: "Persiste en KV con prefix alert:; visible en feedback.html pestaña Alertas"
preguntas_protocolo:
  inputs: "datamarts/vencimientos.json, deuda_privada.json, facturacion_emitida.json"
  proceso: "filtrar fecha_vto ≤ hoy+7 · agrupar por categoría · ordenar por urgencia"
  output_format: "Mensaje Markdown con tabla agrupada"
  frecuencia: "Diaria 8 AM AR"
  escalacion_humana: "Siempre — el agente solo alerta; el humano decide acción"
monitoreo:
  primer_despliegue: null
  feedback_4_semanas: []
revision_periodica:
  cada: 6 meses
  proxima: null
```

---

## Stack técnico

Sin agregar infra nueva — todo sobre el Worker actual:

| Necesidad | Cómo |
|---|---|
| Trigger temporal | **Cloudflare Cron Triggers** (`[triggers]` en `wrangler.toml` + `scheduled()` en worker.js) |
| Estado entre runs | KV (binding `FEEDBACK_KV` existente) con prefix `agent:` y `alert:` |
| Lectura datamarts | Fetch a Netlify (igual que `buildSystemPrompt`) |
| LLM razonamiento (cuando aplique) | Misma API de Anthropic |
| Canal salida primario | KV + UI nueva (pestaña Alertas en feedback.html) |
| Canal salida futuro | Email via Resend/Cloudflare Email Workers — agregable después |
| Registry agentes | Nuevo datamart `agentes_activos.json` |

---

## Plan de ejecución sugerido

| Semana | Tarea |
|---|---|
| 1 | Infra: Cron + registry vacío + esquema. Agente #1 (Vencimientos 7d) en *operación monitoreada* |
| 2 | Evaluar #1 con feedback explícito. Si funciona, lanzar #3 (Ingreso BHP) que es prima de Línea A3 |
| 3 | Lanzar #2 (Cobranzas) y #4 (Coherencia) si los primeros mostraron valor |
| 4-8 | Acumulación de queries para #5 y #6 |
| 12 | Primera revisión periódica del paper — cada agente: ¿sigue accionado? ¿sigue siendo útil? |

---

## Qué hace este plan que el paper exige

| Exigencia del paper | Cómo se cumple |
|---|---|
| Criterio de elegibilidad cuantitativo (≥3/sem × 4 sem × forma estable) | Aplicado estricto a agentes uso-driven. Los calendario-driven se justifican por evento del dominio. |
| 5 preguntas antes de implementar | Documentadas en cada ficha del registry |
| Taxonomía Trigger+Output+Canal | Estructura formal del registry |
| Ciclo de vida explícito | Campo `estado_ciclo_vida` en cada ficha |
| Línea roja: no actuar sobre sistemas fuente | Garantizado por arquitectura — el Worker no tiene credenciales para escribir en ARCA/banco/MP |
| Revisión periódica cada 6 meses | Campo `revision_periodica.proxima` en cada ficha |

---

## Pendientes operativos antes de cada despliegue

Para cada agente que pase de "propuesta" a "despliegue":

- [ ] Las 5 preguntas respondidas y documentadas
- [ ] Referente periférico validó la ficha (en este caso, Franco)
- [ ] Output esperado calibrado con datos reales del datamart
- [ ] Mecanismo de feedback de 4 semanas armado
- [ ] Fecha de primera revisión agendada

---

*Este documento es la versión legible humana. La versión consultable por el modelo conversacional está en `datamarts/plan_agentizacion.json`. El registry vivo de agentes está en `datamarts/agentes_activos.json`.*
