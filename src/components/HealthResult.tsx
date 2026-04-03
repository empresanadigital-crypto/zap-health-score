import { motion } from "framer-motion";
import { Shield, MessageSquare, Users, TrendingUp, AlertTriangle, CheckCircle, Info } from "lucide-react";
import type { HealthScore } from "@/lib/scoring";

interface HealthResultProps {
  score: HealthScore;
  onRestart: () => void;
}

const HealthResult = ({ score, onRestart }: HealthResultProps) => {
  const circumference = 2 * Math.PI * 58;
  const offset = circumference * (1 - score.total / 100);

  const getScoreColor = (s: number) => {
    if (s >= 70) return "text-green-400";
    if (s >= 40) return "text-yellow-400";
    return "text-red-400";
  };

  const metrics = [
    { icon: MessageSquare, label: "Conversas", value: score.metrics.chatsLabel },
    { icon: Users, label: "Grupos", value: score.metrics.groupsLabel },
    { icon: TrendingUp, label: "Tempo de uso", value: score.metrics.warmupDays },
    { icon: Shield, label: "Nível de confiança", value: score.metrics.trustLevel },
  ];

  const recIcons = { success: CheckCircle, warning: AlertTriangle, info: Info };
  const recColors = {
    success: "border-success/30 bg-success/5",
    warning: "border-warning/30 bg-warning/5",
    info: "border-info/30 bg-info/5",
  };
  const recIconColors = { success: "text-success", warning: "text-warning", info: "text-info" };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-3xl space-y-8">
      {score.analysisNotes && (
        <div className="glass-card p-4 border border-info/30 bg-info/5 text-center">
          <p className="text-sm text-muted-foreground">{score.analysisNotes}</p>
        </div>
      )}

      <div className="flex flex-col items-center gap-4">
        <div className="relative w-44 h-44">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
            <circle cx="64" cy="64" r="58" fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
            <motion.circle cx="64" cy="64" r="58" fill="none" stroke="hsl(var(--primary))" strokeWidth="5" strokeLinecap="round" strokeDasharray={circumference} initial={{ strokeDashoffset: circumference }} animate={{ strokeDashoffset: offset }} transition={{ duration: 1.5, ease: "easeOut" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }} className={`text-5xl font-bold font-mono ${getScoreColor(score.total)}`}>
              {score.total}
            </motion.span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">score IA</span>
          </div>
        </div>

        <div className="text-center">
          <h3 className={`text-xl font-bold ${getScoreColor(score.total)}`}>{score.label}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Análise gerada por IA com base nos dados reais coletados da sua sessão.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <motion.div key={index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 + index * 0.1 }} className="glass-card p-4 text-center">
              <Icon className="w-5 h-5 mx-auto mb-2 text-primary" />
              <p className="text-lg font-bold font-mono text-foreground">{metric.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{metric.label}</p>
            </motion.div>
          );
        })}
      </div>

      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.2 }} className="glass-card p-6 glow-green text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Shield className="w-6 h-6 text-primary" />
          <h3 className="text-lg font-bold text-foreground">Limite seguro de disparo</h3>
        </div>
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-4xl font-bold font-mono gradient-text">
            {score.dispatchRange.min} – {score.dispatchRange.max}
          </span>
          <span className="text-muted-foreground">msgs/dia</span>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          recomendação da IA baseada nos dados reais coletados
        </p>
      </motion.div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-foreground">Recomendações da IA</h3>
        {score.recommendations.map((rec, index) => {
          const Icon = recIcons[rec.type] || Info;
          return (
            <motion.div key={index} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.4 + index * 0.1 }} className={`flex gap-4 p-4 rounded-xl border ${recColors[rec.type] || recColors.info}`}>
              <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${recIconColors[rec.type] || recIconColors.info}`} />
              <div>
                <p className="font-medium text-sm text-foreground">{rec.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{rec.description}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }} className="text-center pt-4">
        <button onClick={onRestart} className="px-8 py-3 bg-secondary text-secondary-foreground font-medium rounded-xl hover:bg-secondary/80 transition-all mr-4">
          Novo Diagnóstico
        </button>
        <a href="https://readyzap.com.br/#pricing" target="_blank" rel="noopener noreferrer" className="inline-block px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:brightness-110 transition-all glow-green-sm">
          Começar Aquecimento
        </a>
      </motion.div>
    </motion.div>
  );
};

export default HealthResult;
