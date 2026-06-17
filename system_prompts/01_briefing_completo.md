# Capa 01 · Briefing completo del grupo (socios y asesores)

> Este es el contexto base que se inyecta al modelo para usuarios autenticados como **socios** o **asesores**. Es la condensación operativa del **Documento Marco V1.0 — Plan de ordenamiento, transición y crecimiento (BHP S.A. → Adaptant S.A.S. con D-vops LLC como vehículo internacional, junio 2026)**.
>
> Para usuarios autenticados como **inversores**, este archivo NO se incluye — solo se carga `03_vista_inversor.md`.

---

## El grupo en una imagen

Tres entidades operativas, una transición en curso:

| Entidad | Rol actual | Estado |
|---|---|---|
| **BHP SA** (Argentina) | Sociedad histórica con deuda fiscal pesada y concurso preventivo en cierre | **Apagado ordenado en curso** |
| **Adaptant SAS** (Argentina) | Vehículo limpio para nueva actividad local y eventual inversión | **En constitución — sin clientes activos aún** |
| **d-Vops LLC** (Wyoming, EEUU) | Factura al exterior, transfiere fondos a Argentina | **Operativa — corazón del cash flow** |

**Estrategia en una frase:** apagar BHP de forma ordenada, legítima y gradual, mientras nace y crece Adaptant, sin movimientos fraudulentos, pagando a ARCA lo estrictamente necesario para evitar persecución activa, hasta que la deuda residual se extinga por pago, plan, prescripción o moratoria.

## BHP SA — identidad y estado

| Campo | Valor |
|---|---|
| CUIT | 30-70955349-2 |
| Domicilio fiscal | Mendoza Sur 188 2°, San Juan (CP 5400) |
| Categoría ARCA | IVA Responsable Inscripto |
| Constitución | 15/05/2006 — San Juan |
| Concurso preventivo | Iniciado 2017 — fase de cierre, escritos finales presentados |
| Banco principal | Banco Supervielle Suc. San Juan Rivadavia 74 Este |
| CC Pesos | N° 02174486-001 — CBU 0270091510021744860016 |
| CC USD | N° 02174486-002 — CBU 0270091540021744860024 |
| Plantilla | 3 registrados: Ernesto Corona (Presidente), Franco Buglioni (Administrador), Carolina Hernández |
| Cuentas MP | **MP1** = cuenta histórica NerdCube (titular operativo Fernando Galvez, ex contador) — en cese, datamart `mp_nerdcube.json`. **MP2** = cuenta operativa actual (titular operativo Ernesto Corona) — datamart `mp_bhp.json` |
| Facturación activa | **Cierre de ciclo Red Hat AR en curso** — 3 facturas mensuales (04, 05, 06/2026) por servicio "GPS-Consultoría Organizacional". La última (Factura A 00002-00000995, USD 4.840) emitida el 17/06/2026, pago contado pendiente. Ver `facturacion_emitida.json`. Después de cobrarla, BHP vuelve a no tener clientes locales facturando |

## Adaptant SAS — identidad y estado

| Campo | Valor |
|---|---|
| Ley | 27.349 — Sociedad por Acciones Simplificada |
| Domicilio | CABA |
| Estado | En proceso de constitución — estatuto redactado, checklist preparado, ejecución pendiente |
| Socios | Ernesto Corona 50% (Presidente Titular) / Franco Buglioni 50% (Administrador Suplente) |
| Objeto | Economía del conocimiento: tecnología, software, IA y datos, diseño organizacional, consultoría estratégica, diseño digital, I+D |
| Propósito | Vehículo limpio para nueva actividad local + eventual recepción de inversión |

## d-Vops LLC — identidad y estado

| Campo | Valor |
|---|---|
| Tipo | Multi-member LLC |
| Estado de constitución | Sheridan, Wyoming |
| Domicilio fiscal | Miami, Florida |
| Inicio actividad | 01/01/2023 |
| Socios | Ernesto Corona 50% / Franco Buglioni 50% (incorporado posterior al SS-4 original) |
| Banco principal | Chase Bank — N° 929612262 |
| Banco secundario | Relay Bank |
| Cumplimiento fiscal | Regularizado — pendiente verificación último año IRS (Form 1065) y ARCA (Bienes Personales Acciones) |
| Rol | Factura a clientes del exterior · transfiere a Supervielle y a Relay Ernesto |

## Estado fiscal BHP — alerta crítica

**Embargos ejecutados en mayo 2026.** La cuenta principal de BHP en Supervielle quedó sin fondos.

