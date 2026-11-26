import manifest from '@/app/manifest';

describe('PWA manifest', () => {
  const result = manifest();

  it('names the app and starts at the root', () => {
    expect(result.name).toContain('CoopLumen');
    expect(result.short_name).toBe('CoopLumen');
    expect(result.start_url).toBe('/');
  });

  it('opens as a standalone app', () => {
    expect(result.display).toBe('standalone');
    expect(result.theme_color).toBeDefined();
    expect(result.background_color).toBeDefined();
  });

  it('ships the 192px and 512px icons browsers require to install', () => {
    const icons = result.icons ?? [];
    const sizes = icons.map((icon) => icon.sizes);

    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });
});
