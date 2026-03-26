var express = require("express");
var baileys = require("@whiskeysockets/baileys");
var makeWASocket = baileys.default;
var useMultiFileAuthState = baileys.useMultiFileAuthState;
var fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
var Browsers = baileys.Browsers;
var DisconnectReason = baileys.DisconnectReason;
var QRCode = require("qrcode");
var pino = require("pino");
var fs = require("fs");
var path = require("path");

var app = express();
app.use(express.json());

// CORS para qualquer origem
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

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
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
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
    changed += 1;
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

  var numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
  return Math.floor(numericValue);
}

function waitForHistory(sessionId) {
  var startedAt = Date.now();
  var maxWaitMs = 25000;
  var quietWindowMs = 2500;

  return new Promise(function (resolve) {
    function check() {
      if (state.sessionId !== sessionId) return resolve(false);
      if (state.status === "error" || state.status === "disconnected") return resolve(false);

      var chatCount = state.chats.size;
      var quietForMs = Date.now() - state.lastChatUpdateAt;
      var elapsed = Date.now() - startedAt;

      if ((chatCount > 0 && quietForMs >= quietWindowMs) || elapsed >= 8000 || elapsed >= maxWaitMs) {
        return resolve(true);
      }

      setTimeout(check, 500);
    }

    check();
  });
}

