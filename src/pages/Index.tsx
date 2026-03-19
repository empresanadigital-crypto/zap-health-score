import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Search, Zap } from "lucide-react";
import PhoneInput from "@/components/PhoneInput";
import VerificationProgress from "@/components/VerificationProgress";
import VerificationResultView from "@/components/VerificationResult";
import { verifyPhone, type VerificationResult } from "@/lib/phoneVerification";

type Step = "input" | "verifying" | "result";

const Index = () => {
  const [step, setStep] = useState<Step>("input");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleVerify = (digits: string) => {
    setPhone(digits);
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStep("verifying");
    }, 300);
  };

  const handleComplete = useCallback(() => {
    const res = verifyPhone(phone);
    setResult(res);
    setStep("result");
  }, [phone]);

  const handleReset = () => {
    setStep("input");
    setPhone("");
    setResult(null);
  };

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
            <span className="font-bold text-lg text-foreground">CheckZap</span>
          </div>
        </header>

        {/* Main */}
        <main className="max-w-5xl mx-auto px-6 py-12 md:py-20">
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <Search className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-medium">Verificação gratuita</span>
            </div>

            <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-4 leading-tight">
              Verifique qualquer número
              <br className="hidden md:block" />{" "}
              de <span className="gradient-text">WhatsApp</span>
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto text-base md:text-lg">
              Descubra se um número é válido, tem WhatsApp ativo,
              se é spam ou consta em listas negras. Sem cadastro, sem login.
            </p>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-6 mt-8 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-primary/70" />
                <span>100% gratuito</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-primary/70" />
                <span>Sem cadastro</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-primary/70" />
                <span>Dados não armazenados</span>
              </div>
            </div>
          </motion.div>

          {/* Step content */}
          <div className="flex justify-center">
            <AnimatePresence mode="wait">
              {step === "input" && (
                <motion.div key="input" exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                  <PhoneInput onVerify={handleVerify} isLoading={isLoading} />
                </motion.div>
              )}
              {step === "verifying" && (
                <motion.div key="verifying" exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                  <VerificationProgress onComplete={handleComplete} />
                </motion.div>
              )}
              {step === "result" && result && (
                <motion.div key="result">
                  <VerificationResultView result={result} phone={phone} onReset={handleReset} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Footer */}
        <footer className="text-center py-8 text-xs text-muted-foreground space-y-2">
          <p>Os resultados são apenas informativos e não substituem verificação oficial.</p>
          <p>© 2026 CheckZap · Verificação inteligente de números</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
