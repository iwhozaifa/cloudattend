import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './return-to';

describe('safeReturnTo', () => {
  it.each([
    ['/courses/abc?tab=roster', '/courses/abc?tab=roster'],
    ['/check-in?token=a.b', '/check-in?token=a.b'],
    [null, '/'], ['', '/'],
    ['https://evil.example/phish', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['javascript:alert(1)', '/'],
    ['evil', '/'],
    ['/sign-in?returnTo=/x', '/'],
    ['/%2F%2Fevil.example', '/%2F%2Fevil.example']
  ])('%j → %j', (input, expected) => expect(safeReturnTo(input)).toBe(expected));
});
