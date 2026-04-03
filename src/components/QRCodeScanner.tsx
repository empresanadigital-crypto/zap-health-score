import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Smartphone, QrCode, Loader2, WifiOff, Play, RefreshCw } from "lucide-react";
import { fetchQR, fetchAnalysis, disconnectSession, type AnalysisData } from "@/lib/api";

interface QRCodeScannerProps {
  onScan: (data: NonNullable<AnalysisData["data"]>) => void;
}

const ANALYSIS_FRESHNESS_TOLERANCE_MS = 120_000;
const SESSION_TIMEOUT_MS = 120_000;
const QR_STALE_MS = 25_000;
const SHOW_RETRY_AFTER_MS = 8_000;

const normalizeTimestamp = (timestamp: number) => {
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
};

const QRCodeScanner = ({ onScan }: QRCodeScannerProps) => {
  const [started, setStarted] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showRetryButton, setShowRetryButton] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectedRef = useRef(false);
  const sessionStartedAtRef = useRef(0);
  const qrReceivedAtRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!started) return;

    let cancelled = false;
    connectedRef.current = false;
    sessionStartedAtRef.current = Date.now();
    qrReceivedAtRef.current = 0;
    setStatus("loading");
    setError(null);
    setQrImage(null);
    setShowRetryButton(false);

    const retryTimer = setTimeout(() => {
      if (!cancelled) setShowRetryButton(true);
    }, SHOW_RETRY_AFTER_MS);

    const fetchFreshAnalysis = async () => {
      const analysis = await fetchAnalysis();
      if (cancelled) return false;

      if (!analysis.ready || !analysis.data) {
        const nextStatus = analysis.status || "collecting";

        if (nextStatus === "error" || nextStatus === "disconnected") {
          stopPolling();
          connectedRef.current = false;
          setQrImage(null);
          setStatus(nextStatus);
          setError(
            nextStatus === "disconnected"
              ? "A sessão caiu antes de concluir a leitura. Gere um novo QR e tente novamente."
              : "A sessão falhou ao coletar os dados do WhatsApp. Tente novamente."
          );
        } else {
          setStatus(nextStatus === "connected" ? "collecting" : nextStatus);
        }

        return false;
      }

      const analysisTimestamp = normalizeTimestamp(analysis.data.timestamp);
      const isFreshAnalysis = analysisTimestamp >= sessionStartedAtRef.current - ANALYSIS_FRESHNESS_TOLERANCE_MS;

      if (!isFreshAnalysis) {
        console.warn("[analysis] Payload antigo da VPS ignorado", {
          analysisTimestamp,
          sessionStartedAt: sessionStartedAtRef.current,
        });
        setStatus("collecting");
        return false;
      }

      stopPolling();
      onScanRef.current(analysis.data);
      return true;
    };

    const poll = async () => {
      if (document.hidden) return;

      if (Date.now() - sessionStartedAtRef.current > SESSION_TIMEOUT_MS) {
        stopPolling();
        setError("O tempo limite da sessão expirou. Tente novamente.");
        setStatus("error");
        return;
      }

      try {
        if (connectedRef.current) {
          await fetchFreshAnalysis();
          return;
        }

        if (
          qrReceivedAtRef.current > 0 &&
          Date.now() - qrReceivedAtRef.current > QR_STALE_MS &&
          status === "waiting_scan"
        ) {
          console.info("[qr] QR expirado, solicitando novo...");
          qrReceivedAtRef.current = 0;
          setQrImage(null);
        }

        const qrRes = await fetchQR();
        if (cancelled) return;

        console.info("[qr] Status bruto da VPS", qrRes.status);
        setError(null);

        if (qrRes.status === "connected") {
          connectedRef.current = true;
          setQrImage(null);
          setStatus("collecting");
          await fetchFreshAnalysis();
          return;
        }

        setStatus(qrRes.status || "loading");

        if (qrRes.qr) {
          setQrImage(qrRes.qr);
          qrReceivedAtRef.current = Date.now();
        } else {
          setQrImage(null);
        }
      } catch {
        if (!cancelled && !connectedRef.current) {
          setError("Não foi possível conectar ao servidor.");
          setStatus("error");
        }
      }
    };

    poll();
    pollRef.current = setInterval(poll, 3000);

    const handleVisibility = () => {
      if (!document.hidden && !cancelled) poll();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [started, stopPolling]);

  const handleStart = async () => {
    stopPolling();
    try {
      await disconnectSession();
    } catch {
      // ignora reset inicial
    }
    connectedRef.current = false;
    sessionStartedAtRef.current = 0;
    qrReceivedAtRef.current = 0;
    setStarted(true);
    setError(null);
    setQrImage(null);
    setStatus("loading");
    setShowRetryButton(false);
  };

  const handleRetry = async () => {
    stopPolling();
    setStarted(false);
    setError(null);
    setQrImage(null);
    setStatus("idle");
    connectedRef.current = false;
    sessionStartedAtRef.current = 0;
    qrReceivedAtRef.current = 0;
    setShowRetryButton(false);

    try {
      await disconnectSession();
    } catch {
      // ignora falha ao limpar sessão antiga
    }

    setTimeout(() => setStarted(true), 100);
  };

  const isWaitingForSession = !error && !qrImage;
  const isCollecting = status === "collecting" || status === "connected";

  if (!started) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-6 w-full max-w-lg"
      >
        <div className="glass-card p-8 flex flex-col items-center gap-6 w-full">
          <div className="p-4 rounded-lg" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.12)' }}>
            <QrCode className="w-12 h-12 text-primary" />
          </div>

          <div className="text-center">
            <h2 className="text-xl font-bold text-foreground mb-2">
              Diagnóstico via QR Code
            </h2>
            <p className="text-sm text-muted-foreground">
              Conecte seu WhatsApp para uma análise completa e personalizada do seu número.
            </p>
          </div>

          <div className="w-full space-y-3 text-sm">
            <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-primary font-bold mt-0.5">1</span>
              <p className="text-muted-foreground">Clique em "Iniciar Diagnóstico"</p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-primary font-bold mt-0.5">2</span>
              <p className="text-muted-foreground">Escaneie o QR Code com seu WhatsApp</p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-primary font-bold mt-0.5">3</span>
              <p className="text-muted-foreground">Receba o relatório completo em segundos</p>
            </div>
          </div>

          <button
            onClick={handleStart}
            className="flex items-center gap-2 px-8 py-3.5 text-white font-bold rounded-lg hover:brightness-110 transition-all w-full justify-center"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #18f26a)', boxShadow: '0 4px 16px rgba(59,130,246,0.25)' }}
          >
            <Play className="w-5 h-5" />
            Iniciar Diagnóstico
          </button>
        </div>

        <div className="flex items-start gap-3 glass-card p-4 w-full">
          <Smartphone className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">Seus dados estão seguros</p>
            <p className="text-xs text-muted-foreground mt-1">
              A sessão é temporária e desconectada automaticamente após a análise.
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-6 w-full max-w-lg"
    >
      <div className="flex items-center gap-2 mb-2">
        <QrCode className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Escaneie o QR Code</h2>
      </div>
      <p className="text-sm text-muted-foreground text-center -mt-4">
        Abra o WhatsApp → Configurações → Aparelhos conectados → Conectar
      </p>

      <div className="glass-card p-6 w-full">
        {error ? (
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            <WifiOff className="w-12 h-12 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={handleRetry}
              className="px-6 py-2 text-sm text-white font-bold rounded-lg hover:brightness-110 transition-all"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #18f26a)', boxShadow: '0 4px 16px rgba(59,130,246,0.25)' }}
            >
              Tentar novamente
            </button>
          </div>
        ) : qrImage ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <img src={qrImage} alt="QR Code WhatsApp" className="w-64 h-64 rounded-xl" />
              <div className="absolute inset-0 rounded-xl border-2 border-primary/30" />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              O QR é atualizado automaticamente se expirar.
            </p>
          </div>
        ) : isWaitingForSession ? (
          <div className="flex flex-col items-center gap-4 p-8 w-full justify-center text-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                {isCollecting ? "Coletando dados do WhatsApp..." : "Preparando sessão..."}
              </p>
              <p className="text-sm text-muted-foreground">
                {isCollecting
                  ? "WhatsApp conectado com sucesso. Lendo seus grupos, conversas e perfil."
                  : "Conectando ao servidor do WhatsApp para gerar o QR Code."}
              </p>
            </div>
            {showRetryButton && (
              <button
                onClick={handleRetry}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:brightness-110 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Reiniciar conexão
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex items-start gap-3 glass-card p-4 w-full">
        <Smartphone className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">Seus dados estão seguros</p>
          <p className="text-xs text-muted-foreground mt-1">
            A sessão é temporária e desconectada automaticamente após a análise.
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default QRCodeScanner;
