// auth.js — login y manejo de sesión
// Todo envuelto en un IIFE para no declarar nombres en el scope global:
// index.html, chat.js y feedback.html son scripts clásicos (no módulos) y
// comparten ese scope, así que cualquier `function`/`const` de nivel superior
// acá chocaría con destructuring de los mismos nombres en esos archivos.
(function () {
  const WORKER_URL = window.OC_WORKER_URL || "https://oc-adaptant-interno.YOURNAME.workers.dev";

  const SUGERIDAS_POR_NIVEL = {
    socios: [
      "¿Cuánto es la deuda actual consolidada de BHP con ARCA?",
      "¿Qué vencimientos tenemos esta semana?",
      "¿Cuánto pago de Macro este mes?",
      "Estado del Mutuo Moroni",
      "¿Cuánto entró de Mercados Energéticos en mayo 2026?",
      "Mostrame los embargos ARCA del 2026",
      "¿Cuál es el runway de Adaptant escenario A vs B?",
      "Status del concurso preventivo",
      "Estado de constitución de Adaptant SAS",
    ],
    asesores: [
      "Resumen consolidado de deuda ARCA al corte actual",
      "Listado completo de DDJJ pendientes BHP",
      "Cronograma de pagos próximos 30 días",
      "Análisis de riesgo ARCA — factores activos",
      "Movimientos bancarios por categoría en 2026",
      "Ingresos COMEX recibidos en los últimos 12 meses",
      "Cumplimiento fiscal d-Vops LLC — pendientes",
      "Estructura societaria y composición accionaria",
    ],
    contador: [
      "Estado de cuenta consolidado ARCA por impuesto y período",
      "Listado completo de DDJJ pendientes BHP — orden de prioridad",
      "Plan caducado T732339 (Ley Bases) Ernesto — situación actual",
      "Pasivos fiscales generados por facturación Red Hat AR en curso",
      "Vencimientos fiscales próximos 30 días con monto y CBU/CUIT",
      "Detalle IVA Débito vs Crédito Fiscal BHP por período",
      "Situación de DDJJ Bienes Personales pendientes (socios)",
      "Plan IIBB San Juan — estado cuotas y próximos vencimientos",
      "Embargos ejecutados sobre cuentas BHP en 2026",
    ],
    inversores: [
      "¿Qué es el OC Framework de Adaptant?",
      "Tracción comercial actual",
      "Mercados objetivo y plan LATAM",
      "Líneas de producto y rango de precios",
      "Partners y aplicaciones en curso",
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
    return await resp.json();
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
