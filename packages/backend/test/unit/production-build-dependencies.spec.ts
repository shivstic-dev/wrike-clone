import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('production backend build dependencies', () => {
  it('installs every declaration package required by the Railway build', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };

    expect(packageJson.dependencies).toEqual(expect.objectContaining({
      '@types/compression': expect.any(String),
      '@types/cookie-parser': expect.any(String),
      '@types/express': expect.any(String),
      '@types/passport': expect.any(String),
      '@types/pdfkit': expect.any(String),
    }));
  });
});
