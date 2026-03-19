export interface SurveyAnswers {
  accountAge: number;      // 0, 1, 2
  activeChats: number;     // 0, 1, 2
  groupActivity: number;   // 0, 1, 2
  blastHistory: number;    // 0, 1, 2
  profileSetup: number;    // 0, 1, 2
}

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

const ACCOUNT_AGE_SCORES = [5, 18, 30];
const ACTIVE_CHATS_SCORES = [5, 15, 25];
const GROUP_SCORES = [0, 12, 20];
const BLAST_SCORES = [15, 8, 0];
const PROFILE_SCORES = [0, 5, 10];

export function calculateScore(answers: SurveyAnswers): HealthScore {
  const breakdown = {
    accountAge: ACCOUNT_AGE_SCORES[answers.accountAge],
    activeChats: ACTIVE_CHATS_SCORES[answers.activeChats],
    groupActivity: GROUP_SCORES[answers.groupActivity],
    blastHistory: BLAST_SCORES[answers.blastHistory],
    profileSetup: PROFILE_SCORES[answers.profileSetup],
  };

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

  const dispatchRange =
    total >= 80 ? { min: 80, max: 150 } :
    total >= 50 ? { min: 30, max: 50 } :
                  { min: 5, max: 20 };

  const label =
    total >= 80 ? "Saudável" :
    total >= 50 ? "Moderado" :
                  "Em Risco";

  const chatsLabels = ["< 10", "10 – 50", "50+"];
  const groupsLabels = ["Nenhum", "1 – 5", "5+"];
  const warmupDays =
    answers.accountAge === 0 ? "< 90" :
    answers.accountAge === 1 ? "90 – 365" : "365+";
  const trustLevels = ["Baixo", "Médio", "Alto"];
  const trustIndex = Math.min(2, Math.floor(total / 34));

  const metrics = {
    chatsLabel: chatsLabels[answers.activeChats],
    groupsLabel: groupsLabels[answers.groupActivity],
    warmupDays,
    trustLevel: trustLevels[trustIndex],
  };

  const recommendations: Recommendation[] = [];

  // Conditional recommendations
  if (answers.accountAge === 0) {
    recommendations.push({
      type: "warning",
      title: "Número muito novo",
      description: "Números com menos de 3 meses são mais vulneráveis a banimento. Evite disparos em massa e foque em conversas orgânicas.",
    });
  }

  if (answers.activeChats === 0) {
    recommendations.push({
      type: "warning",
      title: "Aumente suas conversas ativas",
      description: "Ter menos de 10 conversas ativas reduz a confiança do número. Inicie mais conversas reais com contatos conhecidos.",
    });
  }

  if (answers.groupActivity === 0) {
    recommendations.push({
      type: "info",
      title: "Participe de grupos",
      description: "Participar de grupos fortalece a reputação do seu número. Entre em 3 a 5 grupos e interaja regularmente.",
    });
  } else if (answers.groupActivity >= 1) {
    recommendations.push({
      type: "success",
      title: "Boa atividade em grupos",
      description: "Sua participação em grupos contribui positivamente para a saúde do número.",
    });
  }

  if (answers.blastHistory === 2) {
    recommendations.push({
      type: "warning",
      title: "Histórico de disparos em massa detectado",
      description: "Uso frequente de disparos aumenta o risco de banimento. Reduza o volume e varie os horários de envio.",
    });
  } else if (answers.blastHistory === 0) {
    recommendations.push({
      type: "success",
      title: "Sem histórico de disparos",
      description: "Nunca ter feito disparos em massa é ótimo para a reputação do número.",
    });
  }

  if (answers.profileSetup < 2) {
    recommendations.push({
      type: "info",
      title: "Complete seu perfil",
      description: answers.profileSetup === 0
        ? "Configure foto de perfil e status. Isso aumenta significativamente a confiança do seu número."
        : "Adicione o que falta (foto ou status) para maximizar a confiança do número.",
    });
  } else {
    recommendations.push({
      type: "success",
      title: "Perfil bem configurado",
      description: "Foto, status e nome estão configurados corretamente. Isso aumenta a confiança do número.",
    });
  }

  if (total >= 50) {
    recommendations.push({
      type: "info",
      title: "Varie os horários de envio",
      description: "Distribua seus disparos ao longo do dia, evitando picos de envio em horários concentrados.",
    });
  }

  return { total, breakdown, dispatchRange, label, metrics, recommendations };
}
