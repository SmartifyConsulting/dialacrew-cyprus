// Browser-safe pricing used by the Token Ledger. Approximate USD rates per 1M tokens —
// an estimate, not an exact provider invoice.
type ChatPricing = { inputPer1M: number; outputPer1M: number };

const OPENAI_CHAT_PRICING: Record<string, ChatPricing> = {
  "gpt-5": { inputPer1M: 5, outputPer1M: 15 },
  "gpt-5-mini": { inputPer1M: 0.6, outputPer1M: 2.4 },
  "gpt-4.1": { inputPer1M: 2, outputPer1M: 8 },
  "gpt-4.1-mini": { inputPer1M: 0.4, outputPer1M: 1.6 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
};
const DEFAULT_CHAT_PRICING: ChatPricing = { inputPer1M: 2.5, outputPer1M: 10 };
/** Flat estimate per generated image. */
export const OPENAI_IMAGE_PER_CALL_USD = 0.04;

export function estimateChatCostUsd(model: string | null, inputTokens: number | null, outputTokens: number | null): number | null {
  if (inputTokens == null && outputTokens == null) return null;
  const key = model ? Object.keys(OPENAI_CHAT_PRICING).sort((a, b) => b.length - a.length).find((k) => model.startsWith(k)) : undefined;
  const pricing = (key && OPENAI_CHAT_PRICING[key]) || DEFAULT_CHAT_PRICING;
  const cost = ((inputTokens ?? 0) / 1_000_000) * pricing.inputPer1M + ((outputTokens ?? 0) / 1_000_000) * pricing.outputPer1M;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
