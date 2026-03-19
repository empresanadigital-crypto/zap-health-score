import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Recommendation = {
  type: "success" | "warning" | "info";
  title: string;
  description: string;
};

type ComputedAnalysis = {
  score: number;
  label: string;
  accountAgeDays: number | null;
  metrics: {
    chatsLabel: string;
    groupsLabel: string;
    warmupDays: string;
    trustLevel: string;
  };
  dispatchRange: { min: number; max: number };
  recommendations: Recommendation[];
  analysisNotes: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const toNonNegativeInt = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return Math.floor(value);
};

const toTrimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeTimestampMs = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const timestampMs = value < 1_000_000_000_000 ? value * 1000 : value;
  const now = Date.now();

  if (timestampMs > now) return null;
  if (timestampMs < new Date("2009-01-01T00:00:00.000Z").getTime()) return null;

  return timestampMs;
};

const getAgeScore = (accountAgeDays: number | null) => {
  if (accountAgeDays === null) return 0;
  if (accountAgeDays >= 365) return 30;
  if (accountAgeDays >= 180) return 25;
  if (accountAgeDays >= 90) return 18;
  if (accountAgeDays >= 30) return 10;
  if (accountAgeDays >= 7) return 5;
  return 2;
};

const getChatScore = (chatCount: number | null) => {
  if (chatCount === null) return 0;
  if (chatCount >= 300) return 25;
  if (chatCount >= 150) return 20;
  if (chatCount >= 80) return 15;
  if (chatCount >= 30) return 10;
  if (chatCount >= 10) return 5;
  if (chatCount > 0) return 2;
  return 0;
};

const getGroupScore = (groupCount: number | null) => {
  if (groupCount === null) return 0;
  if (groupCount >= 20) return 20;
  if (groupCount >= 10) return 15;
  if (groupCount >= 5) return 10;
  if (groupCount >= 2) return 6;
  if (groupCount >= 1) return 3;
  return 0;
};

const getProfileScore = ({
  hasName,
  hasProfilePic,
  hasStatus,
}: {
  hasName: boolean;
  hasProfilePic: boolean;
  hasStatus: boolean;
}) => {
  return (hasName ? 3 : 0) + (hasProfilePic ? 4 : 0) + (hasStatus ? 3 : 0);
};

const getLabel = (score: number) => {
  if (score >= 85) return "Excelente";
  if (score >= 70) return "Forte";
  if (score >= 50) return "Moderado";
  if (score >= 30) return "Fraco";
  return "Crítico";
};

const getDispatchRange = (score: number) => {
  if (score >= 80) return { min: 80, max: 150 };
  if (score >= 50) return { min: 30, max: 50 };
  if (score >= 30) return { min: 10, max: 20 };
  return { min: 5, max: 10 };
};

const getTrustLevel = (score: number, measuredWeight: number) => {
  if (score >= 80 && measuredWeight >= 65) return "Muito alto";
  if (score >= 65 && measuredWeight >= 55) return "Alto";
  if (score >= 45 && measuredWeight >= 35) return "Médio";
  if (score >= 25) return "Baixo";
  return "Muito baixo";
};

const buildFallbackRecommendations = ({
  score,
  accountAgeDays,
  chatCount,
  groupCount,
  hasName,
  hasProfilePic,
  hasStatus,
  dispatchRange,
}: {
  score: number;
  accountAgeDays: number | null;
  chatCount: number | null;
  groupCount: number | null;
  hasName: boolean;
  hasProfilePic: boolean;
  hasStatus: boolean;
  dispatchRange: { min: number; max: number };
}): Recommendation[] => {
  const recommendations: Recommendation[] = [];

  if (accountAgeDays === null || chatCount === null) {
    recommendations.push({
      type: "warning",
      title: "Faltam sinais críticos",
      description:
        "Sem idade da conta e/ou total de conversas, o diagnóstico fica conservador de propósito para evitar promessas irreais.",
    });
  }

  if (groupCount !== null && groupCount >= 10) {
    recommendations.push({
      type: "success",
      title: "Boa presença em grupos",
      description:
        "A participação em grupos ajuda, mas sozinha não prova aquecimento suficiente para disparo em escala.",
    });
  }

  if (!hasName || !hasProfilePic || !hasStatus) {
    recommendations.push({
      type: "info",
      title: "Complete o perfil",
      description:
        "Nome, foto e status fortalecem a confiança do número e melhoram a percepção de uso legítimo.",
    });
  }

  if (accountAgeDays !== null && accountAgeDays < 30) {
    recommendations.push({
      type: "warning",
      title: "Conta ainda nova",
      description:
        "Números com pouco tempo de uso exigem aquecimento gradual antes de qualquer rotina de envio.",
    });
  }

  recommendations.push({
    type: score >= 50 ? "success" : "info",
    title: "Faixa segura atual",
    description: `Hoje a faixa conservadora é de ${dispatchRange.min} a ${dispatchRange.max} mensagens por dia para contatos frios.`,
  });

  return recommendations.slice(0, 4);
};

