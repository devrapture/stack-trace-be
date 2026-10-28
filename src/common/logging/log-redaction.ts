export const LOG_REDACTION_PATHS = Object.freeze([]);

export function sanitizeRequestUrl(
  url: string | undefined,
): string | undefined {
  if (!url) return url;

  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}
