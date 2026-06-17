// chat.js — lógica del chat

const { WORKER_URL: CHAT_WORKER_URL, getSession, clearSession, getSugeridas } = window.OCAuth;

const history = []; // messages para la API

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Markdown muy básico para renderizar respuestas
function renderMarkdown(text) {
  let html = escapeHtml(text);

  // Tablas (formato pipe)
  html = html.replace(/((?:^\|.*\|\s*\n?)+)/gm, (match) => {
    const lines = match.trim().split("\n");
    if (lines.length < 2) return match;
    const headers = lines[0].split("|").slice(1, -1).map(s => s.trim());
    const sep = lines[1];
    if (!/^\|[\s\-:|]+\|$/.test(sep.trim())) return match;
    const rows = lines.slice(2).map(line =>
      line.split("|").slice(1, -1).map(s => s.trim())
    );
    let table = "<table><thead><tr>" + headers.map(h => `<th>${h}</th>`).join("") + "</tr></thead><tbody>";
    rows.forEach(row => {
      table += "<tr>" + row.map(c => `<td>${c}</td>`).join("") + "</tr>";
    });
    table += "</tbody></table>";
    return table;
  });

  // Encabezados
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");

  // Negritas e itálicas
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, "<em>$1</em>");

  // Code inline
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Listas
  html = html.replace(/^(- |\* )(.+)$/gm, "<li>$2</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  // Párrafos
  html = html
    .split(/\n\n+/)
    .map(p => {
      if (/^<(h[1-6]|ul|ol|table|pre|blockquote)/.test(p.trim())) return p;
      if (p.trim() === "") return "";
      return "<p>" + p.replace(/\n/g, "<br>") + "</p>";
    })
    .join("\n");

  return html;
}

function addMessage(role, text) {
  const messagesEl = document.getElementById("messages");
  const welcome = document.getElementById("welcome");
  if (welcome) welcome.remove();

  const wrap = document.createElement("div");
  wrap.className = `message ${role}`;
  wrap.innerHTML = `
    <div class="message-role">${role === "user" ? "Vos" : "OC Adaptant"}</div>
    <div class="message-body">${renderMarkdown(text)}</div>
  `;

  if (role === "assistant") {
    const lastUser = [...history].reverse().find(m => m.role === "user");
    wrap.appendChild(buildFeedbackRow(lastUser ? lastUser.content : "", text));
  }

  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function buildFeedbackRow(question, answer) {
  const row = document.createElement("div");
  row.className = "feedback-row";

  const upBtn = document.createElement("button");
  upBtn.className = "feedback-btn";
  upBtn.title = "Esta respuesta estuvo bien";
  upBtn.textContent = "👍";

  const downBtn = document.createElement("button");
  downBtn.className = "feedback-btn";
  downBtn.title = "Esta respuesta no estuvo bien";
  downBtn.textContent = "👎";

  const finish = (label) => {
    upBtn.disabled = true;
    downBtn.disabled = true;
    const thanks = document.createElement("span");
    thanks.className = "feedback-thanks";
    thanks.textContent = label;
    row.appendChild(thanks);
  };

  upBtn.onclick = async () => {
    upBtn.classList.add("active", "up");
    await sendFeedback({ vote: "up", question, answer });
    finish("Gracias por el feedback.");
  };

  downBtn.onclick = () => {
    downBtn.classList.add("active", "down");
    upBtn.disabled = true;
    downBtn.disabled = true;
    row.appendChild(buildFeedbackForm(question, answer, row));
  };

  row.appendChild(upBtn);
  row.appendChild(downBtn);
  return row;
}

function buildFeedbackForm(question, answer, row) {
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
    await sendFeedback({ vote: "down", question, answer, comment: textarea.value });
    form.remove();
    const thanks = document.createElement("span");
    thanks.className = "feedback-thanks";
    thanks.textContent = "Gracias, lo vamos a revisar.";
    row.appendChild(thanks);
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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // Silencioso: no queremos romper el chat si falla el feedback.
  }
}

