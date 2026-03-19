const express = require("express");
const { default: makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");
const pino = require("pino");
const fs = require("fs");
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
    connectedAt: null,
    lastChatUpdateAt: 0,
    sessionId: sessionCounter,
  };
}

let state = createState();

function ensureAuthDir() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function clearAuthState() {
  if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true });
}

function closeSocket(sock) {
  if (!sock) return;
  try { sock.end(); } catch {}
  try { sock.ws && sock.ws.close && sock.ws.close(); } catch {}
}

function resetState() {
  closeSocket(state.sock);
  clearAuthState();
  sessionCounter += 1;
  state = createState();
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function updateChats(chats) {
  if (!Array.isArray(chats) || chats.length === 0) return;
  let changed = 0;
  for (const chat of chats) {
    if (!chat || typeof chat !== "object") continue;
    const id = chat.id || chat.jid;
    if (!id) continue;
    const prev = state.chats.get(id) || {};
    state.chats.set(id, { ...prev, ...chat });
    changed++;
  }
  if (changed > 0) {
    state.lastChatUpdateAt = Date.now();
    console.log("[chats] Total:", state.chats.size);
  }
}

function normalizeTs(value) {
  if (!value) return null;
  if (typeof value === "object" && typeof value.low === "number") return value.low > 0 ? value.low : null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

async function waitForHistory(sessionId) {
  const start = Date.now();
  const maxWait = 25000;
  const quiet = 2500;
  while (Date.now() - start < maxWait) {
    if (state.sessionId !== sessionId) return false;
    if (state.status === "error" || state.status === "disconnected") return false;
    const elapsed = Date.now() - start;
    const quietFor = Date.now() - state.lastChatUpdateAt;
    if ((state.chats.size > 0 && quietFor >= quiet) || elapsed >= 8000) return true;
    await wait(500);
  }
  return true;
}

async function collectData(sock) {
  console.log("[collect] Coletando dados...");
  const data = {
    phone: null, name: null, hasProfilePic: null, hasStatus: null,
    groupCount: null, chatCount: null, oldestMessageTimestamp: null,
    groups: [], timestamp: Date.now(),
  };

  try {
    if (sock.user) {
      data.phone = sock.user.id || null;
      data.name = sock.user.name || null;
    }
  } catch (e) { console.error("[collect] user:", e.message); }

  try {
    if (sock.user?.id) {
      const pic = await sock.profilePictureUrl(sock.user.id, "image").catch(() => null);
      data.hasProfilePic = !!pic;
    }
  } catch (e) { console.error("[collect] pic:", e.message); }

  try {
    if (sock.user?.id) {
      const s = await sock.fetchStatus(sock.user.id).catch(() => null);
      data.hasStatus = !!(s && s.status);
    }
  } catch (e) { console.error("[collect] status:", e.message); }

  try {
    const gm = await sock.groupFetchAllParticipating().catch(() => null);
    if (gm && typeof gm === "object") {
      const ids = Object.keys(gm);
      data.groupCount = ids.length;
      data.groups = ids.map((id) => ({
        name: gm[id]?.subject || "Sem nome",
        participants: Array.isArray(gm[id]?.participants) ? gm[id].participants.length : 0,
      }));
    }
  } catch (e) { console.error("[collect] groups:", e.message); }

  try {
    const chats = Array.from(state.chats.values());
    let count = 0, oldest = null;
    for (const c of chats) {
      const jid = c?.id || "";
      if (!jid.endsWith("@s.whatsapp.net")) continue;
      count++;
      const ts = normalizeTs(c.conversationTimestamp);
      if (ts !== null && (oldest === null || ts < oldest)) oldest = ts;
    }
    data.chatCount = count > 0 ? count : null;
    data.oldestMessageTimestamp = oldest;
  } catch (e) { console.error("[collect] chats:", e.message); }

  console.log("[collect] Resultado:", JSON.stringify(data, null, 2));
  return data;
}

async function startSession() {
  if (["connecting", "waiting_scan", "connected", "collecting"].includes(state.status)) return;

  ensureAuthDir();
  state.status = "connecting";
  state.qrBase64 = null;
  state.analysisData = null;
  state.chats = new Map();
  state.lastError = null;
  state.connectedAt = null;
  state.lastChatUpdateAt = Date.now();

  const sessionId = state.sessionId;
  const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: authState,
    printQRInTerminal: true,
    logger: pino({ level: "silent" }),
    browser: Browsers.ubuntu("Chrome"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  state.sock = sock;

  sock.ev.on("messaging-history.set", ({ chats }) => {
    console.log("[history]", Array.isArray(chats) ? chats.length : 0, "chats");
    updateChats(chats);
  });
  sock.ev.on("chats.set", ({ chats }) => updateChats(chats));
  sock.ev.on("chats.upsert", (chats) => updateChats(chats));
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    if (state.sessionId !== sessionId) return;

    if (update.qr) {
      try {
        state.qrBase64 = await QRCode.toDataURL(update.qr, { width: 300 });
        state.status = "waiting_scan";
        console.log("[qr] QR gerado");
      } catch (e) {
        state.lastError = e.message;
        state.status = "error";
      }
    }

    if (update.connection === "open") {
      console.log("[conn] Conectado!");
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
        console.log("[collect] Pronto! Sessão permanece ativa.");
        // NÃO desconecta automaticamente
      } catch (e) {
        state.lastError = e.message;
        state.status = "error";
        console.error("[collect] Erro:", e.message);
      }
    }

    if (update.connection === "close") {
      const code = update.lastDisconnect?.error?.output?.statusCode;
      console.log("[conn] Desconectado, code:", code);

      if (code === DisconnectReason.loggedOut) {
        console.log("[conn] Logged out, limpando auth...");
        clearAuthState();
      }

      if (state.status !== "ready") {
        state.status = "disconnected";
        state.qrBase64 = null;
        state.sock = null;
        state.lastError = code ? "connection_closed_" + code : "connection_closed";
      }
    }
  });
}

// --- ROTAS ---

app.get("/api/qr", async (req, res) => {
  if (["idle", "disconnected", "error"].includes(state.status)) {
    resetState();
    startSession().catch((e) => {
      state.lastError = e.message;
      state.status = "error";
    });
    return res.json({ qr: null, status: "connecting" });
  }
  if (["connected", "collecting", "ready"].includes(state.status)) {
    return res.json({ qr: null, status: "connected" });
  }
  return res.json({ qr: state.qrBase64, status: state.status });
});

app.get("/api/status", (req, res) => {
  res.json({ status: state.status, error: state.lastError });
});

app.get("/api/analysis", (req, res) => {
  if (state.status === "ready" && state.analysisData) {
    return res.json({ ready: true, data: state.analysisData });
  }
  return res.json({ ready: false, status: state.status });
});

app.post("/api/disconnect", (req, res) => {
  console.log("[disconnect] Desconectando...");
  resetState();
  res.json({ ok: true });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), chats: state.chats.size, status: state.status });
});

const PORT = 3333;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] ReadyZap rodando na porta ${PORT}`);
});
