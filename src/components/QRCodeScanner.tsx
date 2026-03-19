import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Smartphone, QrCode, Loader2, WifiOff } from "lucide-react";
import { fetchQR, fetchAnalysis, disconnectSession, type AnalysisData } from "@/lib/api";

interface QRCodeScannerProps {
  onScan: (data: NonNullable<AnalysisData["data"]>) => void;
}

const QRCodeScanner = ({ onScan }: QRCodeScannerProps) => {
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("loading");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const qrRes = await fetchQR();
        if (cancelled) return;
        setStatus(qrRes.status);
        setError(null);

        if (qrRes.qr) {
          setQrImage(qrRes.qr);
        }

        if (qrRes.status === "connected") {
          // Phone connected, now fetch analysis data
          setQrImage(null);
          const analysis = await fetchAnalysis();
          if (cancelled) return;
          if (analysis.ready && analysis.data) {
            if (pollRef.current) clearInterval(pollRef.current);
            onScan(analysis.data);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError("Não foi possível conectar ao servidor. Verifique se a API está rodando.");
          setStatus("error");
        }
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2500);

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [onScan]);

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
        Abra o WhatsApp no celular → Configurações → Aparelhos conectados → Conectar aparelho
      </p>

      <div className="glass-card p-6 glow-green-sm">
        {error ? (
          <div className="flex flex-col items-center gap-4 p-8">
            <WifiOff className="w-12 h-12 text-destructive" />
            <p className="text-sm text-destructive text-center">{error}</p>
            <button
              onClick={() => { setError(null); setStatus("loading"); }}
              className="text-sm text-primary hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : status === "connected" ? (
          <div className="flex flex-col items-center gap-4 p-8">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">WhatsApp conectado! Coletando dados...</p>
          </div>
        ) : qrImage ? (
          <div className="relative">
            <img src={qrImage} alt="QR Code WhatsApp" className="w-64 h-64 rounded-xl" />
            <div className="absolute inset-0 rounded-xl border-2 border-primary/30" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 p-8 w-64 h-64 justify-center">
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