function collectData(sock) {
  console.log("[collect] starting...");

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

  try {
    if (sock.user) {
      data.phone = sock.user.id || null;
      data.name = sock.user.name || null;
    }
  } catch (error) {
    console.error("[collect] user error:", error && error.message ? error.message : String(error));
  }

  var tasks = [];

  tasks.push(
    (sock.user && sock.user.id
      ? sock.profilePictureUrl(sock.user.id, "image").catch(function () { return null; })
      : Promise.resolve(null)
    ).then(function (profilePictureUrl) {
      data.hasProfilePic = profilePictureUrl ? true : false;
      console.log("[collect] hasProfilePic:", data.hasProfilePic);
    }).catch(function (error) {
      console.error("[collect] pic error:", error && error.message ? error.message : String(error));
    })
  );

  tasks.push(
    (sock.user && sock.user.id
      ? sock.fetchStatus(sock.user.id).catch(function () { return null; })
      : Promise.resolve(null)
    ).then(function (statusData) {
      data.hasStatus = !!(statusData && statusData.status);
      console.log("[collect] hasStatus:", data.hasStatus);
    }).catch(function (error) {
      console.error("[collect] status error:", error && error.message ? error.message : String(error));
    })
  );

  tasks.push(
    sock.groupFetchAllParticipating().catch(function () { return null; }).then(function (groupMeta) {
      if (groupMeta && typeof groupMeta === "object") {
        var groupIds = Object.keys(groupMeta);
        data.groupCount = groupIds.length;
        data.groups = groupIds.map(function (id) {
          return {
            name: groupMeta[id] && groupMeta[id].subject ? groupMeta[id].subject : "Sem nome",
            participants: Array.isArray(groupMeta[id] && groupMeta[id].participants)
              ? groupMeta[id].participants.length
              : 0
          };
        });
      }
      console.log("[collect] groupCount:", data.groupCount);
    }).catch(function (error) {
      console.error("[collect] groups error:", error && error.message ? error.message : String(error));
    })
  );

  return Promise.all(tasks).then(function () {
    try {
      var chats = Array.from(state.chats.values());
      var individualCount = 0;
      var oldestTs = null;

      for (var i = 0; i < chats.length; i++) {
        var chat = chats[i];
        var jid = chat && chat.id ? chat.id : "";
        if (jid.indexOf("@s.whatsapp.net") === -1) continue;

        individualCount += 1;
        var ts = normalizeTs(chat.conversationTimestamp);
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

    console.log("[collect] done:", JSON.stringify(data, null, 2));
    return data;
  });
}

function startSession() {
  if (["connecting", "waiting_scan", "connected", "collecting"].includes(state.status)) {
    return;
  }

  ensureAuthDir();
  state.status = "connecting";
  state.qrBase64 = null;
  state.analysisData = null;
  state.chats = new Map();
  state.lastError = null;
  state.connectedAt = null;
  state.lastChatUpdateAt = Date.now();

  var sessionId = state.sessionId;

  Promise.all([
    useMultiFileAuthState(AUTH_DIR),
    fetchLatestBaileysVersion()
  ]).then(function (results) {
    var auth = results[0];
    var waVersion = results[1].version;
    console.log("[start] Using WA version:", waVersion);

    var sock = makeWASocket({
      auth: auth.state,
      version: waVersion,
      printQRInTerminal: true,
      logger: pino({ level: "silent" }),
      browser: Browsers.macOS("Chrome"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      getMessage: async function (key) {
        return { conversation: "" };
      }
    });

    state.sock = sock;

    sock.ev.on("messaging-history.set", function (payload) {
      console.log("[history] chats:", Array.isArray(payload.chats) ? payload.chats.length : 0);
      updateChats(payload.chats);
    });

    sock.ev.on("chats.set", function (payload) {
      updateChats(payload.chats);
    });

    sock.ev.on("chats.upsert", function (chats) {
      updateChats(chats);
    });

    sock.ev.on("creds.update", auth.saveCreds);

    sock.ev.on("connection.update", function (update) {
      if (state.sessionId !== sessionId) return;

      if (update.qr) {
        QRCode.toDataURL(update.qr, { width: 300 }).then(function (qrBase64) {
          state.qrBase64 = qrBase64;
          state.status = "waiting_scan";
          console.log("[qr] generated");
        }).catch(function (error) {
          state.lastError = error && error.message ? error.message : String(error);
          state.status = "error";
          console.error("[qr] error:", state.lastError);
        });
      }

      if (update.connection === "open") {
        console.log("[conn] opened");
        state.status = "connected";
        state.qrBase64 = null;
        state.connectedAt = Date.now();
        state.lastChatUpdateAt = Date.now();

        wait(3000)
          .then(function () {
            if (state.sessionId !== sessionId) return false;
            state.status = "collecting";
            return waitForHistory(sessionId);
          })
          .then(function (ok) {
            if (!ok || state.sessionId !== sessionId) return null;
            return collectData(sock);
          })
          .then(function (data) {
            if (!data || state.sessionId !== sessionId) return;
            state.analysisData = data;
            state.status = "ready";
            state.lastError = null;
            console.log("[ready] analysis available - session kept online");
          })
          .catch(function (error) {
            state.lastError = error && error.message ? error.message : String(error);
            state.status = "error";
            console.error("[collect] error:", state.lastError);
          });
      }

      if (update.connection === "close") {
        var code = update.lastDisconnect && update.lastDisconnect.error && update.lastDisconnect.error.output
          ? update.lastDisconnect.error.output.statusCode
          : null;

        console.log("[conn] closed, code:", code);

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
  }).catch(function (error) {
    state.lastError = error && error.message ? error.message : String(error);
    state.status = "error";
    console.error("[start] error:", state.lastError);
  });
}

// ─── ROTAS ───

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
  res.json({
    status: state.status,
    error: state.lastError,
    connectedAt: state.connectedAt
  });
});

app.get("/api/analysis", function (req, res) {
  if (state.status === "ready" && state.analysisData) {
    return res.json({ ready: true, data: state.analysisData });
  }

  return res.json({ ready: false, status: state.status });
});

app.post("/api/disconnect", function (req, res) {
  console.log("[disconnect] requested");
  resetState();
  res.json({ ok: true });
});

app.get("/api/health", function (req, res) {
  res.json({
    ok: true,
    status: state.status,
    chats: state.chats.size,
    connectedAt: state.connectedAt,
    uptime: process.uptime()
  });
});

app.listen(3333, "0.0.0.0", function () {
  console.log("[server] CheckZap running on port 3333");
});
