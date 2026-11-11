export interface ViolationEvent {
  active: boolean;
  startedAt: number;
  content: string;
}

export interface ViolationNotice extends ViolationEvent {
  reason: string | null;
  deduction: number | null;
}

export function parseViolation(content: string) {
  const reason = content.match(/违规原因\s*[:：]\s*([\s\S]*?)(?=[；;。\n]|[，,](?:请|在整改|本次)|$)/u)?.[1]?.trim() || null;
  const score = content.match(/(?:扣除|扣罚|扣减)\s*(\d+(?:\.\d+)?)\s*(?:主播)?(?:积分|分)/u);
  const deduction = score ? Number(score[1]) : /(?:不扣分|未扣分|不扣除(?:主播)?积分)/u.test(content) ? 0 : null;
  return { reason, deduction };
}
