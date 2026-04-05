import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Shield, Zap } from "lucide-react";
import QRCodeScanner from "@/components/QRCodeScanner";
import AnalysisProgress from "@/components/AnalysisProgress";
import HealthResult from "@/components/HealthResult";
import { convertAIResultToScore, type HealthScore } from "@/lib/scoring";
import { disconnectSession, analyzeWithAI, type AnalysisData } from "@/lib/api";
import { toast } from "sonner";

type Step = "scan" | "analyzing" | "result";

const Index = () => {
  const [step, setStep] = useState<Step>("scan");
  const [healthScore, setHealthScore] = useState<HealthScore | null>(null);
  const [rawData, setRawData] = useState<NonNullable<AnalysisData["data"]> | null>(null);
  const hasActiveSessionRef = useRef(false);

  // Desconecta sessão ao fechar/sair da aba
  useEffect(() => {
    const cleanup = () => {
      if (hasActiveSessionRef.current) {
        navigator.sendBeacon(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-proxy?endpoint=${encodeURIComponent("/api/disconnect")}`
        );
      }
    };
    window.addEventListener("beforeunload", cleanup);
    return () => window.removeEventListener("beforeunload", cleanup);
  }, []);

  const handleScan = (data: NonNullable<AnalysisData["data"]>) => {
    hasActiveSessionRef.current = true;
    setRawData(data);
    setStep("analyzing");
  };

  const handleAnalysisComplete = useCallback(async () => {
    if (!rawData) return;
    try {
      const aiResult = await analyzeWithAI(rawData);
      setHealthScore(convertAIResultToScore(aiResult));
      try {
        await disconnectSession();
      } catch {
        // ignora erro de disconnect, análise já foi concluída
      }
      setStep("result");
      hasActiveSessionRef.current = false;
    } catch (err) {
      console.error("AI analysis failed:", err);
      toast.error("Erro na análise com IA. Tente novamente.");
      setStep("scan");
    }
  }, [rawData]);

  const handleRestart = async () => {
    try {
      await disconnectSession();
    } catch {
      // ignora erro de disconnect no restart
    }
    hasActiveSessionRef.current = false;
    setStep("scan");
    setHealthScore(null);
    setRawData(null);
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-primary/3 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10">
        <header className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            <span className="text-xl font-black tracking-tight gradient-text">ReadyZap</span>
          </div>
          <div className="flex items-center gap-4">
            <div
              onClick={() => window.open("https://app.readyzap.com.br/dashboard", "_blank")}
              className="flex items-center gap-2 cursor-pointer transition-all"
              style={{ padding: "6px 10px", borderRadius: 7, fontSize: 12, color: "rgba(242,242,255,0.22)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(59,130,246,0.08)"; e.currentTarget.style.color = "#60a5fa"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(242,242,255,0.22)"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>ReadyZap</div>
                <div style={{ fontSize: 9, opacity: 0.6 }}>Aquecedor de chips</div>
              </div>
            </div>
            <a href="https://readyzap.com.br" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Voltar ao site
            </a>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-12 md:py-20">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.12)' }}>
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-primary">Diagnóstico com IA</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold text-foreground mb-4 leading-tight tracking-tight">
              Descubra a <span className="gradient-text">saúde</span> do seu
              <br className="hidden md:block" /> número WhatsApp
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto text-base md:text-lg">
              Escaneie o QR Code e uma IA analisa seus dados reais para dizer quantas mensagens você pode disparar com segurança.
            </p>
            <div className="flex items-center justify-center gap-6 mt-8 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-primary" />
                <span>100% gratuito</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-primary" />
                <span>Análise com IA real</span>
              </div>
            </div>
          </motion.div>

          <div className="flex justify-center">
            <AnimatePresence mode="wait">
              {step === "scan" && (
                <motion.div key="scan" exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                  <QRCodeScanner onScan={handleScan} />
                </motion.div>
              )}
              {step === "analyzing" && (
                <motion.div key="analyzing" exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                  <AnalysisProgress onComplete={handleAnalysisComplete} />
                </motion.div>
              )}
              {step === "result" && healthScore && (
                <motion.div key="result">
                  <HealthResult score={healthScore} onRestart={handleRestart} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        <footer className="text-center py-8 space-y-2">
          <p className="text-xs font-semibold" style={{ color: 'rgba(242,242,255,0.25)' }}>© 2026 ReadyZap · Automação inteligente de WhatsApp</p>
          <p className="text-xs max-w-md mx-auto" style={{ color: 'rgba(242,242,255,0.15)' }}>
            Diagnóstico com IA baseado em dados reais do seu WhatsApp. Sessão desconectada após análise.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
