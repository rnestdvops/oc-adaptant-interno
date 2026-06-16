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
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
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

    if (data.error) {
      addMessage("assistant", `Error: ${data.error.message || JSON.stringify(data.error)}`);
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
    addMessage("assistant", `Error de red: ${e.message}`);
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
