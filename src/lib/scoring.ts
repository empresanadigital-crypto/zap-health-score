import type { AnalysisData } from "./api";

export interface HealthScore {
  total: number;
  breakdown: {
    accountAge: number;
    activeChats: number;
    groupActivity: number;
    blastHistory: number;
    profileSetup: number;
  };
  dispatchRange: { min: number; max: number };
  label: string;
  metrics: {
    chatsLabel: string;
    groupsLabel: string;
    warmupDays: string;
    trustLevel: string;
  };
  recommendations: Recommendation[];
}

export interface Recommendation {
  type: "success" | "warning" | "info";
  title: string;
  description: string;
}

export function calculateScoreFromAPI(data: NonNullable<AnalysisData["data"]>): HealthScore {
  const profileScore = (data.hasProfilePic ? 5 : 0) + (data.hasStatus ? 5 : 0);
  const groupScore = data.groupCount === 0 ? 0 : data.groupCount <= 5 ? 12 : 20;
  const accountAgeScore = 18;
  const estimatedChats = data.groupCount * 3;
  const chatsScore = estimatedChats < 10 ? 5 : estimatedChats < 50 ? 15 : 25;
  const blastScore = 15;

  const breakdown = {
    accountAge: accountAgeScore,
    activeChats: chatsScore,
    groupActivity: groupScore,
    blastHistory: blastScore,
    profileSetup: profileScore,
  };

  const total = Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0));

  const dispatchRange =
    total >= 80 ? { min: 80, max: 150 } :
    total >= 50 ? { min: 30, max: 50 } :
                  { min: 5, max: 20 };

  const label =
    total >= 80 ? "Saudável" :
    total >= 50 ? "Moderado" :
                  "Em Risco";

  const chatsLabel = estimatedChats < 10 ? "< 10" : estimatedChats < 50 ? "10 – 50" : "50+";
  const groupsLabel = data.groupCount === 0 ? "Nenhum" : `${data.groupCount} grupos`;
  const trustLevels = ["Baixo", "Médio", "Alto"];
  const trustIndex = Math.min(2, Math.floor(total / 34));

  const metrics = {
    chatsLabel,
    groupsLabel,
    warmupDays: "Detectado via API",
    trustLevel: trustLevels[trustIndex],
  };

  const recommendations: Recommendation[] = [];

  if (!data.hasProfilePic || !data.hasStatus) {
    recommendations.push({
      type: "info",
      title: "Complete seu perfil",
      description: !data.hasProfilePic && !data.hasStatus
        ? "Configure foto de perfil e status para aumentar a confiança."
        : !data.hasProfilePic ? "Adicione uma foto de perfil." : "Adicione um status.",
    });
  } else {
    recommendations.push({ type: "success", title: "Perfil bem configurado", description: "Foto e status configurados." });
  }

  if (data.groupCount === 0) {
    recommendations.push({ type: "warning", title: "Participe de grupos", description: "Nenhum grupo detectado. Participe de pelo menos 3-5 grupos." });
  } else if (data.groupCount >= 5) {
    recommendations.push({ type: "success", title: "Boa atividade em grupos", description: `${data.groupCount} grupos detectados.` });
  } else {
    recommendations.push({ type: "info", title: "Aumente participação em grupos", description: `${data.groupCount} grupo(s). Tente participar de pelo menos 5.` });
  }

  recommendations.push({ type: "info", title: "Varie os horários de envio", description: "Distribua disparos ao longo do dia." });

  if (total < 50) {
    recommendations.push({ type: "warning", title: "Número em risco", description: "Evite disparos em massa. Foque em conversas orgânicas." });
  }

  return { total, breakdown, dispatchRange, label, metrics, recommendations };
}