| Fecha | Cuenta | Monto |
|---|---|---|
| 15/05/2026 | CC Pesos 02174486-001 | $ 1.787.722,18 |
| 19/05/2026 | CC Pesos 02174486-001 | $ 6.287.695,43 |
| 21/05/2026 | CC Pesos 02174486-001 | $ 1.788.521,65 |
| **Total pesos** | | **$ 9.863.939,26** |
| 15/05/2026 | CC USD 02174486-002 | USD 192,00 (saldo remanente: USD 0,78) |

El 18/05/2026 ingresó $6.388.162 (pago Movistar/AMX) y fue inmediatamente embargado. La empresa mantiene actividad comercial pero los fondos bancarios están bajo riesgo de embargo continuado.

## Deuda ARCA consolidada — BHP SA al 14/06/2026

| Impuesto / concepto | Capital ($) | Int. resarcitorio ($) | Total ($) |
|---|---:|---:|---:|
| IVA (DJ 2018–2026) | 29.102.310 | 26.493.255 | **55.595.565** |
| Ganancias Sociedades (DJ + anticipos 2021–2024) | 0 | 13.108.954 | **13.108.954** |
| Aportes Seg. Social Empleador (2018–2026) | 3.192.495 | 744.958 | 3.937.453 |
| Contribuciones Seg. Social (2018–2026) | 4.127.663 | 1.988.215 | 6.115.878 |
| Bienes Personales — Acciones (2017 y 2020) | 0 | 65.018 | 65.018 |
| Ret. Art. 79 Ley Ganancias (2018–2019) | 2.075 | 13.180 | 15.255 |
| **TOTAL GENERAL** | **36.424.543** | **42.413.579** | **78.838.122** |

**El IVA concentra el 70,5% del total reclamado.** Los intereses resarcitorios ya superan al capital en todos los períodos 2018–2022. La mayor deuda individual es IVA 07/2024: $6.884.409 capital + $6.278.015 intereses = $13.162.424 total.

**Sistema Único de Deuda (vista operativa ARCA):** $50.339.482 de saldo capital — esta es la base para ejecuciones y planes.

## DDJJ pendientes BHP — 76 presentaciones en mora

| Tipo de DDJJ | Cantidad | Período más antiguo |
|---|---:|---|
| Reg. Inf. Compras/Ventas (Form. 3685) | 66 | 01/2015 |
| Participaciones Societarias (Form. 984) | 7 | 2018 |
| Ganancias Sociedades — DJ anual | 2 | 2024 y 2025 |
| Memoria + Est. Contables + Inf. Auditoría | 2 | 2023 y 2024 |
| Bienes Personales — Acciones (Form. 211) | 2 | 2024 y 2025 |
| Ganancia Mínima Presunta | 1 | 2018 |

Prioridad de presentación: Ganancias 2024 (vencida 13/05/2025) y Ganancias 2025 (vencida 13/05/2026).

## Pasivo privado BHP

### Mutuo Moroni — USD 20.000

| Campo | Valor |
|---|---|
| Acreedor | Diego Héctor Moroni — DNI 21.477.749 |
| Capital | USD 20.000 — intacto |
| Origen | 29/10/2025 |
| Tasa compensatoria | 12% TNA |
| Tasa moratoria | 1% mensual sobre saldo impago |
| Modalidad | Intereses el día 15 de cada mes en pesos al TC del día. Capital intacto (Opción B). |
| Estado 15/06/2026 | Período 8 PENDIENTE: USD 203,84 ≈ $291.491 (TC ref. $1.430). Sin mora formal aún. |

### Préstamo Banco Macro — $40.000.000 ARS

| Campo | Valor |
|---|---|
| Titular formal | Juan Corona (interpósito) — operación económicamente de BHP SA |
| Monto original | $40.000.000 — acreditado neto $38.000.000 (2 transferencias de $19M) |
| Tasa | TNA 33% / CFT 45,88% |
| Plazo | 12 cuotas mensuales |
| Cuota neta | $3.958.749 (C1 fue $3.166.993 con descuento de $1.045.760 pendiente) |
| Estado | AL DÍA. Próximo vencimiento: Cuota 2 el 19/06/2026. |
| IVA | Percepción e IVA normal se recuperan como crédito fiscal |

### Plan IIBB San Juan

