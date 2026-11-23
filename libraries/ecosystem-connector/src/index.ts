import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Consecutive transient failures before opening the circuit. Default: 3 */
  failureThreshold?: number;
  /** Cooldown in ms before probing recovery in HALF_OPEN state. Default: 30000 */
  resetTimeoutMs?: number;
}

export interface AnextpostClientOptions {
  baseUrl: string;
  apiKey: string;
  defaultAgentName?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  circuitBreaker?: CircuitBreakerOptions;
  fetchImpl?: typeof fetch;
}

export interface ProvenanceMetadata {
  agentName?: string;
  workflowId?: string | null;
  runId?: string | null;
  externalRef?: string | null;
  source?: string;
}

export interface CreatePostPayload {
  type: 'draft' | 'schedule' | 'now';
  date: string;
  posts: Array<{
    integration: { id: string };
    value: Array<{
      content: string;
      image?: Array<{ id: string; path: string }>;
    }>;
    settings?: Record<string, unknown>;
  }>;
  shortLink?: boolean;
  tags?: Array<{ value: string; label: string }>;
  provenance?: ProvenanceMetadata;
}

export class AnextpostCircuitOpenError extends Error {
  readonly code = 'CIRCUIT_OPEN';
  constructor(readonly retryAfterMs: number) {
    super(`ANEXTPOST circuit breaker is OPEN; retry after ${retryAfterMs}ms`);
    this.name = 'AnextpostCircuitOpenError';
  }
}

export class AnextpostApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message?: string
  ) {
    super(message ?? `ANEXTPOST API returned HTTP ${status}`);
    this.name = 'AnextpostApiError';
  }
}

/**
 * Fault-isolated client for talking to ANEXTPOST `/public/v1/*` from other
 * ecosystem apps (Reposting, Messaging, etc.). Includes automatic
 * `Idempotency-Key`, bounded retries with jitter, and a Circuit Breaker so a
 * restarting or degraded hub never crashes downstream apps.
 */
export class AnextpostClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultAgentName: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  private circuitState: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(options: AnextpostClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.defaultAgentName = options.defaultAgentName ?? 'ecosystem-app';
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 250;
    this.failureThreshold = options.circuitBreaker?.failureThreshold ?? 3;
    this.resetTimeoutMs = options.circuitBreaker?.resetTimeoutMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  getCircuitState(): CircuitState {
    if (
      this.circuitState === 'OPEN' &&
      Date.now() - this.openedAt >= this.resetTimeoutMs
    ) {
      return 'HALF_OPEN';
    }
    return this.circuitState;
  }

  async listIntegrations() {
    return this.request<unknown[]>('GET', '/public/v1/integrations');
  }

  async getPost(postId: string) {
    return this.request<Record<string, unknown>>(
      'GET',
      `/public/v1/posts/${encodeURIComponent(postId)}`
    );
  }

  async createPost(
    payload: CreatePostPayload,
    options?: { idempotencyKey?: string }
  ) {
    const idempotencyKey = options?.idempotencyKey ?? randomUUID();
    const enrichedPayload: CreatePostPayload = {
      ...payload,
      provenance: {
        agentName: this.defaultAgentName,
        source: 'api',
        ...payload.provenance,
      },
    };
    return this.request<unknown[]>('POST', '/public/v1/posts', {
      body: enrichedPayload,
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    });
  }

  async uploadFromUrl(url: string) {
    return this.request<{ id: string; path: string }>(
      'POST',
      '/public/v1/upload-from-url',
      { body: { url } }
    );
  }

  async listWebhookSubscriptions() {
    return this.request<unknown[]>('GET', '/public/v1/webhook-subscriptions');
  }

  async createWebhookSubscription(input: {
    name: string;
    url: string;
    events: Array<'post.published' | 'post.failed' | 'approval.requested' | 'approval.resolved'>;
  }) {
    return this.request<Record<string, unknown>>(
      'POST',
      '/public/v1/webhook-subscriptions',
      { body: input }
    );
  }

  async sendWebhookTest(subscriptionId: string) {
    return this.request<Record<string, unknown>>(
      'POST',
      `/public/v1/webhook-subscriptions/${encodeURIComponent(subscriptionId)}/test`
    );
  }

  private async request<T>(
    method: string,
    path: string,
    options?: { body?: unknown; headers?: Record<string, string> }
  ): Promise<T> {
    const state = this.getCircuitState();
    if (state === 'OPEN') {
      const remaining = Math.max(
        0,
        this.resetTimeoutMs - (Date.now() - this.openedAt)
      );
      throw new AnextpostCircuitOpenError(remaining);
    }
    if (state === 'HALF_OPEN') {
      this.circuitState = 'HALF_OPEN';
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: this.apiKey,
            'Content-Type': 'application/json',
            ...options?.headers,
          },
          body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        const text = await response.text();
        const parsedBody = text ? safeJsonParse(text) : null;

        if (response.ok) {
          this.onSuccess();
          return parsedBody as T;
        }

        const apiError = new AnextpostApiError(response.status, parsedBody);
        const isTransient = response.status === 429 || response.status >= 500;
        if (!isTransient) {
          // 4xx client errors are not hub outages; keep circuit closed.
          return Promise.reject(apiError);
        }

        lastError = apiError;
      } catch (err) {
        if (err instanceof AnextpostApiError) {
          throw err;
        }
        lastError = err;
      }

      if (attempt < this.maxRetries) {
        const jitter = Math.floor(Math.random() * 50);
        const delay = this.retryBaseDelayMs * Math.pow(2, attempt) + jitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    this.onFailure();
    throw lastError;
  }

  private onSuccess() {
    this.consecutiveFailures = 0;
    this.circuitState = 'CLOSED';
  }

  private onFailure() {
    this.consecutiveFailures += 1;
    if (
      this.circuitState === 'HALF_OPEN' ||
      this.consecutiveFailures >= this.failureThreshold
    ) {
      this.circuitState = 'OPEN';
      this.openedAt = Date.now();
    }
  }
}

export interface VerifyWebhookInput {
  rawBody: string;
  signature: string | undefined;
  timestamp: string | undefined;
  secret: string;
  maxAgeSeconds?: number;
  nowSeconds?: number;
}

/**
 * Verifies an incoming ANEXTPOST webhook (`X-Postsider-Signature` +
 * `X-Postsider-Timestamp`) using constant-time HMAC-SHA256 comparison and
 * replay-window validation.
 */
export function verifyAnextpostWebhook(input: VerifyWebhookInput): {
  valid: boolean;
  reason?: string;
} {
  if (!input.signature || !input.timestamp) {
    return { valid: false, reason: 'missing_signature_or_timestamp' };
  }

  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) {
    return { valid: false, reason: 'invalid_timestamp' };
  }

  const maxAge = input.maxAgeSeconds ?? 300;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > maxAge) {
    return { valid: false, reason: 'timestamp_out_of_window' };
  }

  const expected = `sha256=${createHmac('sha256', input.secret)
    .update(`${input.timestamp}.${input.rawBody}`)
    .digest('hex')}`;

  const a = Buffer.from(input.signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'signature_mismatch' };
  }

  return { valid: true };
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
