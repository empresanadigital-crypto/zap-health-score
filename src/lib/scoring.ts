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
  source: {
    isPartial: boolean;
    measuredCount: number;
    totalSignals: number;
    summary: string;
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

  const breakdown = {
    accountAge: 0,
    activeChats: 0,
    groupActivity: groupScore,
    blastHistory: 0,
    profileSetup: profileScore,
  };

  const measuredCount = 2;
  const totalSignals = 5;
  const measuredScore = breakdown.groupActivity + breakdown.profileSetup;
  const total = Math.min(100, Math.round((measuredScore / 30) * 100));

  const dispatchRange = total >= 70
    ? { min: 20, max: 40 }
    : total >= 35
      ? { min: 10, max: 20 }
      : { min: 5, max: 10 };

  const label = total >= 70 ? "Parcialmente forte" : total >= 35 ? "Parcial" : "Inicial";

  const metrics = {
    chatsLabel: "Não medido",
    groupsLabel: data.groupCount === 0 ? "Nenhum" : `${data.groupCount} grupos`,
    warmupDays: "Não medido",
    trustLevel: measuredScore >= 20 ? "Parcial alto" : measuredScore >= 10 ? "Parcial médio" : "Parcial baixo",
  };

  const recommendations: Recommendation[] = [
    {
      type: "warning",
      title: "Resultado parcial com dados reais",
      description: "Hoje a análise usa apenas grupos, foto de perfil e status. Idade da conta, conversas ativas e histórico de disparos ainda não estão sendo medidos pela VPS.",
    },
  ];

  if (!data.hasProfilePic || !data.hasStatus) {
    recommendations.push({
      type: "info",
      title: "Complete seu perfil",
      description: !data.hasProfilePic && !data.hasStatus
        ? "Configure foto e status para fortalecer o sinal real do número."
        : !data.hasProfilePic
          ? "Adicione uma foto de perfil para melhorar o sinal coletado."
          : "Adicione um status para melhorar o sinal coletado.",
    });
  } else {
    recommendations.push({
      type: "success",
      title: "Perfil confirmado",
      description: "Foto e status foram lidos com sucesso na sessão conectada.",
    });
  }

  if (data.groupCount === 0) {
    recommendations.push({
      type: "warning",
      title: "Nenhum grupo detectado",
      description: "A VPS não encontrou grupos nessa sessão. Isso reduz a base real usada na análise.",
    });
  } else {
    recommendations.push({
      type: "success",
      title: "Grupos detectados com dados reais",
      description: `${data.groupCount} grupo(s) foram lidos diretamente da sessão do WhatsApp.`,
    });
  }

  recommendations.push({
    type: "info",
    title: "Próximo passo para precisão real",
    description: "Para medir conversas ativas e histórico de envio sem inventar números, precisamos ampliar o coletor da VPS para sincronizar chats individuais e registrar volume de disparos ao longo do tempo.",
  });

  return {
    total,
    breakdown,
    dispatchRange,
    label,
    metrics,
    source: {
      isPartial: true,
      measuredCount,
      totalSignals,
      summary: "Dados reais lidos: grupos, foto de perfil e status. Dados ainda não medidos: idade da conta, conversas ativas e histórico de disparos.",
    },
    recommendations,
  };
}