async function loadVersionInfo() {
  const headerEl = document.getElementById("version-info");
  const lastUpdateEl = document.getElementById("last-update-date");
  const today = new Date().toLocaleDateString("es-AR");
  let hash = "dev";
  let deployedAt = null;
  try {
    const resp = await fetch("/version.json", { cache: "no-store" });
    if (resp.ok) {
      const data = await resp.json();
      if (data.hash) hash = data.hash;
      if (data.deployed_at) deployedAt = data.deployed_at;
    }
  } catch (e) {
    // Sin version.json (entorno local) — se queda en "dev" sin fecha.
  }
  if (headerEl) headerEl.textContent = `v${hash} · ${today}`;
  if (lastUpdateEl) {
    if (deployedAt) {
      // deployed_at viene como "YYYY-MM-DD" desde Netlify build → reformat a dd/mm/yyyy.
      const [y, m, d] = deployedAt.split("-");
      lastUpdateEl.textContent = `${d}/${m}/${y}`;
    } else {
      // Fallback (local o version.json sin deployed_at): mostrar fecha de hoy.
      lastUpdateEl.textContent = today;
    }
  }
}

function showThinking() {
  const messagesEl = document.getElementById("messages");
  const wrap = document.createElement("div");
  wrap.className = "message assistant";
  wrap.id = "thinking-msg";
  wrap.innerHTML = `
    <div class="message-role">OC Adaptant</div>
    <div class="message-body"><span class="thinking">pensando</span></div>
  `;
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function clearThinking() {
  const el = document.getElementById("thinking-msg");
  if (el) el.remove();
}

async function send(userText) {
  if (!userText.trim()) return;

  const session = getSession();
  if (!session) {
    window.location.href = "/";
    return;
  }

  addMessage("user", userText);
  history.push({ role: "user", content: userText });

  const sendBtn = document.getElementById("send-btn");
  const ta = document.getElementById("composer-input");
  sendBtn.disabled = true;
  ta.value = "";
  showThinking();

  try {
    const resp = await fetch(`${CHAT_WORKER_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ messages: history }),
    });

    clearThinking();

    if (resp.status === 401) {
      clearSession();
      addMessage("assistant", "La sesión expiró. Recargá la página para volver a entrar.");
      return;
    }

    const data = await resp.json();

    // Error mapeado por el Worker → mensaje amigable en el tono del OC
    if (data.ok === false && data.friendly_message) {
      addMessage("assistant", data.friendly_message);
      // Removemos el último mensaje del usuario del history para que un
      // reintento no duplique el contexto ni rompa la alternancia user/assistant.
      history.pop();
      return;
    }

    // Fallback defensivo: errores no mapeados que vengan con formato Anthropic.
    if (data.error) {
      addMessage("assistant", "Algo salió mal procesando la consulta. Reintentá en unos segundos.");
      history.pop();
      return;
    }

    // Extraer texto de los content blocks (puede haber tool_use intercalados)
    const textBlocks = data.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n\n");

    if (textBlocks) {
      addMessage("assistant", textBlocks);
      history.push({ role: "assistant", content: textBlocks });
    } else {
      addMessage("assistant", "(sin respuesta de texto)");
    }
  } catch (e) {
    clearThinking();
    addMessage("assistant", "No pude conectarme con el servidor. Revisá tu conexión y reintentá.");
    history.pop();
  } finally {
    sendBtn.disabled = false;
    ta.focus();
  }
}

function setupChat() {
  const session = getSession();
  if (!session) {
    window.location.href = "/";
    return;
  }

  document.getElementById("session-level").textContent = session.level;
  loadVersionInfo();

  // Sugeridas
  const sidebar = document.getElementById("suggested-questions");
  getSugeridas(session.level).forEach(q => {
    const btn = document.createElement("button");
    btn.className = "suggested-q";
    btn.textContent = q;
    btn.onclick = () => send(q);
    sidebar.appendChild(btn);
  });

  // Logout
  document.getElementById("logout-btn").onclick = () => {
    clearSession();
    window.location.href = "/";
  };

  // Composer
  const ta = document.getElementById("composer-input");
  const sendBtn = document.getElementById("send-btn");
  sendBtn.onclick = () => send(ta.value);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(ta.value);
    }
  });
  ta.addEventListener("input", () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  });
  ta.focus();
}

document.addEventListener("DOMContentLoaded", setupChat);
