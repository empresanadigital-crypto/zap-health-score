var express = require("express");
var baileys = require("@whiskeysockets/baileys");
var makeWASocket = baileys.default;
var useMultiFileAuthState = baileys.useMultiFileAuthState;
var Browsers = baileys.Browsers;
var DisconnectReason = baileys.DisconnectReason;
var QRCode = require("qrcode");
var pino = require("pino");
var fs = require("fs");
var path = require("path");

var app = express();
app.use(express.json());

var AUTH_DIR = path.join(__dirname, "auth_state");
var sessionCounter = 0;

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
    sessionId: sessionCounter
  };
}

var state = createState();

function ensureAuthDir() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }
}

function clearAuthState() {
  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  }
}

function closeSocket(sock) {
  if (!sock) return;
  try { sock.end(); } catch (e) {}
  try { if (sock.ws && sock.ws.close) sock.ws.close(); } catch (e) {}
}

function resetState() {
  closeSocket(state.sock);
  clearAuthState();
  sessionCounter += 1;
  state = createState();
}

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function updateChats(chats) {
  if (!Array.isArray(chats) || chats.length === 0) return;
  var changed = 0;
  for (var i = 0; i < chats.length; i++) {
    var chat = chats[i];
    if (!chat || typeof chat !== "object") continue;
    var id = chat.id || chat.jid;
    if (!id) continue;
    var prev = state.chats.get(id) || {};
    state.chats.set(id, Object.assign({}, prev, chat));
    changed++;
  }
  if (changed > 0) {
    state.lastChatUpdateAt = Date.now();
    console.log("[chats] Total:", state.chats.size);
  }
}

function normalizeTs(value) {
  if (!value) return null;
  if (typeof value === "object" && typeof value.low === "number") {
    return value.low > 0 ? value.low : null;
  }
  var n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function waitForHistory(sessionId) {
  var start = Date.now();
  var maxWait = 25000;
  var quietMs = 2500;

  return new Promise(function (resolve) {
    function check() {
      if (state.sessionId !== sessionId) return resolve(false);
      if (state.status === "error" || state.status === "disconnected") return resolve(false);
      var elapsed = Date.now() - start;
      var quietFor = Date.now() - state.lastChatUpdateAt;
      if ((state.chats.size > 0 && quietFor >= quietMs) || elapsed >= 8000) return resolve(true);
      if (elapsed >= maxWait) return resolve(true);
      setTimeout(check, 500);
    }
    check();
  });
}

function collectData(sock) {
  console.log("[collect] Coletando dados...");
  var data = {
    phone: null,
    name: null,
    hasProfilePic: null,
    hasStatus: null,
    groupCount: null,
    chatCount: null,
    oldestMessageTimestamp: null,
    groups: [],
    timestamp: Date.now()
  };

  if (sock.user) {
    data.phone = sock.user.id || null;
    data.name = sock.user.name || null;
  }

  var promises = [];

  // Profile pic
  promises.push(
    (sock.user && sock.user.id
      ? sock.profilePictureUrl(sock.user.id, "image").catch(function () { return null; })
      : Promise.resolve(null)
    ).then(function (pic) {
      data.hasProfilePic = !!pic;
      console.log("[collect] hasProfilePic:", data.hasProfilePic);
    })
  );

  // Status
  promises.push(
    (sock.user && sock.user.id
      ? sock.fetchStatus(sock.user.id).catch(function () { return null; })
      : Promise.resolve(null)
    ).then(function (s) {
      data.hasStatus = !!(s && s.status);
      console.log("[collect] hasStatus:", data.hasStatus);
    })
  );

  // Groups
  promises.push(
    sock.groupFetchAllParticipating().catch(function () { return null; }).then(function (gm) {
      if (gm && typeof gm === "object") {
        var ids = Object.keys(gm);
        data.groupCount = ids.length;
        data.groups = ids.map(function (id) {
          return {
            name: (gm[id] && gm[id].subject) ? gm[id].subject : "Sem nome",
            participants: (gm[id] && Array.isArray(gm[id].participants)) ? gm[id].participants.length : 0
          };
        });
      }
      console.log("[collect] groupCount:", data.groupCount);
    })
  );

  return Promise.all(promises).then(function () {
    // Chats from memory
    var arr = Array.from(state.chats.values());
    var count = 0;
    var oldest = null;
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i];
      var jid = (c && c.id) ? c.id : "";
      if (jid.indexOf("@s.whatsapp.net") === -1) continue;
      count++;
      var ts = normalizeTs(c.conversationTimestamp);
      if (ts !== null && (oldest === null || ts < oldest)) oldest = ts;
    }
    data.chatCount = count > 0 ? count : null;
    data.oldestMessageTimestamp = oldest;
    console.log("[collect] chatCount:", data.chatCount, "oldestTs:", data.oldestMessageTimestamp);
    console.log("[collect] Resultado:", JSON.stringify(data, null, 2));
    return data;
  });
}