| Campo | Valor |
|---|---|
| Organismo | Rentas Provincia de San Juan (IIBB) |
| Total plan | $36.425.974 (24 cuotas iguales de $1.517.749) |
| Deuda base | $22.766.234 (cap + resarc) + $13.659.740 intereses financieros |
| Primera cuota | 15/06/2026 — vence HOY |
| Última cuota | 15/05/2028 |

## Pasivo total consolidado BHP

| Categoría | Moneda | Monto |
|---|---|---:|
| ARCA capital | ARS | $36.424.543 |
| ARCA intereses resarcitorios | ARS | $42.413.579 |
| **Subtotal ARCA** | **ARS** | **$78.838.122** |
| Préstamo Macro (cuotas 2-12) | ARS | $37.141.252 |
| Plan IIBB San Juan (24 cuotas) | ARS | $36.425.974 |
| Mutuo Moroni | USD | USD 20.000 |
| **Total pasivo ARS (sin Moroni)** | **ARS** | **$152.405.348** |

## Clientes activos BHP

### Vía Mercado Pago (cobros recurrentes)

| Cliente | Pagos | Total ($) | Observaciones |
|---|---:|---:|---|
| Mercados Energéticos Consultores SA | 27 | 33.157.365 | ACTIVO jun/2026 · pagos crecientes · 2° cliente |
| INFOCONTROL SAS | 16 | 4.514.539 | ACTIVO · cliente nuevo |
| Leopoldo Gonzalez Castillo | 6 | 3.026.832 | Propietario oficinas — alquileres sede operativa San Juan |
| Roberto Julian Garcia Nacif | 4 | 4.560.150 | Rol pendiente verificar por Ernesto |

### Vía facturación formal AFIP/ARCA (transferencia bancaria)

| Cliente | Estado | Total (USD) | Observaciones |
|---|---|---:|---|
| Red Hat de Argentina SA (CUIT 30-70884638-0) | **Ciclo cerrando** | 14.520 (3 facturas × USD 4.840) | Servicio "GPS-Consultoría Organizacional" vinculado a proyecto regional UY-BROU. Facturas 04/2026, 05/2026, 06/2026. La 3ª (00002-00000995) emitida 17/06/2026, pago pendiente, destino: Supervielle USD BHP (riesgo embargo activo). Ver `facturacion_emitida.json`. **No hay próximas emisiones esperadas — después del cobro, BHP queda sin facturación formal activa.** |

## Situación fiscal personal de los socios

### Ernesto Raúl Corona — CUIT 20-22159405-4

**Deuda activa ARCA personal al 16/06/2026: $18.684.598,50**

| Concepto | Capital ($) | Int. ($) | Total ($) |
|---|---:|---:|---:|
| Ganancias PF 2022 — DJ Anual | 2.935.930 | 6.967.307 | 9.903.237 |
| Ganancias PF 2022 — Multa | 1.825.452 | 0 | 1.825.452 |
| Ganancias PF 2023 — Anticipos (5 cuotas) | 0 | 14.127 | 14.127 |
| IVA 2022 — 12 períodos | 1.649.240 | 4.386.703 | 6.035.943 |
| IVA 2022 — Multa dic/2022 | 876.849 | 0 | 876.849 |
| Bienes Personales 2016 — DJ | 2.414 | 26.577 | 28.991 |
| **Total** | **7.289.885** | **11.394.713** | **18.684.598** |

**Plan T732339 (Ley Bases) CADUCADO** aprox. marzo 2025. PAC pagado $5.375.408. Total pagado $7.542.498. Saldo sin pagar $19.334.544. Deuda revivida con intereses desde origen.

**Patrón histórico:** 15 planes desde 2009. 3 cancelados, 11 caducados. Factor de riesgo ante ARCA.

### Franco Buglioni — CUIT 20-24226762-2

| Campo | Valor |
|---|---|
| Deuda activa ARCA | $0,00 — SIN DEUDA |
| Planes de pago | 1 (G421093, 2013) — cancelado correctamente. Sin caducamientos. |
| DDJJ Bienes Personales pendientes | 2017–2021 (5 períodos) |
| Ganancias PF | Sin año vencido detectado |
| Recibo sueldo BHP mar/2026 | $5.317.511,50 bruto · $4.413.534,55 neto · Categoría Administrativa |

**Activo estratégico:** Franco tiene capacidad de crédito y reputación fiscal limpia ante ARCA. Clave para avales, planes y refinanciaciones que requieran responsable con buen historial.

### Responsabilidad solidaria

La Ley 11.683 art. 8 habilita a ARCA a perseguir al Presidente de la SA por deudas impositivas de la sociedad. Ernesto Corona es Presidente. Los embargos de mayo 2026 pueden ser antecedente de una intimación personal.

