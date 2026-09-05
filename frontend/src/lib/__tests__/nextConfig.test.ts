describe('Next.js API proxy', () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    jest.resetModules();
  });

  it('forwards API paths to the configured backend origin', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.cooplumen.test/';
    const config = require('../../../next.config.js');

    await expect(config.rewrites()).resolves.toEqual([
      {
        source: '/api/:path*',
        destination: 'https://api.cooplumen.test/api/:path*',
      },
    ]);
  });
});
