export interface WebhookConfig {
  url: string;
  events: WebhookEventType[];
  hallucinationThreshold?: number;
}

export type WebhookEventType =
  | 'policy_violation'
  | 'escalation_blocked'
  | 'high_hallucination';

interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  proxy_version: string;
  details: Record<string, unknown>;
}

export function sendWebhook(config: WebhookConfig | undefined, event: WebhookEventType, details: Record<string, unknown>): void {
  if (!config || !config.events.includes(event) || !config.url) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    proxy_version: '0.1.0',
    details,
  };

  fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    // fire-and-forget — don't block the response
  });
}
