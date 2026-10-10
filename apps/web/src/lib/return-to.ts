/**
 * Only same-origin, absolute paths are allowed as post-login destinations. Anything else
 * (`https://evil`, `//evil`, `/\evil`, `javascript:`) falls back to the dashboard.
 */
export function safeReturnTo(value: string | null | undefined, fallback = '/') {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  try {
    const url = new URL(value, 'https://cloudattend.invalid');
    if (url.origin !== 'https://cloudattend.invalid') return fallback;
    if (/^\/(sign-in|sign-up|forgot-password)\b/.test(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