function startSession() {
  if (["connecting", "waiting_scan", "connected", "collecting"].includes(state.status)) return;

  ensureAuthDir();
  state.status = "connecting";
  state.qrBase64 = null;
  state.analysisData = null;
  state.chats = new Map();
  state.lastError = null;
  state.connectedAt = null;
  state.lastChatUpdateAt = Date.now();

  var sessionId = state.sessionId;

  useMultiFileAuthState(AUTH_DIR).then(function (auth) {
    var sock = makeWASocket({
      auth: auth.state,
      printQRInTerminal: true,
      logger: pino({ level: "silent" }),
      browser: Browsers.ubuntu("Chrome"),
      markOnlineOnConnect: false,
      syncFullHistory: false
    });

    state.sock = sock;

    sock.ev.on("messaging-history.set", function (msg) {
      console.log("[history]", Array.isArray(msg.chats) ? msg.chats.length : 0, "chats");
      updateChats(msg.chats);
    });

    sock.ev.on("chats.set", function (msg) {
      updateChats(msg.chats);
    });

    sock.ev.on("chats.upsert", function (chats) {
      updateChats(chats);
    });

    sock.ev.on("creds.update", auth.saveCreds);

    sock.ev.on("connection.update", function (update) {
      if (state.sessionId !== sessionId) return;

      if (update.qr) {
        QRCode.toDataURL(update.qr, { width: 300 }).then(function (url) {
          state.qrBase64 = url;
          state.status = "waiting_scan";
          console.log("[qr] QR gerado");
        }).catch(function (e) {
          state.lastError = e.message;
          state.status = "error";
        });
      }

      if (update.connection === "open") {
        console.log("[conn] Conectado!");
        state.status = "connected";
        state.qrBase64 = null;
        state.connectedAt = Date.now();
        state.lastChatUpdateAt = Date.now();

        wait(3000).then(function () {
          if (state.sessionId !== sessionId) return;
          state.status = "collecting";
          return waitForHistory(sessionId);
        }).then(function (ok) {
          if (!ok || state.sessionId !== sessionId) return;
          return collectData(sock);
        }).then(function (data) {
          if (!data || state.sessionId !== sessionId) return;
          state.analysisData = data;
          state.status = "ready";
          state.lastError = null;
          console.log("[done] Dados prontos. Sessao permanece ativa.");
        }).catch(function (e) {
          state.lastError = e.message;
          state.status = "error";
          console.error("[collect] Erro:", e.message);
        });
      }

      if (update.connection === "close") {
        var ld = update.lastDisconnect;
        var code = (ld && ld.error && ld.error.output) ? ld.error.output.statusCode : null;
        console.log("[conn] Desconectado, code:", code);

        if (code === DisconnectReason.loggedOut) {
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
  }).catch(function (e) {
    state.lastError = e.message;
    state.status = "error";
    console.error("[start] Erro:", e.message);
  });
}

// --- ROTAS ---

app.get("/api/qr", function (req, res) {
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

app.get("/api/status", function (req, res) {
  res.json({ status: state.status, error: state.lastError });
});

app.get("/api/analysis", function (req, res) {
  if (state.status === "ready" && state.analysisData) {
    return res.json({ ready: true, data: state.analysisData });
  }
  return res.json({ ready: false, status: state.status });
});

app.post("/api/disconnect", function (req, res) {
  console.log("[disconnect] Desconectando...");
  resetState();
  res.json({ ok: true });
});

app.get("/api/health", function (req, res) {
  res.json({ ok: true, uptime: process.uptime(), chats: state.chats.size, status: state.status });
});

app.listen(3333, "0.0.0.0", function () {
  console.log("[server] ReadyZap rodando na porta 3333");
});
