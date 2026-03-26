import express from "express";
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, DisconnectReason } from "baileys";
import QRCode from "qrcode";
import pino from "pino";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

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
  try { sock.end(); } catch (_) {}
  try { sock.ws?.close(); } catch (_) {}
}

function resetState() {
  closeSocket(state.sock);
  clearAuthState();
  sessionCounter += 1;
  state = createState();
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
    const prev = state.chats.get(id) || {};
    state.chats.set(id, { ...prev, ...chat });
    changed++;
  }
  if (changed > 0) {
    state.lastChatUpdateAt = Date.now();
    console.log("[chats] total:", state.chats.size);
  }
}

function normalizeTs(value) {
  if (!value) return null;
  if (typeof value === "object" && typeof value.low === "number") {
    return value.low > 0 ? value.low : null;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function waitForHistory(sessionId) {
  const startedAt = Date.now();
  const maxWaitMs = 10000;
  const quietWindowMs = 2500;

  return new Promise((resolve) => {
    function check() {
      if (state.sessionId !== sessionId) return resolve(false);
      if (state.status === "error" || state.status === "disconnected") return resolve(false);

      const elapsed = Date.now() - startedAt;
      const quietFor = Date.now() - state.lastChatUpdateAt;

      if ((state.chats.size > 0 && quietFor >= quietWindowMs) || elapsed >= maxWaitMs) {
        return resolve(true);
      }
      setTimeout(check, 500);
    }
    check();
  });
}

async function collectData(sock) {
  console.log("[collect] starting...");

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
  } catch (e) {
    console.error("[collect] user error:", e?.message || String(e));
  }

  await Promise.all([
    (async () => {
      try {
        const url = sock.user?.id ? await sock.profilePictureUrl(sock.user.id, "image").catch(() => null) : null;
        data.hasProfilePic = !!url;
      } catch (_) {}
    })(),
    (async () => {
      try {
        const s = sock.user?.id ? await sock.fetchStatus(sock.user.id).catch(() => null) : null;
        data.hasStatus = !!(s && s.status);
      } catch (_) {}
    })(),
    (async () => {
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
      } catch (_) {}
    })(),
  ]);

  try {
    const chats = Array.from(state.chats.values());
    let individualCount = 0;
    let oldestTs = null;
    for (const chat of chats) {
      const jid = chat?.id || "";
      if (!jid.includes("@s.whatsapp.net")) continue;
      individualCount++;
      const ts = normalizeTs(chat.conversationTimestamp);
      if (ts !== null && (oldestTs === null || ts < oldestTs)) oldestTs = ts;
    }
    data.chatCount = individualCount > 0 ? individualCount : null;
    data.oldestMessageTimestamp = oldestTs;
  } catch (e) {
    console.error("[collect] chats error:", e?.message || String(e));
  }

  console.log("[collect] done:", JSON.stringify(data, null, 2));
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

  try {
    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    console.log("[start] WA version:", version);

    const sock = makeWASocket({
      auth: authState,
      version,
      printQRInTerminal: true,
      logger: pino({ level: "silent" }),
      browser: Browsers.macOS("Chrome"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      getMessage: async () => ({ conversation: "" }),
    });

    state.sock = sock;

    sock.ev.on("messaging-history.set", (payload) => {
      console.log("[history] chats:", Array.isArray(payload.chats) ? payload.chats.length : 0);
      updateChats(payload.chats);
    });
    sock.ev.on("chats.set", (payload) => updateChats(payload.chats));
    sock.ev.on("chats.upsert", (chats) => updateChats(chats));
    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      if (state.sessionId !== sessionId) return;

      if (update.qr) {
        try {
          state.qrBase64 = await QRCode.toDataURL(update.qr, { width: 300 });
          state.status = "waiting_scan";
          console.log("[qr] generated");
        } catch (e) {
          state.lastError = e?.message || String(e);
          state.status = "error";
        }
      }

      if (update.connection === "open") {
        console.log("[conn] opened");
        state.status = "connected";
        state.qrBase64 = null;
        state.connectedAt = Date.now();
        state.lastChatUpdateAt = Date.now();

        try {
          await wait(3000);
          if (state.sessionId !== sessionId) return;
          state.status = "collecting";
          const ok = await waitForHistory(sessionId);
          if (!ok || state.sessionId !== sessionId) return;
          const data = await collectData(sock);
          if (state.sessionId !== sessionId) return;
          state.analysisData = data;
          state.status = "ready";
          state.lastError = null;
          console.log("[ready] analysis available — session kept online");
        } catch (e) {
          state.lastError = e?.message || String(e);
          state.status = "error";
          console.error("[collect] error:", state.lastError);
        }
      }

      if (update.connection === "close") {
        const code = update.lastDisconnect?.error?.output?.statusCode || null;
        console.log("[conn] closed, code:", code);
        if (code === DisconnectReason.loggedOut) clearAuthState();
        if (state.status !== "ready") {
          state.status = "disconnected";
          state.qrBase64 = null;
          state.sock = null;
          state.lastError = code ? `connection_closed_${code}` : "connection_closed";
        }
      }
    });
  } catch (e) {
    state.lastError = e?.message || String(e);
    state.status = "error";
    console.error("[start] error:", state.lastError);
  }
}

// ─── ROUTES ───

app.get("/api/qr", (req, res) => {
  if (["idle", "disconnected", "error"].includes(state.status)) {
    resetState();
    startSession();
    return res.json({ qr: null, status: "connecting" });
  }
  if (["connected", "collecting", "ready"].includes(state.status)) {
    return res.json({ qr: null, status: "connected" });
  }
  return res.json({ qr: state.qrBase64, status: state.status });
});

app.get("/api/status", (req, res) => {
  res.json({ status: state.status, error: state.lastError, connectedAt: state.connectedAt });
});

app.get("/api/analysis", (req, res) => {
  if (state.status === "ready" && state.analysisData) {
    return res.json({ ready: true, data: state.analysisData });
  }
  return res.json({ ready: false, status: state.status });
});

app.post("/api/disconnect", (req, res) => {
  console.log("[disconnect] requested");
  resetState();
  res.json({ ok: true });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    status: state.status,
    chats: state.chats.size,
    connectedAt: state.connectedAt,
    uptime: process.uptime(),
  });
});

app.listen(3333, "0.0.0.0", () => {
  console.log("[server] CheckZap running on port 3333");
});
