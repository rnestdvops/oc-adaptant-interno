// auth.js — login y manejo de sesión
// Todo envuelto en un IIFE para no declarar nombres en el scope global:
// index.html y chat.js son scripts clásicos (no módulos) y comparten ese
// scope, así que cualquier `function`/`const` de nivel superior acá
// chocaría con destructuring de los mismos nombres en esos archivos.
(function () {
  const WORKER_URL = window.OC_WORKER_URL || "https://oc-adaptant-interno.YOURNAME.workers.dev";

  const SUGERIDAS_POR_NIVEL = {
    socios: [
      "¿Cuánto es la deuda actual consolidada de BHP con ARCA?",
      "¿Qué vencimientos tenemos esta semana?",
      "¿Cuánto pago de Macro este mes?",
      "Estado del Mutuo Moroni",
      "¿Cuál es la deuda personal mía con ARCA?",
      "¿Qué obligaciones quedan pendientes para disolver BHP?",
      "¿Conviene evaluar moratoria ARCA por IVA?",
      "Status del concurso preventivo",
      "Estado de constitución de Adaptant SAS",
    ],
    asesores: [
      "Resumen consolidado de deuda ARCA al corte actual",
      "Listado completo de DDJJ pendientes BHP",
      "Cronograma de pagos próximos 30 días",
      "Análisis de riesgo ARCA — factores activos",
      "Estado del plan Ley Bases (T732339) de Ernesto",
      "Cumplimiento fiscal d-Vops LLC — pendientes",
      "Estructura societaria y composición accionaria",
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
