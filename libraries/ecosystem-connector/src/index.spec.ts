import { createHmac } from 'node:crypto';
import {
  AnextpostApiError,
  AnextpostCircuitOpenError,
  AnextpostClient,
  verifyAnextpostWebhook,
} from './index';

describe('AnextpostClient & verifyAnextpostWebhook', () => {
  it('sends Idempotency-Key and default provenance on createPost', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify([{ postId: 'p1', integration: 'i1' }]), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const client = new AnextpostClient({
      baseUrl: 'http://127.0.0.1:3000',
      apiKey: 'test-key',
      defaultAgentName: 'reposter-app',
      fetchImpl,
    });

    const result = await client.createPost(
      {
        type: 'draft',
        date: '2026-11-16T12:00:00.000Z',
        posts: [{ integration: { id: 'int-1' }, value: [{ content: 'Hello repost' }] }],
        provenance: { externalRef: 'src-post-99' },
      },
      { idempotencyKey: 'repost:src-post-99:int-1' }
    );

    expect(result).toEqual([{ postId: 'p1', integration: 'i1' }]);
    expect(calls[0].url).toBe('http://127.0.0.1:3000/public/v1/posts');
    expect((calls[0].init.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'repost:src-post-99:int-1'
    );
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.provenance).toEqual({
      agentName: 'reposter-app',
      source: 'api',
      externalRef: 'src-post-99',
    });
  });

  it('retries transient 503 responses and succeeds without opening circuit', async () => {
    let attempt = 0;
    const fetchImpl = (async () => {
      attempt += 1;
      if (attempt === 1) {
        return new Response('unavailable', { status: 503 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    const client = new AnextpostClient({
      baseUrl: 'http://127.0.0.1:3000',
      apiKey: 'k',
      maxRetries: 1,
      retryBaseDelayMs: 5,
      fetchImpl,
    });

    await expect(client.listIntegrations()).resolves.toEqual([]);
    expect(attempt).toBe(2);
    expect(client.getCircuitState()).toBe('CLOSED');
  });

  it('opens circuit breaker after threshold failures and fails fast', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response('down', { status: 503 });
    }) as unknown as typeof fetch;

    const client = new AnextpostClient({
      baseUrl: 'http://127.0.0.1:3000',
      apiKey: 'k',
      maxRetries: 0,
      circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 60_000 },
      fetchImpl,
    });

    await expect(client.listIntegrations()).rejects.toBeInstanceOf(AnextpostApiError);
    await expect(client.listIntegrations()).rejects.toBeInstanceOf(AnextpostApiError);
    expect(client.getCircuitState()).toBe('OPEN');

    await expect(client.listIntegrations()).rejects.toBeInstanceOf(
      AnextpostCircuitOpenError
    );
    // 3rd call must NOT hit fetchImpl
    expect(calls).toBe(2);
  });

  it('verifies valid HMAC-SHA256 webhook signatures and rejects tampered/expired ones', () => {
    const secret = 'pwhsec_test';
    const rawBody = JSON.stringify({ event: 'post.published', id: 'evt_1' });
    const timestamp = '1763250000';
    const sig = `sha256=${createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex')}`;

    expect(
      verifyAnextpostWebhook({
        rawBody,
        signature: sig,
        timestamp,
        secret,
        nowSeconds: 1763250010,
      })
    ).toEqual({ valid: true });

    expect(
      verifyAnextpostWebhook({
        rawBody: `${rawBody} `,
        signature: sig,
        timestamp,
        secret,
        nowSeconds: 1763250010,
      })
    ).toEqual({ valid: false, reason: 'signature_mismatch' });

    expect(
      verifyAnextpostWebhook({
        rawBody,
        signature: sig,
        timestamp,
        secret,
        nowSeconds: 1763251000,
      })
    ).toEqual({ valid: false, reason: 'timestamp_out_of_window' });
  });
});
