#!/bin/bash
set -e

echo "=== ReadyZap VPS Setup ==="

# 1. Instalar dependencias
cd /root
npm install express @whiskeysockets/baileys qrcode pino 2>/dev/null || {
  echo "Instalando npm..."
  apt-get update && apt-get install -y nodejs npm
  npm install express @whiskeysockets/baileys qrcode pino
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
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");
const pino = require("pino");

const app = express();
app.use(express.json());

let state = {
  status: "idle",
  qrBase64: null,
  sock: null,
  analysisData: null,
  store: null,
};

function resetState() {
  if (state.sock) {
    try { state.sock.end(); } catch {}
    try { state.sock.ws.close(); } catch {}
  }
  state.sock = null;
  state.status = "idle";
  state.qrBase64 = null;
  state.analysisData = null;
  // limpar auth para nova sessao
  const fs2 = require("fs");
  const path = require("path");
  const authDir = path.join(__dirname, "auth_state");
  if (fs2.existsSync(authDir)) {
    fs2.rmSync(authDir, { recursive: true, force: true });
  }
}

async function collectData(sock) {
  console.log("[collect] Iniciando coleta de dados reais...");
  const data = {
    phone: null,
    name: null,
    hasProfilePic: false,
    hasStatus: false,
    groupCount: 0,
    chatCount: null,
    oldestMessageTimestamp: null,
    groups: [],
    timestamp: Date.now(),
  };

  try {
    // phone e name
    if (sock.user) {
      data.phone = sock.user.id || null;
      data.name = sock.user.name || null;
    }
    console.log("[collect] phone:", data.phone, "name:", data.name);
  } catch (e) { console.error("[collect] user error:", e.message); }

  try {
    // profile pic
    const pp = await sock.profilePictureUrl(sock.user.id, "image").catch(() => null);
    data.hasProfilePic = !!pp;
    console.log("[collect] hasProfilePic:", data.hasProfilePic);
  } catch (e) { console.error("[collect] pic error:", e.message); }

  try {
    // status
    const st = await sock.fetchStatus(sock.user.id).catch(() => null);
    data.hasStatus = !!(st && st.status);
    console.log("[collect] hasStatus:", data.hasStatus);
  } catch (e) { console.error("[collect] status error:", e.message); }

  try {
    // grupos REAIS
    const groupMeta = await sock.groupFetchAllParticipating();
    const groupIds = Object.keys(groupMeta);
    data.groupCount = groupIds.length;
    data.groups = groupIds.map(id => ({
      name: groupMeta[id].subject || "Sem nome",
      participants: (groupMeta[id].participants || []).length,
    }));
    console.log("[collect] groupCount:", data.groupCount);
  } catch (e) { console.error("[collect] groups error:", e.message); }

  try {
    // chats via store
    const chats = state.store || [];
    let individualCount = 0;
    let oldestTs = null;

    for (const chat of chats) {
      const jid = chat.id || "";
      // apenas chats individuais
      if (!jid.endsWith("@s.whatsapp.net")) continue;
      individualCount++;
      const ts = chat.conversationTimestamp;
      if (ts) {
        const tsNum = typeof ts === "object" && ts.low ? ts.low : Number(ts);
        if (tsNum > 0 && (oldestTs === null || tsNum < oldestTs)) {
          oldestTs = tsNum;
        }
      }
    }

    data.chatCount = individualCount > 0 ? individualCount : null;
    data.oldestMessageTimestamp = oldestTs;
    console.log("[collect] chatCount:", data.chatCount, "oldestTs:", oldestTs);
  } catch (e) { console.error("[collect] chats error:", e.message); }

  return data;
}

async function startSession() {
  if (state.status === "connecting" || state.status === "connected") return;

  state.status = "connecting";
  state.qrBase64 = null;
  state.analysisData = null;
  state.store = null;

  const fs2 = require("fs");
  const path = require("path");
  const authDir = path.join(__dirname, "auth_state");
  if (!fs2.existsSync(authDir)) fs2.mkdirSync(authDir, { recursive: true });

  const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: authState,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: ["ReadyZap", "Chrome", "1.0.0"],
  });

  state.sock = sock;

  // capturar chats do evento
  sock.ev.on("messaging-history.set", ({ chats }) => {
    console.log("[history] Recebidos", chats.length, "chats do historico");
    state.store = (state.store || []).concat(chats);
  });

  sock.ev.on("chats.upsert", (chats) => {
    console.log("[chats.upsert] Recebidos", chats.length, "chats");
    state.store = (state.store || []).concat(chats);
  });

  sock.ev.on("chats.set", ({ chats }) => {
    console.log("[chats.set] Recebidos", chats.length, "chats");
    state.store = (state.store || []).concat(chats);
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        state.qrBase64 = await QRCode.toDataURL(qr, { width: 256 });
        state.status = "waiting_scan";
        console.log("[qr] QR gerado com sucesso");
      } catch (e) {
        console.error("[qr] Erro ao gerar QR:", e.message);
      }
    }

    if (connection === "open") {
      console.log("[conn] WhatsApp conectado!");
      state.status = "connected";
      state.qrBase64 = null;

      // esperar 3s para historico chegar
      setTimeout(async () => {
        try {
          state.status = "collecting";
          const data = await collectData(sock);
          state.analysisData = data;
          state.status = "ready";
          console.log("[collect] Dados prontos:", JSON.stringify(data, null, 2));

          // desconectar apos 1.5s
          setTimeout(() => {
            console.log("[auto] Desconectando sessao...");
            try { sock.end(); } catch {}
            state.status = "ready"; // manter ready para leitura
          }, 1500);
        } catch (e) {
          console.error("[collect] Erro na coleta:", e.message);
          state.status = "error";
        }
      }, 3000);
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log("[conn] Desconectado, code:", code);
      if (state.status !== "ready") {
        state.status = "disconnected";
      }
    }
  });
}

// ENDPOINTS
app.get("/api/qr", async (req, res) => {
  if (state.status === "idle" || state.status === "disconnected" || state.status === "error") {
    resetState();
    startSession().catch(e => console.error("[start] Erro:", e.message));
    return res.json({ qr: null, status: "connecting" });
  }

  if (state.status === "connected" || state.status === "collecting" || state.status === "ready") {
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
  console.log("[disconnect] Forcando desconexao...");
  resetState();
  res.json({ ok: true });
});

app.listen(3333, "0.0.0.0", () => {
  console.log("[server] ReadyZap VPS rodando na porta 3333");
});
`;

fs.writeFileSync("/root/server.js", code.trim(), "utf-8");
console.log("server.js criado com sucesso!");
'

# 5. Iniciar com PM2
cd /root
pm2 start server.js --name readyzap
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
