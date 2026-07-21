import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('mobile viewport and pinch-zoom policy', () => {
  it('keeps browser pinch zoom enabled and never disables touch zoom in a content region', () => {
    const html = source('index.html');
    const css = source('src/index.css');

    expect(html).toContain('user-scalable=yes');
    expect(html).toContain('maximum-scale=5.0');
    expect(css).not.toMatch(/touch-action\s*:\s*none/i);
    expect(css).toMatch(/html, body, #root[\s\S]*?touch-action:\s*pan-y pinch-zoom/);
    expect(css).toMatch(/\.login-screen-scroll,[\s\S]*?\[data-testid="admin-scroll-container"\][\s\S]*?touch-action:\s*pan-y pinch-zoom/);
    expect(css).toMatch(/\.browser-mobile > main[\s\S]*?touch-action:\s*pan-y pinch-zoom/);
    expect(css).toMatch(/\.browser-mobile article,[\s\S]*?\.browser-mobile \[role="dialog"\],[\s\S]*?touch-action:\s*pan-x pan-y pinch-zoom/);
  });

  it('does not restore the old forced 16px rule on every mobile input', () => {
    const css = source('src/index.css');
    const mobileFields = css.match(/\.browser-mobile input,\s*\n\s*\.browser-mobile textarea,\s*\n\s*\.browser-mobile select\s*\{([^}]*)\}/)?.[1] || '';

    expect(mobileFields).not.toMatch(/font-size\s*:\s*16px/i);
    expect(css).toContain(":root[data-ui-font-scale='small']");
    expect(css).toContain(":root[data-ui-font-scale='large']");
  });
});
