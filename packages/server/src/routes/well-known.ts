import type { FastifyPluginAsync } from 'fastify';
import { SKIP_REPLAY_PROTECTION_CONFIG } from '../security/replay-protection-contract.js';

/**
 * GET /.well-known/apple-app-site-association
 *
 * Apple Universal Links verification file. iOS fetches this to confirm that
 * the domain is associated with the app before opening Universal Links
 * directly in the app instead of the browser.
 *
 * Requirements:
 *  - HTTP 200, no redirects
 *  - Content-Type: application/json
 *  - Public (no auth)
 *  - Under 128 KB
 *  - Served over HTTPS
 *
 * The appIDs value is <Apple Team ID>.<Bundle ID> (e.g. ABCDE12345.com.dipbudget.app).
 * Configure APPLE_TEAM_ID in the environment; the bundle ID comes from the
 * Capacitor config (com.dipbudget.app).
 */
const AASA_JSON = (appIDs: string[]) => ({
  applinks: {
    details: [
      {
        appIDs,
        components: [
          {
            '/': '/register/verify',
            comment: 'Magic-link registration deep links open the app directly',
          },
        ],
      },
    ],
  },
});

/**
 * GET /.well-known/assetlinks.json
 *
 * Android App Links verification file. Android downloads this to verify
 * that the domain is authorised to open the app.
 *
 * Requirements:
 *  - HTTP 200, no redirects
 *  - Content-Type: application/json
 *  - Public (no auth)
 *  - Served over HTTPS
 *
 * package_name must match the app's applicationId (com.dipbudget.app).
 * sha256_cert_fingerprints must match the certificate that signs the
 * production build (Play App Signing key for Play Store builds).
 * Configure ANDROID_SHA256_FINGERPRINT in the environment.
 */
const ASSETLINKS_JSON = (packageName: string, sha256Fingerprints: string[]) => [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: packageName,
      sha256_cert_fingerprints: sha256Fingerprints,
    },
  },
];

export const wellKnownRoutes: FastifyPluginAsync = async (server) => {
  const env = server.env;
  const bundleId = 'com.dipbudget.app';

  // Apple AASA
  server.get('/.well-known/apple-app-site-association', {
    config: SKIP_REPLAY_PROTECTION_CONFIG,
  }, async (_request, reply) => {
    const appleTeamId = env.appleTeamId;
    if (!appleTeamId) {
      // Return 404 rather than a valid-looking file with placeholder data.
      // iOS caches the AASA file aggressively — a malformed but HTTP-200
      // response would poison the cache and be harder to recover from.
      return reply.code(404).send({ error: 'APPLE_TEAM_ID not configured' });
    }

    return reply
      .header('Content-Type', 'application/json')
      .send(AASA_JSON([`${appleTeamId}.${bundleId}`]));
  });

  // Android assetlinks
  server.get('/.well-known/assetlinks.json', {
    config: SKIP_REPLAY_PROTECTION_CONFIG,
  }, async (_request, reply) => {
    const sha256 = env.androidSha256Fingerprint;
    if (!sha256) {
      // Same reasoning as above — 404 prevents cache poisoning.
      return reply.code(404).send({ error: 'ANDROID_SHA256_FINGERPRINT not configured' });
    }

    return reply
      .header('Content-Type', 'application/json')
      .send(ASSETLINKS_JSON(bundleId, [sha256]));
  });
};
