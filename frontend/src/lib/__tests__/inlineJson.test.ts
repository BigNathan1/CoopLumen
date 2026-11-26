import { inlineJson } from '../inlineJson';

describe('inlineJson', () => {
  it('serialises like JSON.stringify for ordinary values', () => {
    expect(inlineJson('cooplumen-theme')).toBe('"cooplumen-theme"');
    expect(inlineJson(['ar', 'he'])).toBe('["ar","he"]');
  });

  it('escapes < so a value cannot close the script tag', () => {
    const out = inlineJson('</script><img src=x onerror=alert(1)>');
    expect(out).not.toContain('<');
    expect(JSON.parse(out)).toBe('</script><img src=x onerror=alert(1)>');
  });
});
