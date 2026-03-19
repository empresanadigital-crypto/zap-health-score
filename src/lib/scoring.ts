import type { AIAnalysisResult } from "./api";

export interface HealthScore {
  total: number;
  label: string;
  dispatchRange: { min: number; max: number };
  metrics: {
    chatsLabel: string;
    groupsLabel: string;
    warmupDays: string;
    trustLevel: string;
  };
  recommendations: Recommendation[];
  analysisNotes: string;
}

export interface Recommendation {
  type: "success" | "warning" | "info";
  title: string;
  description: string;
}

export function convertAIResultToScore(ai: AIAnalysisResult): HealthScore {
  return {
    total: Math.min(100, Math.max(0, ai.score)),
    label: ai.label,
    dispatchRange: ai.dispatchRange,
    metrics: ai.metrics,
    recommendations: ai.recommendations,
    analysisNotes: ai.analysisNotes,
  };
}
