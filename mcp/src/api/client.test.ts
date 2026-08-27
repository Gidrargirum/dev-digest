import { describe, it, expect, vi, afterEach } from 'vitest';
import { request, ApiError, ApiUnavailableError } from './client.js';

describe('client request()', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('parses a successful JSON response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const result = await request('/health');

    expect(result).toEqual({ ok: true });
  });

  it('throws ApiError on an HTTP error status returned by the API', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ message: 'not found' }), { status: 404 }));

    await expect(request('/missing')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiUnavailableError when the network call itself fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(request('/agents')).rejects.toBeInstanceOf(ApiUnavailableError);
    await expect(request('/agents')).rejects.toThrow(/DevDigest API недоступний/);
  });
});
