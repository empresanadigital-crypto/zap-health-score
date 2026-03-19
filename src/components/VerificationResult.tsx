import { motion } from "framer-motion";
import { CheckCircle, XCircle, AlertTriangle, MessageSquare, Phone, ShieldAlert, Ban, RotateCcw, Info } from "lucide-react";
import type { VerificationResult as Result } from "@/lib/phoneVerification";

interface VerificationResultProps {
  result: Result;
  phone: string;
  onReset: () => void;
}

const VerificationResultView = ({ result, phone, onReset }: VerificationResultProps) => {
  const formatted = phone.length === 11
    ? `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`
    : `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;

  const checks = [
    {
      label: "WhatsApp Ativo",
      description: result.whatsappActive
        ? "Este número possui uma conta WhatsApp ativa."
        : "Não foi possível detectar WhatsApp neste número.",
      status: result.whatsappActive ? "pass" : "fail",
      icon: MessageSquare,
    },
    {
      label: "Número Válido",
      description: result.validNumber
        ? `Número ${result.details.numberType} válido · ${result.details.carrier} · ${result.details.region}`
        : "O formato ou DDD deste número é inválido.",
      status: result.validNumber ? "pass" : "fail",
      icon: Phone,
    },
    {
      label: "Reputação / Spam",
      description: result.spamReputation === "clean"
        ? "Nenhuma denúncia de spam encontrada para este número."
        : result.spamReputation === "suspect"
        ? `${result.details.spamReports} denúncia(s) encontrada(s). Número suspeito.`
        : `${result.details.spamReports} denúncias de spam. Número marcado como spam.`,
      status: result.spamReputation === "clean" ? "pass" : result.spamReputation === "suspect" ? "warn" : "fail",
      icon: ShieldAlert,
    },
    {
      label: "Lista Negra",
      description: result.blacklisted
        ? "Este número consta em listas negras conhecidas."
        : "Este número não consta em nenhuma lista negra.",
      status: result.blacklisted ? "fail" : "pass",
      icon: Ban,
    },
  ] as const;

  const passCount = checks.filter((c) => c.status === "pass").length;

  const statusIcon = {
    pass: <CheckCircle className="w-6 h-6 text-success shrink-0" />, 
    warn: <AlertTriangle className="w-6 h-6 text-warning shrink-0" />,
    fail: <XCircle className="w-6 h-6 text-destructive shrink-0" />,
  };

  const statusBorder = {
    pass: "border-success/30 bg-success/5",
    warn: "border-warning/30 bg-warning/5",
    fail: "border-destructive/30 bg-destructive/5",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-lg space-y-6"
    >
      {/* Header */}
      <div className="text-center space-y-2">
        <p className="text-sm text-muted-foreground">Resultado para</p>
        <p className="text-2xl font-bold font-mono text-foreground">+55 {formatted}</p>
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20">
          <span className="text-sm font-medium text-primary">{passCount}/4 verificações aprovadas</span>
        </div>
      </div>

      {/* Check cards */}
      <div className="space-y-3">
        {checks.map((check, index) => {
          const Icon = check.icon;
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + index * 0.1 }}
              className={`flex items-start gap-4 p-4 rounded-xl border ${statusBorder[check.status]}`}
            >
              {statusIcon[check.status]}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <p className="font-semibold text-sm text-foreground">{check.label}</p>
                </div>
                <p className="text-sm text-muted-foreground">{check.description}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Disclaimer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex items-start gap-3 p-4 rounded-xl bg-secondary/50 border border-border/50"
      >
        <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          Os resultados são apenas informativos e baseados em dados públicos. 
          Nenhum dado pessoal é armazenado ou compartilhado.
        </p>
      </motion.div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="flex justify-center"
      >
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:brightness-110 transition-all glow-green-sm"
        >
          <RotateCcw className="w-4 h-4" />
          Verificar outro número
        </button>
      </motion.div>
    </motion.div>
  );
};

export default VerificationResultView;