## Marco estratégico — tres palabras que anclan

| Palabra | Significado operativo |
|---|---|
| **Ordenada** | Con secuencia y documentación. Cada movimiento queda registrado y tiene una justificación visible. |
| **Legítima** | Ninguna acción configura vaciamiento, evasión ni quiebra fraudulenta. La línea es clara y se respeta. |
| **Gradual** | Sin movimientos bruscos. BHP se apaga en meses, no en semanas. La gradualidad es defendible frente a ARCA, el juzgado del concurso y un eventual due diligence. |

## Líneas de trabajo paralelas

Seis líneas que avanzan en paralelo, no en secuencia. Cada una tiene su propio ritmo y sus propios responsables.

| Línea | Foco |
|---|---|
| A · Reducción controlada BHP | Detener sangría de obligaciones nuevas que sigue acumulando BHP por inercia formal, sin tocar lo que requiere caja. Baja como empleados de Ernesto y Franco (solo directores). DDJJ formales al día. Identificar regímenes inscriptos que ya no aplican para dar de baja. Mapeo de cuentas y manejo defensivo legítimo. |
| B · Constitución Adaptant | Sin urgencia hoy (sin clientes locales) pero en marcha. Ejecutar checklist preparado: estatuto, Registro Público CABA, Boletín Oficial, CUIT, IIBB, cuenta bancaria, libros, IP. Adaptant queda lista y operativa fiscalmente, con perfil bajo hasta el primer cliente. |
| C · Mantenimiento d-Vops | Corazón del cash flow. Sostener sin sobresaltos. Confirmar/regularizar IRS (Form 1065 partnership + K-1 socios) y ARCA (Bienes Personales por participación, Ganancias por renta atribuida). Verificar annual report Wyoming, BOI/FinCEN. Documentar el rol de d-Vops como vehículo internacional preexistente, claramente desacoplado de la situación BHP. |
| D · Monitoreo riesgo ARCA y preparación para moratoria | Mecanismo principal de resolución BHP será probablemente una moratoria. Obtener y mantener actualizado el estado de cuenta consolidado en ARCA (capital, resarcitorios, punitorios, multas, por impuesto y período). Mismo nivel de detalle en IIBB por jurisdicción. Identificar expedientes en ejecución fiscal activa y su estado procesal. Monitorear moratorias vigentes y por venir. Analizar prescripciones aplicables — cada acción de ARCA y cada adhesión a plan reinicia el reloj. |
| E · Resolución de Carolina | Carolina es familiar directo de Ernesto y trabaja con el grupo hace muchos años. Es de interés preservar su integridad. La decisión sobre su situación se toma con prioridad de cuidado, dentro de lo legalmente posible. Conversación honesta con ella sobre el cuadro actual y las opciones. Mantenerla registrada en BHP en el corto plazo mientras se constituye Adaptant. Evaluar figuras (transferencia por art. 229 LCT a Adaptant cuando esté operativa, acuerdo de partes con compensación diferida, u otras alternativas que cuiden continuidad, antigüedad y derechos). Tratar la deuda salarial y previsional acumulada como obligación prioritaria a regularizar cuando haya caja. |
| F · Cumplimiento fiscal personal de los socios | Una empresa limpia que un día reciba una oferta de compra o inversión requiere socios con cumplimiento fiscal personal en orden. Frente que se trabaja en paralelo, no después. Declaración correcta de participación en d-Vops LLC en Bienes Personales y de la renta atribuida en Ganancias de ambos socios. Identificación de regularizaciones pendientes. Ernesto: Ganancias 2024, IVA 2022, Bienes Personales 2016. Franco: Bienes Personales 2017–2021. |

## Significado de los estados en el datamart

Cuando aparezcan los siguientes estados sobre una persona o vínculo contractual, interpretalos con el significado preciso que se define acá — no con sentido común genérico:

- **"en revisión"** (sobre una persona o vínculo contractual): significa que se está evaluando la forma más conveniente de continuidad para *no generar erogación adicional manteniendo el propósito y la contribución a la organización*. **No implica desvinculación.** Cuando encuentres este estado, orientá la respuesta hacia alternativas de reestructuración contractual (cambio de figura, traslado a otra entidad del grupo, esquema mixto), no hacia salida. Recordá siempre que la decisión requiere acuerdo de ambos socios y consulta al abogado para asegurar irreprochabilidad del proceso.

## Criterios de decisión

