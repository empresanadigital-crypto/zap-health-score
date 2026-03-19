const API_BASE = "http://174.138.70.214:3333";

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

export async function fetchQR(): Promise<QRResponse> {
  const res = await fetch(`${API_BASE}/api/qr`);
  return res.json();
}

export async function fetchStatus(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/api/status`);
  return res.json();
}

export async function fetchAnalysis(): Promise<AnalysisData> {
  const res = await fetch(`${API_BASE}/api/analysis`);
  return res.json();
}

export async function disconnectSession(): Promise<void> {
  await fetch(`${API_BASE}/api/disconnect`, { method: "POST" });
}
