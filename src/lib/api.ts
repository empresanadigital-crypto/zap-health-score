const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface QRResponse {
  qr: string | null;
  status: string;
}

export interface AnalysisData {
  ready: boolean;
  status?: string;
  data?: {
    phone: string;
    name: string;
    hasProfilePic: boolean;
    hasStatus: boolean;
    groupCount: number;
    chatCount?: number;
    oldestMessageTimestamp?: number;
    groups: { name: string; participants: number }[];
    timestamp: number;
  };
}

export interface AIAnalysisResult {
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
  recommendations: {
    type: "success" | "warning" | "info";
    title: string;
    description: string;
  }[];
  analysisNotes: string;
}

async function proxyCall(endpoint: string, method: string = "GET"): Promise<any> {
  const url = `${SUPABASE_URL}/functions/v1/whatsapp-proxy?endpoint=${encodeURIComponent(endpoint)}`;

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`Proxy error ${res.status}: ${errorBody}`);
  }

  return res.json();
}

export async function fetchQR(): Promise<QRResponse> {
  return proxyCall("/api/qr");
}

export async function fetchStatus(): Promise<{ status: string }> {
  return proxyCall("/api/status");
}

export async function fetchAnalysis(): Promise<AnalysisData> {
  return proxyCall("/api/analysis");
}

export async function disconnectSession(): Promise<void> {
  await proxyCall("/api/disconnect", "POST");
}

export async function analyzeWithAI(data: NonNullable<AnalysisData["data"]>): Promise<AIAnalysisResult> {
  const url = `${SUPABASE_URL}/functions/v1/analyze-whatsapp`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`AI analysis failed: ${res.status}`);
  }
  return res.json();
}