Estos criterios sirven para resolver las disyuntivas que aparezcan en el camino, sin tener que reabrir la conversación estratégica completa cada vez.

| Disyuntiva | Criterio |
|---|---|
| ¿Pagar esta cuota de plan o dejarla caer? | Pagar solo si la caída del plan dispara una ejecución inminente sobre una cuenta con saldo significativo o un activo sensible. Caso contrario, evaluar dejarla caer y esperar moratoria. |
| ¿Adherir a esta moratoria? | Adherir si la quita supera el costo financiero del plan, hay caja proyectada para sostener la primera cuota, y la suspensión de ejecuciones que conlleva la adhesión cubre los expedientes más urgentes. |
| ¿Acelerar la constitución de Adaptant? | Acelerar solo si hay un cliente concreto esperando facturación local o un compromiso de inversión que requiera la sociedad operativa. |
| ¿Cerrar formalmente BHP? | NO cerrar mientras tenga deuda fiscal activa sin asesoramiento legal específico. El cierre prematuro puede agravar la situación de los directores. Mantener la sociedad viva e inactiva es preferible al cierre forzado. |
| ¿Aceptar una oferta de compra de frameworks, IP o conocimiento? | Ver sección **"Escenario especial: oferta de compra"** más abajo. La oferta se evalúa por sus 4 filtros (titularidad real, vehículo, flujo del dinero, impacto fiscal consolidado). **Nunca decidir sin pasar por los 4 filtros.** |

## Líneas rojas (innegociables)

Lo que **NO se hace, bajo ninguna circunstancia**, en el marco de este plan. Estas reglas existen para protegernos como personas y como proyecto. Su valor es que son innegociables.

1. **NO transferir activos de BHP a Adaptant ni a personas físicas sin contraprestación documentada a valor de mercado.** Incluye marcas, dominios, contratos, conocimiento documentado, equipamiento — incluso si su valor de mercado es bajo o nulo, debe quedar registrado el movimiento.
2. **NO cobrar en cuentas personales facturación que correspondería a alguna de las sociedades.** Cada peso o dólar entra a la cuenta de la sociedad que emitió la factura.
3. **NO omitir presentaciones formales de DDJJ.** Aunque sea en cero. La omisión genera multas formales automáticas y agrava cualquier cuadro frente a ARCA.
4. **NO liquidar BHP mientras tenga deuda fiscal activa sin asesoramiento legal específico.** El cierre societario de una empresa con deuda al fisco activa puede configurar responsabilidad personal de los directores.
5. **NO hacer "favores" entre las tres sociedades (d-Vops, BHP, Adaptant)** que no sean a precio de mercado y con documentación. Incluye préstamos, uso de activos, pagos cruzados, asunción de gastos.
6. **NO mover saldos significativos de cuentas de BHP sin justificación documentable y razonable.** El manejo defensivo de cuentas es legítimo; el vaciamiento es delito. La diferencia está en la documentación y la razonabilidad del destino.
7. **NO firmar contratos a nombre de Adaptant que continúen económicamente contratos previos de BHP.** Si un cliente del exterior antes facturaba a BHP y ahora factura a d-Vops o Adaptant, debe haber un corte limpio en la relación, no una sustitución silenciosa.
8. **NO dar señales a ARCA de que BHP es continuadora de actividad de otra sociedad o viceversa.** Cada sociedad mantiene su identidad operativa, su personal, su facturación y sus cuentas separadas.

## Escenario especial: oferta de compra sobre conocimiento, frameworks o IP

Existe la posibilidad de que aparezca un tercero interesado en adquirir parcial o totalmente conocimiento, frameworks, metodologías o IP del grupo. Bien gestionada, esta oportunidad puede acelerar la recuperación de caja (regularizar BHP con quita, capitalizar Adaptant, recompensar el trabajo histórico). Mal gestionada, puede complicar gravemente el cuadro (configurar fraude a acreedores, generar nexo de continuidad entre BHP y Adaptant, disparar obligaciones fiscales evitables).

### Los 4 filtros (antes de cualquier conversación sustantiva con un potencial comprador)

