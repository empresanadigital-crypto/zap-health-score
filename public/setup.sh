#!/bin/bash
set -e

echo "=== ReadyZap VPS Setup ==="

# 1. Instalar dependencias
cd /root
npm install express @whiskeysockets/baileys@6.7.7 qrcode pino 2>/dev/null || {
  echo "Instalando npm..."
  apt-get update && apt-get install -y nodejs npm
  npm install express @whiskeysockets/baileys@6.7.7 qrcode pino
}

# 2. Instalar PM2
which pm2 >/dev/null 2>&1 || npm install -g pm2

# 3. Matar processo antigo
pm2 delete readyzap 2>/dev/null || true
fuser -k 3333/tcp 2>/dev/null || true
sleep 1

# 4. Criar server.js via Node
node -e '
const fs = require("fs");
const code = `
const express = require("express");
const { default: makeWASocket, useMultiFileAuthState, Browsers } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");
const pino = require("pino");
const fs2 = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const AUTH_DIR = path.join(__dirname, "auth_state");
let sessionCounter = 0;

function createState() {
  return {
    status: "idle",
    qrBase64: null,
    sock: null,
    analysisData: null,
    chats: new Map(),
    lastError: null,
    lastDisconnectCode: null,
    connectedAt: null,
    lastChatUpdateAt: 0,
    sessionId: sessionCounter,
  };
}

let state = createState();

function ensureAuthDir() {
  if (!fs2.existsSync(AUTH_DIR)) {
    fs2.mkdirSync(AUTH_DIR, { recursive: true });
  }
}

function clearAuthState() {
  if (fs2.existsSync(AUTH_DIR)) {
    fs2.rmSync(AUTH_DIR, { recursive: true, force: true });
  }
}

function closeSocket(sock) {
  if (!sock) return;
  try { sock.end(); } catch {}
  try { sock.ws && sock.ws.close && sock.ws.close(); } catch {}
}

function resetState(options = {}) {
  const clearAuth = options.clearAuth !== false;
  const currentSock = state.sock;

  closeSocket(currentSock);

  if (clearAuth) {
    clearAuthState();
  }

  sessionCounter += 1;
  state = createState();
}

function disconnectSocketKeepAnalysis() {
  const currentSock = state.sock;
  closeSocket(currentSock);
  state.sock = null;
  state.qrBase64 = null;
  clearAuthState();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function updateChats(chats) {
  if (!Array.isArray(chats) || chats.length === 0) return;

  let changed = 0;
  for (const chat of chats) {
    if (!chat || typeof chat !== "object") continue;
    const id = chat.id || chat.jid;
    if (!id) continue;

    const previous = state.chats.get(id) || {};
    state.chats.set(id, { ...previous, ...chat });
    changed += 1;
  }

  if (changed > 0) {
    state.lastChatUpdateAt = Date.now();
    console.log("[chats] Total armazenado:", state.chats.size);
  }
}

function normalizeConversationTimestamp(value) {
  if (!value) return null;
  if (typeof value === "object" && typeof value.low === "number") {
    return value.low > 0 ? value.low : null;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
  return Math.floor(numericValue);
}

async function waitForHistory(sessionId) {
  const startedAt = Date.now();
  const maxExtraWaitMs = 25000;
  const quietWindowMs = 2500;

  while (Date.now() - startedAt < maxExtraWaitMs) {
    if (state.sessionId !== sessionId) return false;
    if (state.status === "error" || state.status === "disconnected") return false;

    const chatCount = state.chats.size;
    const quietForMs = Date.now() - state.lastChatUpdateAt;

    if ((chatCount > 0 && quietForMs >= quietWindowMs) || Date.now() - startedAt >= 8000) {
      return true;
    }

    await wait(500);
  }

  return true;
}

async function collectData(sock) {
  console.log("[collect] Iniciando coleta de dados reais...");

  const data = {
    phone: null,
    name: null,
    hasProfilePic: null,
    hasStatus: null,
    groupCount: null,
    chatCount: null,
    oldestMessageTimestamp: null,
    groups: [],
    timestamp: Date.now(),
  };

  try {
    if (sock.user) {
      data.phone = sock.user.id || null;
      data.name = sock.user.name || null;
    }
    console.log("[collect] phone:", data.phone, "name:", data.name);
  } catch (error) {
    console.error("[collect] user error:", error && error.message ? error.message : String(error));
  }

  try {
    if (sock.user && sock.user.id) {
      const profilePictureUrl = await sock.profilePictureUrl(sock.user.id, "image").catch(() => null);
      data.hasProfilePic = profilePictureUrl ? true : false;
    }
    console.log("[collect] hasProfilePic:", data.hasProfilePic);
  } catch (error) {
    console.error("[collect] pic error:", error && error.message ? error.message : String(error));
  }

  try {
    if (sock.user && sock.user.id) {
      const statusData = await sock.fetchStatus(sock.user.id).catch(() => null);
      data.hasStatus = statusData && statusData.status ? true : false;
    }
    console.log("[collect] hasStatus:", data.hasStatus);
  } catch (error) {
    console.error("[collect] status error:", error && error.message ? error.message : String(error));
  }

  try {
    const groupMeta = await sock.groupFetchAllParticipating().catch(() => null);
    if (groupMeta && typeof groupMeta === "object") {
      const groupIds = Object.keys(groupMeta);
      data.groupCount = groupIds.length;
      data.groups = groupIds.map((id) => ({
        name: groupMeta[id] && groupMeta[id].subject ? groupMeta[id].subject : "Sem nome",
        participants: Array.isArray(groupMeta[id] && groupMeta[id].participants) ? groupMeta[id].participants.length : 0,
      }));
    }
    console.log("[collect] groupCount:", data.groupCount);
  } catch (error) {
    console.error("[collect] groups error:", error && error.message ? error.message : String(error));
  }

  try {
    const chats = Array.from(state.chats.values());
    let individualCount = 0;
    let oldestTs = null;

    for (const chat of chats) {
      const jid = chat && chat.id ? chat.id : "";
      if (!jid.endsWith("@s.whatsapp.net")) continue;

      individualCount += 1;
      const ts = normalizeConversationTimestamp(chat.conversationTimestamp);
      if (ts !== null && (oldestTs === null || ts < oldestTs)) {
        oldestTs = ts;
      }
    }

    data.chatCount = individualCount > 0 ? individualCount : null;
    data.oldestMessageTimestamp = oldestTs;
    console.log("[collect] chatCount:", data.chatCount, "oldestTs:", data.oldestMessageTimestamp);
  } catch (error) {
    console.error("[collect] chats error:", error && error.message ? error.message : String(error));
  }

  return data;
}

async function startSession() {
  if (["connecting", "waiting_scan", "connected", "collecting"].includes(state.status)) {
    return;
  }

  ensureAuthDir();
  state.status = "connecting";
  state.qrBase64 = null;
  state.analysisData = null;
  state.chats = new Map();
  state.lastError = null;
  state.lastDisconnectCode = null;
  state.connectedAt = null;
  state.lastChatUpdateAt = Date.now();

  const sessionId = state.sessionId;
  const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    version: [2, 3000, 1015901307],
    auth: authState,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: Browsers.macOS("Chrome"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  state.sock = sock;

  sock.ev.on("messaging-history.set", ({ chats }) => {
    console.log("[history] Recebidos", Array.isArray(chats) ? chats.length : 0, "chats do histórico");
    updateChats(chats);
  });

  sock.ev.on("chats.set", ({ chats }) => {
    console.log("[chats.set] Recebidos", Array.isArray(chats) ? chats.length : 0, "chats");
    updateChats(chats);
  });

  sock.ev.on("chats.upsert", (chats) => {
    console.log("[chats.upsert] Recebidos", Array.isArray(chats) ? chats.length : 0, "chats");
    updateChats(chats);
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const connection = update.connection;
    const lastDisconnect = update.lastDisconnect;
    const qr = update.qr;

    if (state.sessionId !== sessionId) {
      return;
    }

    if (qr) {
      try {
        state.qrBase64 = await QRCode.toDataURL(qr, { width: 256 });
        state.status = "waiting_scan";
        console.log("[qr] QR gerado com sucesso");
      } catch (error) {
        state.lastError = error && error.message ? error.message : String(error);
        state.status = "error";
        console.error("[qr] Erro ao gerar QR:", state.lastError);
      }
    }

    if (connection === "open") {
      console.log("[conn] WhatsApp conectado!");
      state.status = "connected";
      state.qrBase64 = null;
      state.connectedAt = Date.now();
      state.lastChatUpdateAt = Date.now();

      try {
        await wait(3000);

        if (state.sessionId !== sessionId) return;

        state.status = "collecting";
        await waitForHistory(sessionId);

        if (state.sessionId !== sessionId) return;

        const data = await collectData(sock);
        if (state.sessionId !== sessionId) return;

        state.analysisData = data;
        state.status = "ready";
        state.lastError = null;
        console.log("[collect] Dados prontos:", JSON.stringify(data, null, 2));

        setTimeout(() => {
          if (state.sessionId !== sessionId) return;
          console.log("[auto] Desconectando sessão...");
          disconnectSocketKeepAnalysis();
        }, 1500);
      } catch (error) {
        state.lastError = error && error.message ? error.message : String(error);
        state.status = "error";
        console.error("[collect] Erro na coleta:", state.lastError);
        disconnectSocketKeepAnalysis();
      }
    }

    if (connection === "close") {
      const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
        ? lastDisconnect.error.output.statusCode
        : null;

      state.lastDisconnectCode = code;
      console.log("[conn] Desconectado, code:", code);

      if (state.status !== "ready") {
        state.status = "disconnected";
        state.qrBase64 = null;
        state.sock = null;
        state.lastError = code ? "connection_closed_" + code : "connection_closed";
        clearAuthState();
      }
    }
  });
}

app.get("/api/qr", async (req, res) => {
  if (["idle", "disconnected", "error"].includes(state.status)) {
    resetState({ clearAuth: true });
    startSession().catch((error) => {
      state.lastError = error && error.message ? error.message : String(error);
      state.status = "error";
      console.error("[start] Erro:", state.lastError);
    });
    return res.json({ qr: null, status: "connecting" });
  }

  if (["connected", "collecting", "ready"].includes(state.status)) {
    return res.json({ qr: null, status: "connected" });
  }

  return res.json({ qr: state.qrBase64, status: state.status });
});

app.get("/api/status", (req, res) => {
  res.json({ status: state.status });
});

app.get("/api/analysis", (req, res) => {
  if (state.status === "ready" && state.analysisData) {
    return res.json({ ready: true, data: state.analysisData });
  }

  return res.json({ ready: false, status: state.status });
});

app.post("/api/disconnect", (req, res) => {
  console.log("[disconnect] Forçando desconexão...");
  resetState({ clearAuth: true });
  res.json({ ok: true });
});

app.listen(3333, "0.0.0.0", () => {
  console.log("[server] ReadyZap VPS rodando na porta 3333");
});
`;

fs.writeFileSync("/root/server.js", code.trim() + "\n", "utf-8");
console.log("server.js criado com sucesso!");
'

# 5. Iniciar com PM2
cd /root
pm2 start /root/server.js --name readyzap
pm2 save

echo ""
echo "=== Setup completo! ==="
echo "Servidor rodando em http://0.0.0.0:3333"
echo "Endpoints: GET /api/qr | GET /api/status | GET /api/analysis | POST /api/disconnect"
echo ""
echo "Comandos uteis:"
echo "  pm2 logs readyzap    - ver logs"
echo "  pm2 restart readyzap - reiniciar"
echo "  pm2 stop readyzap    - parar"
