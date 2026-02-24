import { motion } from "framer-motion";
import { Smartphone, QrCode } from "lucide-react";

interface QRCodeScannerProps {
  onScan: () => void;
}

const QRCodeScanner = ({ onScan }: QRCodeScannerProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-8"
    >
      <div className="relative">
        {/* Pulse rings */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-64 h-64 rounded-3xl border border-primary/20 pulse-ring" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-64 h-64 rounded-3xl border border-primary/10 pulse-ring" style={{ animationDelay: '1s' }} />
        </div>

        {/* QR Code placeholder */}
        <div className="relative w-64 h-64 glass-card flex items-center justify-center glow-green-sm overflow-hidden">
          <div className="absolute inset-4 border-2 border-dashed border-primary/30 rounded-xl" />
          
          {/* Scan line */}
          <div className="absolute top-4 left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent scan-line" />
          
          <div className="flex flex-col items-center gap-3 z-10">
            <QrCode className="w-16 h-16 text-primary/60" />
            <p className="text-sm text-muted-foreground text-center px-4">
              Abra o WhatsApp Web e escaneie o QR Code
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Smartphone className="w-5 h-5" />
          <p className="text-sm">
            WhatsApp → Dispositivos conectados → Conectar dispositivo
          </p>
        </div>

        <button
          onClick={onScan}
          className="mt-4 px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:brightness-110 transition-all glow-green-sm"
        >
          Simular Conexão
        </button>
        <p className="text-xs text-muted-foreground">
          Clique para ver uma demonstração do diagnóstico
        </p>
      </div>
    </motion.div>
  );
};

export default QRCodeScanner;
