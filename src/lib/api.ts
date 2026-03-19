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
    groups: { name: string; participants: number }[];
    timestamp: number;
  };
}

async function proxyCall(endpoint: string, method: string = "GET"): Promise<any> {
  const url = `${SUPABASE_URL}/functions/v1/whatsapp-proxy?endpoint=${encodeURIComponent(endpoint)}`;
  
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
  });
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