const buildFallbackNotes = ({
  measuredFields,
  missingFields,
  groupCount,
  chatCount,
  accountAgeDays,
}: {
  measuredFields: string[];
  missingFields: string[];
  groupCount: number | null;
  chatCount: number | null;
  accountAgeDays: number | null;
}) => {
  const measured = measuredFields.length ? measuredFields.join(", ") : "nenhum sinal útil";
  const missing = missingFields.length ? missingFields.join(", ") : "nenhum item crítico";

  return [
    `Foram medidos: ${measured}.`,
    `Não foram medidos: ${missing}.`,
    groupCount !== null ? `Grupos reportados pela sessão atual: ${groupCount}.` : "Contagem de grupos indisponível.",
    chatCount !== null ? `Conversas individuais medidas: ${chatCount}.` : "Conversas individuais não vieram da sessão.",
    accountAgeDays !== null ? `Idade estimada da conta: ${accountAgeDays} dias.` : "A idade da conta não pôde ser estimada.",
  ].join(" ");
};

const enhanceCopyWithAI = async ({
  summary,
  fallbackRecommendations,
  fallbackNotes,
}: {
  summary: Record<string, unknown>;
  fallbackRecommendations: Recommendation[];
  fallbackNotes: string;
}): Promise<{ analysisNotes: string; recommendations: Recommendation[] }> => {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return { analysisNotes: fallbackNotes, recommendations: fallbackRecommendations };
  }

  try {
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Você revisa diagnósticos de saúde de números WhatsApp. Nunca invente métricas. Use apenas os campos recebidos. Se algo não foi medido, diga explicitamente. Escreva em português do Brasil, de forma objetiva e honesta.",
          },
          {
            role: "user",
            content: JSON.stringify(summary),
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_analysis_copy",
              description: "Retorna um resumo fiel da análise e 3 a 4 recomendações práticas sem inventar dados.",
              parameters: {
                type: "object",
                properties: {
                  analysisNotes: { type: "string" },
                  recommendations: {
                    type: "array",
                    minItems: 3,
                    maxItems: 4,
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["success", "warning", "info"] },
                        title: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["type", "title", "description"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["analysisNotes", "recommendations"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "return_analysis_copy" },
        },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      return { analysisNotes: fallbackNotes, recommendations: fallbackRecommendations };
    }

    const aiResult = await aiResponse.json();
    const toolArgs = aiResult.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!toolArgs) {
      return { analysisNotes: fallbackNotes, recommendations: fallbackRecommendations };
    }

    const parsed = JSON.parse(toolArgs);
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.filter((rec: Recommendation) => rec?.title && rec?.description && rec?.type).slice(0, 4)
      : fallbackRecommendations;

    return {
      analysisNotes: typeof parsed.analysisNotes === "string" ? parsed.analysisNotes : fallbackNotes,
      recommendations: recommendations.length ? recommendations : fallbackRecommendations,
    };
  } catch (error) {
    console.error("AI enhancement failed:", error);
    return { analysisNotes: fallbackNotes, recommendations: fallbackRecommendations };
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawData = await req.json();

    const phone = toTrimmedString(rawData.phone) ?? "Não informado";
    const name = toTrimmedString(rawData.name);
    const hasProfilePic = rawData.hasProfilePic === true;
    const hasStatus = rawData.hasStatus === true;
    const chatCount = toNonNegativeInt(rawData.chatCount);
    const rawGroupCount = toNonNegativeInt(rawData.groupCount);
    const groups = Array.isArray(rawData.groups)
      ? rawData.groups
          .map((group: unknown) => {
            if (!group || typeof group !== "object") return null;
            const item = group as Record<string, unknown>;
            return {
              name: toTrimmedString(item.name) ?? "Grupo sem nome",
              participants: toNonNegativeInt(item.participants) ?? 0,
            };
          })
          .filter(Boolean)
      : [];
    const groupCount = rawGroupCount ?? (groups.length ? groups.length : null);

    const oldestMessageTimestampMs = normalizeTimestampMs(rawData.oldestMessageTimestamp);
    const accountAgeDays = oldestMessageTimestampMs
      ? Math.max(0, Math.floor((Date.now() - oldestMessageTimestampMs) / 86_400_000))
      : null;

    const ageScore = getAgeScore(accountAgeDays);
    const chatScore = getChatScore(chatCount);
    const groupScore = getGroupScore(groupCount);
    const profileScore = getProfileScore({ hasName: Boolean(name), hasProfilePic, hasStatus });

    let score = ageScore + chatScore + groupScore + profileScore;

    if (accountAgeDays === null && chatCount === null) {
      score = Math.min(score, 35);
    }

    if (chatCount === null && groupCount === null) {
      score = Math.min(score, 20);
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    const measuredFields = [
      name ? "nome do perfil" : null,
      hasProfilePic ? "foto de perfil" : null,
      hasStatus ? "status configurado" : null,
      chatCount !== null ? `total de conversas (${chatCount})` : null,
      groupCount !== null ? `total de grupos reportados (${groupCount})` : null,
      accountAgeDays !== null ? `idade estimada da conta (${accountAgeDays} dias)` : null,
    ].filter(Boolean) as string[];

    const missingFields = [
      !name ? "nome do perfil" : null,
      !hasProfilePic ? "foto de perfil" : null,
      !hasStatus ? "status configurado" : null,
      chatCount === null ? "total de conversas individuais" : null,
      groupCount === null ? "total de grupos" : null,
      accountAgeDays === null ? "data da primeira mensagem / idade da conta" : null,
    ].filter(Boolean) as string[];

    const measuredWeight =
      (accountAgeDays !== null ? 30 : 0) +
      (chatCount !== null ? 25 : 0) +
      (groupCount !== null ? 20 : 0) +
      10;

    const label = getLabel(score);
    const dispatchRange = getDispatchRange(score);
    const trustLevel = getTrustLevel(score, measuredWeight);

    const fallbackRecommendations = buildFallbackRecommendations({
      score,
      accountAgeDays,
      chatCount,
      groupCount,
      hasName: Boolean(name),
      hasProfilePic,
      hasStatus,
      dispatchRange,
    });

    const fallbackNotes = buildFallbackNotes({
      measuredFields,
      missingFields,
      groupCount,
      chatCount,
      accountAgeDays,
    });

    const aiCopy = await enhanceCopyWithAI({
      summary: {
        phone,
        name: name ?? "Não informado",
        hasProfilePic,
        hasStatus,
        chatCount,
        groupCount,
        accountAgeDays,
        measuredFields,
        missingFields,
        groupsPreview: groups.slice(0, 20),
        score,
        label,
        dispatchRange,
        trustLevel,
        fallbackNotes,
        fallbackRecommendations,
      },
      fallbackRecommendations,
      fallbackNotes,
    });

    const analysis: ComputedAnalysis = {
      score,
      label,
      accountAgeDays,
      metrics: {
        chatsLabel: chatCount !== null ? `${chatCount} conversas` : "Não medido",
        groupsLabel: groupCount !== null ? `${groupCount} grupos reportados` : "Não medido",
        warmupDays: accountAgeDays !== null ? `${accountAgeDays} dias` : "Não medido",
        trustLevel,
      },
      dispatchRange,
      recommendations: aiCopy.recommendations,
      analysisNotes: aiCopy.analysisNotes,
    };

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Analysis failed", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
