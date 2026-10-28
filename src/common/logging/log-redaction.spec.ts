import { sanitizeRequestUrl } from './log-redaction.js';

describe('sanitizeRequestUrl', () => {
  it('removes the query string from a request URL', () => {
    expect(
      sanitizeRequestUrl(
        '/api/v1/oauth/github/callback?code=secret&state=secret-state',
      ),
    ).toBe('/api/v1/oauth/github/callback');
  });

  it('leaves a URL without query parameters unchanged', () => {
    expect(sanitizeRequestUrl('/api/v1/health')).toBe('/api/v1/health');
  });

  it.each([undefined, ''] as const)('preserves an absent URL', (url) => {
    expect(sanitizeRequestUrl(url)).toBe(url);
  });
});