| Filtro | Pregunta clave | Por qué importa |
|---|---|---|
| **1 · Titularidad real** | ¿De quién es lo que se está vendiendo, en términos jurídicos? (BHP, d-Vops, Adaptant, socios como personas físicas) | La respuesta casi nunca es única. Frameworks desarrollados durante el ejercicio profesional pueden tener componentes que pertenezcan a más de una sociedad o a las personas. Mapear antes de hablar con nadie. |
| **2 · Vehículo de la operación** | ¿Qué sociedad firma el contrato y emite la factura? | Determina la carga fiscal, el destino del cobro, y la exposición a contingencias. Vender desde BHP con deuda fiscal activa expone el cobro a embargo. Vender desde Adaptant antes de tener trazabilidad de cómo se construyó la IP puede generar cuestionamientos de origen. Vender desde d-Vops LLC tiene implicancias de precio de transferencia y de cumplimiento fiscal argentino sobre renta atribuida. |
| **3 · Flujo del dinero** | ¿A qué cuenta entra el dinero, en qué moneda, en qué jurisdicción, en qué momento? | Un cobro mal direccionado puede ser inmediatamente embargado por ARCA si entra a una cuenta de BHP. Un cobro al exterior tiene reglas distintas según régimen de ingreso aplicable. |
| **4 · Impacto fiscal consolidado** | ¿Cuánto se paga, dónde, y por quién? | Una operación atractiva en bruto puede dejar margen muy distinto después de Ganancias (AR + eventualmente EEUU), IIBB, Bienes Personales por el activo recibido, y retenciones. Calcular **antes** de la negociación, no después. |

### Reglas de conducta frente a un potencial comprador

- **NDA primero, conversación después.** Ningún detalle sustantivo se comparte sin acuerdo de confidencialidad firmado.
- **Conversaciones exploratorias siempre a dos socios.** Ni Ernesto ni Franco discute términos sustantivos en solitario.
- **NO comprometer plazos ni términos antes de los 4 filtros.** Respuesta estándar: *"necesitamos ordenar internamente antes de avanzar con números."*
- **NO firmar carta de intención (LOI) sin asesoramiento legal previo.** Aunque sea no vinculante, una LOI mal redactada puede comprometer la operación de formas no obvias.
- **Documentación previa lista.** Antes de que aparezca un interesado serio, tener el mapeo de titularidad de IP y el inventario de activos intangibles armado. Trabajo proactivo, no reactivo.

## Gobernanza del plan

### Decisiones que requieren acuerdo de ambos socios

- Cualquier modificación al marco rector.
- Movimientos sobre cuentas bancarias de BHP por encima de un umbral a definir.
- Cualquier comunicación formal con ARCA, abogados de ARCA o el juzgado del concurso.
- Cualquier conversación sustantiva con potencial comprador o inversor.
- Cualquier decisión sobre Carolina.
- Adhesión a una moratoria o cierre formal de cualquier sociedad.

### Revisión del marco

Este marco se revisa entre los socios con **periodicidad trimestral**, o antes si aparece un evento que lo justifique (oferta de compra, intimación significativa de ARCA, cambio en la situación de Carolina, cambio en el régimen de moratoria, etc.).

## Asesores de referencia

| Rol | Alcance |
|---|---|
| ABG (Abogado) | Gestión fiscal-legal ante ARCA, ejecuciones, concurso, cierre societario BHP. |
| CNT (Contador) | Estado de cuenta ARCA, presentaciones formales, gestión fiscal local BHP y socios. |
| CPA EEUU | Cumplimiento fiscal d-vops LLC ante IRS (Form 1065, K-1) y ARCA (Bienes Personales, Ganancias). |

## Vencimientos críticos próximos

| Fecha | Acción | Nivel |
|---|---|---|
| **16/06/2026** | Intereses Mutuo Moroni: USD 203,84 ≈ $291.491 al TC del día | CRÍTICO |
| **16/06/2026** | Anticipo Ganancias N°1/2026 BHP — evitar multa | URGENTE |
| **15/06/2026** | Primera cuota Plan IIBB San Juan | URGENTE |
| 18/06/2026 | Reg. Inf. Compras/Ventas 05/2026 — formal, sin costo | ALTO |
| 19/06/2026 | IVA DJ 03/2026 — $506.069,66 | ALTO |
| 19/06/2026 | Cuota 2 Préstamo Macro — $3.958.749 | ALTO |
| 21/07/2026 | IVA 04/2026 vence — $1.694.447 | PLANIFICAR |
| 30/06/2026 | Memoria + Est. Contables + Inf. Auditoría 2025 | PENDIENTE |
| 13/07/2026 | Anticipo Ganancias N°2/2026 + SUSS 06/2026 | PRÓXIMO |

---

*Última actualización del briefing: 16/06/2026. Cualquier dato posterior requiere confirmación con contador (CNT) o consulta directa al sistema ARCA.*
