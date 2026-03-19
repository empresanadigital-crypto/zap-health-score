import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawData = await req.json();

    const prompt = `Você é um especialista em saúde de números WhatsApp e aquecimento de chips para envio de mensagens em massa.

Analise os dados REAIS coletados abaixo de uma sessão WhatsApp e forneça um diagnóstico honesto e preciso. NÃO INVENTE DADOS. Se algo não foi medido, diga claramente "Não medido".

DADOS REAIS DA SESSÃO:
- Número: ${rawData.phone || "Não informado"}
- Nome do perfil: ${rawData.name || "Não informado"}
- Foto de perfil: ${rawData.hasProfilePic ? "Sim" : "Não"}
- Status configurado: ${rawData.hasStatus ? "Sim" : "Não"}
- Total de conversas individuais: ${rawData.chatCount ?? "Não medido"}
- Total de grupos: ${rawData.groupCount ?? "Não medido"}
- Primeira mensagem (timestamp): ${rawData.oldestMessageTimestamp ? new Date(rawData.oldestMessageTimestamp * 1000).toISOString() : "Não medido"}
- Grupos com detalhes: ${rawData.groups ? JSON.stringify(rawData.groups.slice(0, 20)) : "Não disponível"}

Responda EXCLUSIVAMENTE em JSON válido, sem markdown, sem explicações fora do JSON. Use este formato exato:

{
  "score": <número de 0 a 100 baseado APENAS nos dados reais disponíveis>,
  "label": "<classificação: Excelente | Forte | Moderado | Fraco | Crítico>",
  "accountAgeDays": <número de dias desde a primeira mensagem, ou null se não medido>,
  "metrics": {
    "chatsLabel": "<ex: '150 conversas' ou 'Não medido'>",
    "groupsLabel": "<ex: '22 grupos' ou 'Não medido'>",
    "warmupDays": "<ex: '180 dias' baseado na idade da conta, ou 'Não medido'>",
    "trustLevel": "<Muito alto | Alto | Médio | Baixo | Muito baixo>"
  },
  "dispatchRange": {
    "min": <número mínimo de msgs/dia recomendado>,
    "max": <número máximo de msgs/dia recomendado>
  },
  "recommendations": [
    {
      "type": "<success | warning | info>",
      "title": "<título curto>",
      "description": "<descrição detalhada e honesta>"
    }
  ],
  "analysisNotes": "<resumo do que foi medido vs o que não foi medido>"
}

REGRAS IMPORTANTES:
1. O score deve refletir APENAS os dados que você realmente tem. Se faltam dados, o score deve ser mais conservador.
2. Se chatCount não foi medido, NÃO assuma um valor. Diga "Não medido".
3. Se oldestMessageTimestamp não foi medido, NÃO assuma uma idade da conta.
4. A faixa de disparo deve ser CONSERVADORA e segura para evitar ban.
5. As recomendações devem ser honestas e práticas.
6. Se o número tem poucos grupos e conversas, avise sobre o risco.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI API error:", errText);
      throw new Error(`AI API returned ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content || "";
    
    // Extract JSON from response (handle possible markdown wrapping)
    let jsonStr = content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const analysis = JSON.parse(jsonStr);

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
