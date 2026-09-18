import { http, HttpResponse } from 'msw'

// Default handlers for common API endpoints used across integration tests.
// Migration handlers are registered per-test via server.use() — not included here by default.

export const handlers = [
  // PendingInvitesProvider fetches /v1/invites/pending on mount.
  http.get('*/v1/invites/pending', () => HttpResponse.json({ invites: [] })),
]
