#!/usr/bin/env bash
set -euo pipefail

APP_NAME="readyzap"
APP_DIR="/root"
SERVER_FILE="$APP_DIR/server.js"
AUTH_DIR="$APP_DIR/auth_state"

export DEBIAN_FRONTEND=noninteractive

echo "=== ReadyZap clean setup ==="

auto_install_node() {
  local major="0"

  if command -v node >/dev/null 2>&1; then
    major="$(node -v | sed 's/^v\([0-9]\+\).*/\1/')"
  fi

  if [ "$major" -lt 18 ]; then
    echo "[1/6] Installing Node.js 20..."
    apt-get update
    apt-get install -y curl ca-certificates gnupg
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  else
    echo "[1/6] Node.js already OK: $(node -v)"
  fi
}

install_system_packages() {
  echo "[2/6] Installing system packages..."
  apt-get update
  apt-get install -y curl ca-certificates gnupg psmisc
}

install_pm2() {
  echo "[3/6] Installing PM2..."
  npm install -g pm2
}

clean_old_app() {
  echo "[4/6] Removing old ReadyZap app files..."
  pm2 delete "$APP_NAME" 2>/dev/null || true
  pkill -f "$SERVER_FILE" 2>/dev/null || true
  rm -rf "$AUTH_DIR"
  rm -rf "$APP_DIR/node_modules"
  rm -f "$APP_DIR/package-lock.json"
  rm -f "$APP_DIR/package.json"
  rm -f "$SERVER_FILE"
}

write_server() {
  echo "[5/6] Writing fresh server.js..."
  cat > "$SERVER_FILE" <<'EOF'
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
            console.log("[ready] analysis available and session kept online");
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
  console.log("[server] ReadyZap running on port 3333");
});
EOF
}

install_app() {
  echo "[6/6] Installing app dependencies and starting PM2..."
  cd "$APP_DIR"
  npm init -y >/dev/null 2>&1
  npm install express qrcode pino
  npm install @whiskeysockets/baileys@github:kobie3717/Baileys#fix/405-platform-macos
  pm2 save
}

health_check() {
  echo ""
  echo "=== Health check ==="
  pm2 status "$APP_NAME"
  echo ""
  curl -fsS http://127.0.0.1:3333/api/health || true
  echo ""
  echo ""
  echo "Useful commands:"
  echo "  pm2 logs $APP_NAME --lines 100"
  echo "  pm2 restart $APP_NAME"
  echo "  curl http://127.0.0.1:3333/api/health"
}

install_system_packages
auto_install_node
install_pm2
clean_old_app
write_server
install_app
health_check
