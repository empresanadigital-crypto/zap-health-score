import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Shield, Zap } from "lucide-react";
import QRCodeScanner from "@/components/QRCodeScanner";
import AnalysisProgress from "@/components/AnalysisProgress";
import HealthResult from "@/components/HealthResult";

type Step = "scan" | "analyzing" | "result";

const Index = () => {
  const [step, setStep] = useState<Step>("scan");

  const handleScan = () => setStep("analyzing");
  const handleComplete = useCallback(() => setStep("result"), []);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-primary/3 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg text-foreground">ReadyZap</span>
          </div>
          <a
            href="https://readyzap.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Voltar ao site
          </a>
        </header>

        {/* Main */}
        <main className="max-w-5xl mx-auto px-6 py-12 md:py-20">
          {/* Hero - always visible */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-medium">Diagnóstico inteligente</span>
            </div>

            <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-4 leading-tight">
              Descubra a <span className="gradient-text">saúde</span> do seu
              <br className="hidden md:block" /> número WhatsApp
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto text-base md:text-lg">
              Nossa IA analisa suas conversas, grupos e padrões de uso para dizer
              quantas mensagens você pode disparar com segurança.
            </p>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-6 mt-8 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-primary/70" />
                <span>Criptografia AES-256</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-primary/70" />
                <span>Análise em tempo real</span>
              </div>
            </div>
          </motion.div>

          {/* Step content */}
          <div className="flex justify-center">
            <AnimatePresence mode="wait">
              {step === "scan" && (
                <motion.div key="scan" exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                  <QRCodeScanner onScan={handleScan} />
                </motion.div>
              )}
              {step === "analyzing" && (
                <motion.div key="analyzing" exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                  <AnalysisProgress onComplete={handleComplete} />
                </motion.div>
              )}
              {step === "result" && (
                <motion.div key="result">
                  <HealthResult />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Footer */}
        <footer className="text-center py-8 text-xs text-muted-foreground">
          <p>© 2026 ReadyZap · Automação inteligente de WhatsApp</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
