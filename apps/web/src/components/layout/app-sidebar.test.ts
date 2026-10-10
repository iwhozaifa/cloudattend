import { describe, expect, it } from 'vitest';
import { admin, student, teacher } from '@/test/render';
import { navigationFor } from './app-sidebar';
import { initials } from './nav-user';

const labels = (me: typeof student) => navigationFor(me).flatMap((group) => group.items.map((item) => item.label));

describe('navigation', () => {
  it('is role aware', () => {
    expect(labels(student)).toEqual(['Dashboard', 'Scan QR code', 'My attendance', 'Settings']);
    expect(labels(teacher)).toEqual(['My courses', 'Settings']);
    expect(labels(admin)).toEqual(['My courses', 'Users & roles', 'Settings']);
  });
  it.each([['Sam Student', 'SS'], ['Cher', 'C'], ['  ', '?'], ['ada lovelace byron', 'AL']])('initials(%j) = %j', (name, expected) => expect(initials(name)).toBe(expected));
});
