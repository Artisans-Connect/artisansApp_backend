export type FallbackPolicyInput = {
  priority?: string;
  fcmSent: boolean;
};

export function shouldAttemptFallback(input: FallbackPolicyInput): boolean {
  return input.priority === "action_required" && !input.fcmSent;
}
