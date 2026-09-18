import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FEEDBACK_ROUTES } from './feedback.js';
import { createServer } from '../test/route-test-helpers.js';

// ---------------------------------------------------------------------------
// Service mocks
// ---------------------------------------------------------------------------

const mockSendFeedbackEmail = vi.fn().mockResolvedValue(undefined);

vi.mock('../auth/email.service.js', () => ({
  sendFeedbackEmail: (...args: unknown[]) => mockSendFeedbackEmail(...args),
}));

vi.stubEnv('BREVO_API_KEY', 'test-key');

// ---------------------------------------------------------------------------
// POST /v1/feedback
// ---------------------------------------------------------------------------

describe('POST /v1/feedback', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    mockSendFeedbackEmail.mockClear();
    server = await createServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('returns 200 with valid message', async () => {
    const res = await server.inject({
      method: 'POST',
      url: FEEDBACK_ROUTES.submit,
      payload: { message: 'Great app!' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    expect(mockSendFeedbackEmail).toHaveBeenCalledOnce();
    expect(mockSendFeedbackEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Great app!',
        email: undefined,
      }),
    );
  });

  it('returns 200 with message and email', async () => {
    const res = await server.inject({
      method: 'POST',
      url: FEEDBACK_ROUTES.submit,
      payload: { message: 'Love it!', email: 'user@example.com' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    expect(mockSendFeedbackEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Love it!',
        email: 'user@example.com',
      }),
    );
  });

  it('returns 400 when message is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: FEEDBACK_ROUTES.submit,
      payload: { email: 'user@example.com' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when message is empty string', async () => {
    const res = await server.inject({
      method: 'POST',
      url: FEEDBACK_ROUTES.submit,
      payload: { message: '' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when message exceeds maxLength', async () => {
    const res = await server.inject({
      method: 'POST',
      url: FEEDBACK_ROUTES.submit,
      payload: { message: 'a'.repeat(5001) },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 with invalid email format', async () => {
    const res = await server.inject({
      method: 'POST',
      url: FEEDBACK_ROUTES.submit,
      payload: { message: 'Test', email: 'not-an-email' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 with empty body', async () => {
    const res = await server.inject({
      method: 'POST',
      url: FEEDBACK_ROUTES.submit,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('strips unknown fields from body', async () => {
    const res = await server.inject({
      method: 'POST',
      url: FEEDBACK_ROUTES.submit,
      payload: { message: 'Test', unknownField: 'value' },
    });

    expect(res.statusCode).toBe(200);
  });

  it('does not require nonce — public endpoint', async () => {
    const res = await server.inject({
      method: 'POST',
      url: FEEDBACK_ROUTES.submit,
      payload: { message: 'No nonce needed' },
    });

    expect(res.statusCode).toBe(200);
  });

  it('passes recipient config to email service', async () => {
    await server.inject({
      method: 'POST',
      url: FEEDBACK_ROUTES.submit,
      payload: { message: 'Test' },
    });

    expect(mockSendFeedbackEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientPrimary: 'feedback@test.com',
        recipientBackup: 'backup-feedback@test.com',
      }),
    );
  });

  it('includes timestamp in email service call', async () => {
    const before = Date.now();
    await server.inject({
      method: 'POST',
      url: FEEDBACK_ROUTES.submit,
      payload: { message: 'Test' },
    });
    const after = Date.now();

    const call = mockSendFeedbackEmail.mock.calls[0][0];
    const timestamp = new Date(call.timestamp).getTime();
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('returns 429 when rate limit exceeded', async () => {
    // Rate limit is max 10 per 15 min window
    // Send 11 requests to exceed the limit
    for (let i = 0; i < 11; i++) {
      const res = await server.inject({
        method: 'POST',
        url: FEEDBACK_ROUTES.submit,
        payload: { message: `Feedback ${i}` },
      });
      if (i < 10) {
        expect(res.statusCode).toBe(200);
      } else {
        console.log('Response status:', res.statusCode);
        console.log('Response body:', res.body);
        console.log('Response headers:', res.headers);
        expect(res.statusCode).toBe(429);
        const body = res.json();
        expect(body).toEqual({
          status: 'too_many_requests',
          retryAfter: expect.any(Number),
        });
      }
    }
  });
});
