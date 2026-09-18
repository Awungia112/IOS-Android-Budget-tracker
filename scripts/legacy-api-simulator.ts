import * as http from 'node:http';
import { 
  onlineAccountFixture, 
  minimalAccountFixture, 
  multiAccountFixture 
} from '../packages/core/src/migration/test-fixtures/index.js';

/**
 * Gate 5 — Legacy API Simulator for Manual E2E Testing
 * 
 * Provides a real HTTP server on port 8000 that mimics the legacy Django API.
 * Uses the representative datasets from the unit/integration tests.
 * 
 * Available Credentials:
 *   - online@test.de  / password -> Shared/Online accounts (Gate 5 primary)
 *   - offline@test.de / password -> Local-only accounts
 *   - multi@test.de   / password -> Mixed account types
 */

const USERS: Record<string, any> = {
  'online@test.de': onlineAccountFixture,
  'offline@test.de': minimalAccountFixture,
  'multi@test.de': multiAccountFixture,
  'test@test.de': multiAccountFixture,
};

function createMockLegacyServer() {
  const server = http.createServer((req, res) => {
    // Add CORS headers for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? '/';
    const method = req.method ?? 'GET';
    
    console.log(`[Simulator] ${method} ${url}`);

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let responseBody: any = { error: 'not found' };
      let status = 404;

      // Simple Auth Detection based on Body or Header
      let user = USERS['multi@test.de']; // default
      if (url === '/user/get-token' && method === 'POST') {
        try {
          const payload = JSON.parse(body);
          console.log(`[Simulator] Auth attempt for: ${payload.email}`);
          if (USERS[payload.email]) {
            responseBody = { token: 'sim-token-' + payload.email };
            status = 200;
          } else {
            responseBody = { error: 'invalid credentials' };
            status = 401;
          }
        } catch {
          status = 400;
        }
      } else {
        // Resolve user mock from "token" (we appended email to token above)
        const authHeader = req.headers['authorization'] || '';
        const emailMatch = authHeader.match(/Bearer sim-token-(.+)/);
        const email = emailMatch ? emailMatch[1] : 'multi@test.de';
        user = USERS[email] || USERS['multi@test.de'];

        const responses = user.responses as Record<string, any>;

        if (url === '/api/accounts') {
          responseBody = responses['GET /api/accounts'] || [];
          status = 200;
        } else if (url === '/api/access') {
          responseBody = responses['GET /api/access'] || [];
          status = 200;
        } else if (url === '/user/details') {
          responseBody = { id: 1, email: email, first_name: 'Test', last_name: 'User' };
          status = 200;
        } else {
          const balanceMatch = url.match(/^\/api\/balance\?account_id=(\d+)$/);
          const categoryMatch = url.match(/^\/api\/category\?account_id=(\d+)$/);
          const recuringMatch = url.match(/^\/api\/recuring\?account_id=(\d+)$/);
          const savingMatch = url.match(/^\/api\/saving-goal\?category_id=(\d+)$/);

          if (balanceMatch) {
            responseBody = responses[`GET /api/balance?account_id=${balanceMatch[1]}`] || [];
            status = 200;
          } else if (categoryMatch) {
            responseBody = responses[`GET /api/category?account_id=${categoryMatch[1]}`] || [];
            status = 200;
          } else if (recuringMatch) {
            responseBody = responses[`GET /api/recuring?account_id=${recuringMatch[1]}`] || [];
            status = 200;
          } else if (savingMatch) {
            responseBody = responses[`GET /api/saving-goal?category_id=${savingMatch[1]}`] || [];
            status = 200;
          }
        }
      }

      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responseBody));
    });
  });

  return server;
}

const PORT = 8000;
const server = createMockLegacyServer();

server.listen(PORT, '127.0.0.1', () => {
  console.log('══════════════════════════════════════════════');
  console.log('   GATE 5 LEGACY API SIMULATOR RUNNING');
  console.log(`   URL: http://localhost:${PORT}`);
  console.log('══════════════════════════════════════════════');
  console.log('   Available Test Emails (password is any):');
  console.log('   - online@test.de  (Online/Shared Accounts)');
  console.log('   - offline@test.de (Local Only)');
  console.log('   - multi@test.de   (Mixed Multi-Account)');
  console.log('   - test@test.de    (Mixed Multi-Account)');
  console.log('══════════════════════════════════════════════');
});
