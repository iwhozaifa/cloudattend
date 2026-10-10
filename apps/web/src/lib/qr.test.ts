import { describe, expect, it } from 'vitest';
import { extractToken } from './qr';

describe('extractToken', () => {
  it.each([
    ['abc_DEF-1.sig_2-x', 'abc_DEF-1.sig_2-x'],
    ['  abc.def  ', 'abc.def'],
    ['https://attend.example.edu/check-in?token=abc.def', 'abc.def'],
    ['http://127.0.0.1:4173/check-in?token=abc.def&utm=1', 'abc.def'],
    ['https://evil.example/phish?token=abc.def', undefined],
    ['https://attend.example.edu/check-in?token=<script>', undefined],
    ['javascript:alert(1)', undefined],
    ['hello world', undefined],
    ['', undefined]
  ])('%j → %j', (input, expected) => expect(extractToken(input)).toBe(expected));
});
