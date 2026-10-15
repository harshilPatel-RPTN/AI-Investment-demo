export type Bias = 'bullish' | 'bearish' | 'neutral' | 'conflicting' | 'insufficient_data';

export interface AIAnalysis {
  summary: string;
  bias: Bias;
  supportingFactors: string[];
  opposingFactors: string[];
  technicalObservations: string[];
  assetDrivers: string[];
  newsAndEvents: string[];
  macroContext: string[];
  risks: string[];
  invalidationConditions: string[];
  missingData: string[];
  assumptions: string[];
  /** What the in-app trading community thinks (member opinion, kept apart from facts). */
  communityView?: string[];
  /** The model's step-by-step reasoning over the evidence before its conclusion. */
  reasoning?: string[];
}

export interface AIContext {
  instrument?: Record<string, unknown>;
  timeframe?: string;
  technical?: Record<string, unknown>;
  news?: Array<Record<string, unknown>>;
  fundamentals?: Record<string, unknown>;
  events?: Array<Record<string, unknown>>;
  community?: Record<string, unknown>;
  marketNews?: Array<Record<string, unknown>>;
  extra?: string;
}

export type AIMode = 'analyze' | 'chat' | 'strategy' | 'explain';

export interface AIRequest {
  mode: AIMode;
  question: string;
  style: 'simple' | 'balanced' | 'advanced';
  context: AIContext;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AIResponse {
  ok: boolean;
  mode: AIMode;
  analysis?: AIAnalysis;
  text?: string;
  rules?: unknown;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  model?: string;
  /** Chat mode: the model's reasoning summary, shown separately from the answer. */
  thinking?: string;
  error?: string;
  code?: string;
}
