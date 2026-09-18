import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__mocks__/server';
import { useFeedbackForm } from '@/services/feedbackService';
import { AllProviders } from '@/test-utils/render';

vi.mock('@/lib/api', () => ({
  API_BASE_URL: 'http://localhost',
  parseJwtPayload: vi.fn(),
  extractPublicKeyFromToken: vi.fn(),
}));

const FEEDBACK_ENDPOINT = '*/v1/feedback';
const FEEDBACK_STORAGE_KEY = 'budget-wise-pending-feedback';

describe('feedbackService Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    // Default to online
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  });

  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('Happy path: Online submission sends valid payload and MSW captures it', async () => {
    let capturedBody: any = null;

    server.use(
      http.post(FEEDBACK_ENDPOINT, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true });
      })
    );

    const { result } = renderHook(() => useFeedbackForm(), { wrapper: AllProviders });

    await act(async () => {
      await result.current.submitFeedback('Great app', 'user@example.com');
    });

    // Check request shape — message includes technical info appended by the service
    expect(capturedBody).toMatchObject({
      email: 'user@example.com',
    });
    expect(capturedBody.message).toContain('Great app');
    expect(capturedBody.message).toContain('Technical information:');
    expect(capturedBody.message).toContain('Operating system:');
    expect(capturedBody.message).toContain('Device:');
    expect(capturedBody.message).toContain('App version:');
    expect(capturedBody.message).toContain('Build:');

    // Check localStorage was updated to 'sent'
    const stored = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('sent');
    expect(stored[0].message).toContain('Great app');
    expect(stored[0].email).toBe('user@example.com');
  });

  it('Network error: fetch failure handles gracefully and keeps pending', async () => {
    // Suppress expected console.error to keep test output clean
    vi.spyOn(console, 'error').mockImplementation(() => {});

    server.use(
      http.post(FEEDBACK_ENDPOINT, () => {
        return HttpResponse.error(); // simulates a network error / failed fetch
      })
    );

    const { result } = renderHook(() => useFeedbackForm(), { wrapper: AllProviders });

    await act(async () => {
      await result.current.submitFeedback('Error test', 'error@example.com');
    });

    // The fetch failed, so the status should remain 'pending'
    const stored = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('pending');
  });

  it('Server error: API returns 500, handles gracefully and keeps pending', async () => {
    // Suppress expected console.error to keep test output clean
    vi.spyOn(console, 'error').mockImplementation(() => {});

    server.use(
      http.post(FEEDBACK_ENDPOINT, () => {
        return new HttpResponse(null, { status: 500 }); // simulates a true 500 server error
      })
    );

    const { result } = renderHook(() => useFeedbackForm(), { wrapper: AllProviders });

    await act(async () => {
      await result.current.submitFeedback('Error test 500', 'error500@example.com');
    });

    // The fetch failed, so the status should remain 'pending'
    const stored = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('pending');
  });

  it('Offline queuing: stores feedback as pending when offline without making request', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    let requestMade = false;
    server.use(
      http.post(FEEDBACK_ENDPOINT, () => {
        requestMade = true;
        return HttpResponse.json({ ok: true });
      })
    );

    const { result } = renderHook(() => useFeedbackForm(), { wrapper: AllProviders });

    await act(async () => {
      await result.current.submitFeedback('Offline feedback', 'offline@example.com');
    });

    // We shouldn't even hit the MSW handler because we are "offline"
    expect(requestMade).toBe(false);

    const stored = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('pending');
  });

  it('Client error (400): marks as failed and rethrows so the page can show error toast', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    server.use(
      http.post(FEEDBACK_ENDPOINT, () => {
        return new HttpResponse(null, { status: 400 });
      })
    );

    const { result } = renderHook(() => useFeedbackForm(), { wrapper: AllProviders });

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.submitFeedback('Too long message', 'user@example.com');
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).toBeDefined();

    // Feedback should be marked as 'failed', not kept as 'pending' for retry
    const stored = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('failed');
  });

  it('Mounting Retry: processes pending feedback on mount when online', async () => {
    // 1. Pre-populate pending feedback in localStorage
    const pendingFeedback = {
      id: 'test-id',
      message: 'Pending message',
      email: 'test@example.com',
      timestamp: new Date().toISOString(),
      status: 'pending',
    };
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify([pendingFeedback]));

    let requestMade = false;
    server.use(
      http.post(FEEDBACK_ENDPOINT, async () => {
        requestMade = true;
        return HttpResponse.json({ ok: true });
      })
    );

    // 2. Render hook - this should automatically trigger the useEffect that calls processPendingFeedback
    renderHook(() => useFeedbackForm(), { wrapper: AllProviders });

    // 3. Wait for the asynchronous side effect to complete
    await vi.waitFor(() => {
        const stored = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '[]');
        expect(stored[0].status).toBe('sent');
    });

    expect(requestMade).toBe(true);
  });

  it('Mounting Retry: marks pending feedback as failed on 400 so it is never retried', async () => {
    const pendingFeedback = {
      id: 'bad-msg',
      message: 'Message that is way too long and will be rejected by the server…',
      email: 'test@example.com',
      timestamp: new Date().toISOString(),
      status: 'pending',
    };
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify([pendingFeedback]));

    server.use(
      http.post(FEEDBACK_ENDPOINT, () => {
        return new HttpResponse(null, { status: 400 });
      })
    );

    renderHook(() => useFeedbackForm(), { wrapper: AllProviders });

    await vi.waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '[]');
      expect(stored[0].status).toBe('failed');
    });
  });

  it('Online Event Retry: processes pending feedback when online event is dispatched', async () => {
    // 1. Pre-populate pending feedback in localStorage
    const pendingFeedback = {
      id: 'test-event-id',
      message: 'Event message',
      email: 'event@example.com',
      timestamp: new Date().toISOString(),
      status: 'pending',
    };
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify([pendingFeedback]));

    let requestMade = false;
    server.use(
      http.post(FEEDBACK_ENDPOINT, async () => {
        requestMade = true;
        return HttpResponse.json({ ok: true });
      })
    );

    // 2. Render the hook to register the 'online' event listener
    renderHook(() => useFeedbackForm(), { wrapper: AllProviders });

    // 3. Dispatch online event globally.
    //    feedbackService registers window.addEventListener('online', processPendingFeedback)
    window.dispatchEvent(new Event('online'));

    // 4. Wait for the asynchronous side effect to complete
    await vi.waitFor(() => {
        const stored = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '[]');
        expect(stored[0].status).toBe('sent');
    });

    expect(requestMade).toBe(true);
  });
});
