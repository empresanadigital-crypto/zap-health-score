import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Smartphone, QrCode, Loader2, WifiOff, Play, RefreshCw, AlertTriangle } from "lucide-react";
import { fetchQR, fetchAnalysis, type AnalysisData } from "@/lib/api";

interface QRCodeScannerProps {
  onScan: (data: NonNullable<AnalysisData["data"]>) => void;
}

const QRCodeScanner = ({ onScan }: QRCodeScannerProps) => {
  const [started, setStarted] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectedRef = useRef(false);
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
    setStatus("loading");
    setError(null);

    const poll = async () => {
      try {
        // Once connected, only poll analysis — never go back to QR
        if (connectedRef.current) {
          const analysis = await fetchAnalysis();
          if (cancelled) return;
          if (analysis.ready && analysis.data) {
            stopPolling();
            onScanRef.current(analysis.data);
          }
          // Keep polling analysis until ready — don't check QR anymore
          return;
        }

        const qrRes = await fetchQR();
        if (cancelled) return;

        setError(null);

        if (qrRes.status === "connected") {
          // Lock into connected state — never revert
          connectedRef.current = true;
          setQrImage(null);
          setStatus("collecting");
          // Immediately try analysis
          const analysis = await fetchAnalysis();
          if (cancelled) return;
          if (analysis.ready && analysis.data) {
            stopPolling();
            onScanRef.current(analysis.data);
          }
          return;
        }

        setStatus(qrRes.status);

        if (qrRes.qr) {
          setQrImage(qrRes.qr);
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

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [started, stopPolling]);

  const handleStart = () => {
    setStarted(true);
    setError(null);
    setQrImage(null);
  };

  const handleRetry = () => {
    setStarted(false);
    setError(null);
    setQrImage(null);
    setStatus("idle");
    setTimeout(() => setStarted(true), 100);
  };

  if (!started) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-6 w-full max-w-lg"
      >
        <div className="glass-card p-8 flex flex-col items-center gap-6 w-full">
          <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
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
            <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30 border border-border/30">
              <span className="text-primary font-bold mt-0.5">1</span>
              <p className="text-muted-foreground">Clique em "Iniciar Diagnóstico"</p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30 border border-border/30">
              <span className="text-primary font-bold mt-0.5">2</span>
              <p className="text-muted-foreground">Escaneie o QR Code com seu WhatsApp</p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30 border border-border/30">
              <span className="text-primary font-bold mt-0.5">3</span>
              <p className="text-muted-foreground">Receba o relatório completo em segundos</p>
            </div>
          </div>

          <button
            onClick={handleStart}
            className="flex items-center gap-2 px-8 py-3.5 bg-primary text-primary-foreground font-semibold rounded-xl hover:brightness-110 transition-all glow-green-sm w-full justify-center"
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

      <div className="glass-card p-6 glow-green-sm w-full">
        {error ? (
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            <WifiOff className="w-12 h-12 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <button onClick={handleRetry} className="px-6 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:brightness-110 transition-all">
              Tentar novamente
            </button>
          </div>
        ) : status === "collecting" || status === "connected" ? (
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">WhatsApp conectado! Coletando dados...</p>
          </div>
        ) : qrImage ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <img src={qrImage} alt="QR Code WhatsApp" className="w-64 h-64 rounded-xl" />
              <div className="absolute inset-0 rounded-xl border-2 border-primary/30" />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Se o código expirar, clique em tentar novamente.
            </p>
          </div>
        ) : status === "disconnected" ? (
          <div className="flex flex-col items-center gap-4 p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-warning" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Servidor online, mas o WhatsApp não gerou o QR</p>
              <p className="text-sm text-muted-foreground">
                A VPS respondeu <span className="font-mono text-foreground">disconnected</span>. Isso é problema da sessão do Baileys na VPS, não do site.
              </p>
            </div>
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:brightness-110 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar status
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 p-8 w-full justify-center text-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
          </div>
        )}
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

