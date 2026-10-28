import { describe, expect, it } from 'vitest';
import type { Session } from '@/api/types';
import { canOpen, homePath, navSections } from '@/auth/nav';

const s = (role: Session['user']['role'], kind: Session['kind']): Session => ({
  user: { name: 'x', username: 'x', role },
  kind,
  installation: 'i',
});
const keys = (session: Session) => navSections(session).flatMap((g) => g.items.map((i) => i.key));

describe('nav visibility by role and device kind', () => {
  it('internal admin sees everything', () => {
    expect(keys(s('admin', 'internal'))).toEqual([
      'dashboard', 'soldiers', 'new', 'visitors', 'visitor-passes', 'canteen', 'buffet', 'fitness', 'gate', 'movements',
      'report-center', 'daily-report', 'reports', 'printing', 'settings', 'users', 'backups', 'import', 'audit',
    ]);
  });
  it('clerk sees only canteen, buffet and reports', () => {
    expect(keys(s('clerk', 'internal'))).toEqual(['canteen', 'buffet', 'reports']);
    expect(canOpen(s('clerk', 'internal'), '/users')).toBe(false);
    expect(homePath(s('clerk', 'internal'))).toBe('/canteen');
  });
  it('gate role and gate devices (even admin) only get the gate screens', () => {
    expect(keys(s('gate', 'internal'))).toEqual(['gate', 'gate-visitors', 'movements']);
    expect(keys(s('admin', 'gate'))).toEqual(['gate', 'gate-visitors', 'movements']);
    expect(canOpen(s('gate', 'internal'), '/visitor-passes')).toBe(false);
    expect(canOpen(s('admin', 'gate'), '/soldiers')).toBe(false);
    expect(homePath(s('admin', 'gate'))).toBe('/gate');
  });
  it('admin home is the dashboard', () => {
    expect(homePath(s('admin', 'internal'))).toBe('/');
  });
  it('soldier sub pages are admin-only', () => {
    expect(canOpen(s('admin', 'internal'), '/soldiers/abc/edit')).toBe(true);
    expect(canOpen(s('clerk', 'internal'), '/soldiers/abc')).toBe(false);
  });
});
