import { existsSync, readFileSync } from 'fs';
import path from 'path';

jest.mock('@playwright/test', () => ({
  defineConfig: <T>(config: T): T => config,
  devices: {
    'Desktop Chrome': { defaultBrowserType: 'chromium' },
  },
}));

const FRONTEND_DIR = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(FRONTEND_DIR, '..');

describe('Playwright E2E configuration and 404 spec', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('emits an HTML report in playwright-report alongside github annotations in CI', async () => {
    process.env.CI = 'true';
    process.env.PLAYWRIGHT_BASE_URL = 'http://localhost:3000';

    const { default: config } = await import('../../../playwright.config');

    expect(config.testDir).toBe('./e2e');
    expect(config.outputDir).toBe('./test-results');
    expect(config.forbidOnly).toBe(true);
    expect(config.retries).toBe(1);
    expect(config.reporter).toEqual([
      ['github'],
      ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ]);
  });

  it('emits an HTML report in playwright-report alongside list output locally and honors custom baseURL', async () => {
    delete process.env.CI;
    process.env.PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:3100';

    const { default: config } = await import('../../../playwright.config');

    expect(config.forbidOnly).toBe(false);
    expect(config.retries).toBe(0);
    expect(config.use?.baseURL).toBe('http://127.0.0.1:3100');
    expect(config.reporter).toEqual([
      ['list'],
      ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ]);
  });

  it('ships an E2E spec in frontend/e2e/not-found.spec.ts covering unknown routes', () => {
    const specPath = path.join(FRONTEND_DIR, 'e2e', 'not-found.spec.ts');
    expect(existsSync(specPath)).toBe(true);

    const specSource = readFileSync(specPath, 'utf8');
    expect(specSource).toContain('expect(response?.status()).toBe(404)');
    expect(specSource).toContain("getByRole('heading', { name: 'Page not found', level: 1 })");
    expect(specSource).toContain("getByRole('link', { name: 'Go to dashboard' })");
    expect(specSource).toContain("getByRole('link', { name: 'Back to homepage' })");
  });
});

describe('CI workflow and README coverage badge', () => {
  const ciWorkflow = readFileSync(path.join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const readme = readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');

  it('defines an e2e job running Playwright against Docker Compose and gating quality-gate', () => {
    expect(ciWorkflow).toMatch(/\n  e2e:\n/);
    expect(ciWorkflow).toContain(
      'docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build --wait'
    );
    expect(ciWorkflow).toContain('run: npm run test:e2e');
    expect(ciWorkflow).toContain(
      'docker compose -f docker-compose.yml -f docker-compose.e2e.yml down -v'
    );
    expect(ciWorkflow).toMatch(/quality-gate:[\s\S]*?needs:[\s\S]*?\be2e\b/);
  });

  it('uploads the Playwright test report as a CI artifact even when tests fail', () => {
    expect(ciWorkflow).toMatch(
      /- name: Upload Playwright test report\s+if: always\(\)\s+uses: actions\/upload-artifact@v\d+\s+with:\s+name: playwright-report\s+path: \|\s+frontend\/playwright-report\//
    );
  });

  it('renders a Codecov test coverage badge in README.md', () => {
    expect(readme).toContain(
      '[![codecov](https://codecov.io/gh/BigNathan1/CoopLumen/branch/main/graph/badge.svg)](https://codecov.io/gh/BigNathan1/CoopLumen)'
    );
  });
});
