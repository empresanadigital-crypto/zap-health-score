import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { MessageSquare, Users, Shield, Activity, Loader2 } from "lucide-react";

interface AnalysisProgressProps {
  onComplete: () => void;
}

const steps = [
  { icon: MessageSquare, label: "Sincronizando sessão conectada", detail: "Lendo os metadados autorizados do seu WhatsApp" },
  { icon: Users, label: "Coletando grupos reais", detail: "Buscando grupos e participantes disponíveis na sessão" },
  { icon: Shield, label: "Verificando perfil do número", detail: "Conferindo foto e status configurados" },
  { icon: Activity, label: "Montando diagnóstico parcial", detail: "Mostrando apenas sinais realmente medidos" },
];

const AnalysisProgress = ({ onComplete }: AnalysisProgressProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [waitingForAI, setWaitingForAI] = useState(false);

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= steps.length - 1) {
          clearInterval(stepInterval);
          setTimeout(() => {
            setWaitingForAI(true);
            onComplete();
          }, 800);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 1.5;
      });
    }, 80);

    return () => {
      clearInterval(stepInterval);
      clearInterval(progressInterval);
    };
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-8 w-full max-w-lg"
    >
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 52}`}
            strokeDashoffset={`${2 * Math.PI * 52 * (1 - Math.min(progress, 100) / 100)}`}
            className="transition-all duration-200"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-black tracking-tight text-foreground" style={{ letterSpacing: '-0.05em' }}>
            {Math.min(Math.round(progress), 100)}%
          </span>
        </div>
      </div>

      <div className="w-full space-y-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = index === currentStep;
          const isDone = index < currentStep;

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.15 }}
              className={`flex items-center gap-4 p-4 rounded-xl transition-all duration-300 ${
                isActive ? "glass-card" : isDone ? "opacity-60" : "opacity-30"
              }`}
            >
              <div className={`p-2 rounded-lg`} style={isActive ? { background: 'rgba(59,130,246,0.12)' } : { background: 'rgba(255,255,255,0.04)' }}>
                <Icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.label}
                </p>
                {(isActive || isDone) && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-muted-foreground mt-0.5"
                  >
                    {step.detail}
                  </motion.p>
                )}
              </div>
              {isDone && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(24,242,106,0.1)', border: '1px solid rgba(24,242,106,0.15)' }}
                >
                  <span style={{ color: '#18f26a', fontSize: '11px' }}>✓</span>
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      {waitingForAI && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 glass-card p-4 w-full"
        >
          <Loader2 className="w-5 h-5 animate-spin shrink-0" style={{ color: '#3b82f6' }} />
          <div>
            <p className="text-sm font-medium text-foreground">Gerando diagnóstico com IA...</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Analisando seus dados reais para montar o relatório personalizado.
            </p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default AnalysisProgress;
