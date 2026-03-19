import { useState } from "react";
import { motion } from "framer-motion";
import { ClipboardCheck, ChevronRight } from "lucide-react";
import type { SurveyAnswers } from "@/lib/scoring";

interface QRCodeScannerProps {
  onScan: (answers: SurveyAnswers) => void;
}

const questions = [
  {
    key: "accountAge" as const,
    label: "Há quantos meses esse número está ativo?",
    options: ["Menos de 3 meses", "3 a 12 meses", "Mais de 1 ano"],
  },
  {
    key: "activeChats" as const,
    label: "Quantas conversas individuais ativas você tem?",
    options: ["Menos de 10", "10 a 50", "Mais de 50"],
  },
  {
    key: "groupActivity" as const,
    label: "Participa de grupos no WhatsApp?",
    options: ["Não participo", "1 a 5 grupos", "Mais de 5 grupos"],
  },
  {
    key: "blastHistory" as const,
    label: "Já usou esse número para disparos em massa?",
    options: ["Nunca", "Algumas vezes", "Frequentemente"],
  },
  {
    key: "profileSetup" as const,
    label: "Tem foto de perfil e status configurados?",
    options: ["Nenhum dos dois", "Só um deles", "Ambos configurados"],
  },
];

const QRCodeScanner = ({ onScan }: QRCodeScannerProps) => {
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const allAnswered = questions.every((q) => answers[q.key] !== undefined);

  const handleSubmit = () => {
    if (!allAnswered) return;
    onScan({
      accountAge: answers.accountAge,
      activeChats: answers.activeChats,
      groupActivity: answers.groupActivity,
      blastHistory: answers.blastHistory,
      profileSetup: answers.profileSetup,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-6 w-full max-w-lg"
    >
      <div className="flex items-center gap-2 mb-2">
        <ClipboardCheck className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Questionário rápido</h2>
      </div>
      <p className="text-sm text-muted-foreground text-center -mt-4">
        Responda 5 perguntas sobre seu número para receber o diagnóstico.
      </p>

      <div className="w-full space-y-4">
        {questions.map((q, qi) => (
          <motion.div
            key={q.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: qi * 0.08 }}
            className="glass-card p-4 space-y-3"
          >
            <p className="text-sm font-medium text-foreground">{q.label}</p>
            <div className="grid gap-2">
              {q.options.map((opt, oi) => {
                const selected = answers[q.key] === oi;
                return (
                  <button
                    key={oi}
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.key]: oi }))}
                    className={`text-left text-sm px-4 py-2.5 rounded-xl border transition-all ${
                      selected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border/50 bg-secondary/30 text-muted-foreground hover:border-primary/40 hover:bg-secondary/60"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!allAnswered}
        className={`mt-2 flex items-center gap-2 px-8 py-3 font-semibold rounded-xl transition-all ${
          allAnswered
            ? "bg-primary text-primary-foreground hover:brightness-110 glow-green-sm"
            : "bg-secondary text-muted-foreground cursor-not-allowed"
        }`}
      >
        Analisar meu número
        <ChevronRight className="w-4 h-4" />
      </button>
    </motion.div>
  );
};

export default QRCodeScanner;
