import { spawnSync } from 'node:child_process';

const skipBrowserInstall =
  process.env.CI === 'true' ||
  process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1' ||
  process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === 'true';

if (skipBrowserInstall) {
  console.log('Skipping Playwright browser install in CI.');
  process.exit(0);
}

const command = process.platform === 'win32' ? 'playwright.cmd' : 'playwright';
const result = spawnSync(command, ['install', 'chromium', 'webkit'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
