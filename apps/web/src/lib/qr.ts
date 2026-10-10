const TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Extracts a CloudAttend check-in token from scanned or pasted text: either a raw token or a
 * `/check-in?token=…` link. The link itself is never followed, so a hostile QR code cannot
 * redirect the student anywhere.
 */
export function extractToken(text: string): string | undefined {
  const value = text.trim();
  if (TOKEN.test(value)) return value;
  try {
    const url = new URL(value);
    const token = url.searchParams.get('token') ?? '';
    return url.pathname.endsWith('/check-in') && TOKEN.test(token) ? token : undefined;
  } catch {
    return undefined;
  }
}
