import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, get, onUnauthorized, post, qs } from '@/api/client';
import { createFakeDesktop } from '@/dev/mockDesktop';

afterEach(() => {
  delete window.desktop;
});

describe('api client', () => {
  it('throws ApiError with the Arabic server message and status', async () => {
    window.desktop = createFakeDesktop({ failures: { 'GET /api/summary': { status: 409, error: 'تعارض في البيانات' } } });
    await expect(get('/api/summary')).rejects.toMatchObject({ name: 'ApiError', message: 'تعارض في البيانات', status: 409 });
  });

  it('notifies listeners on 401 so auth can be cleared', async () => {
    window.desktop = createFakeDesktop({ failures: { 'GET /api/permits': { status: 401, error: 'انتهت الجلسة' } } });
    const fn = vi.fn();
    const off = onUnauthorized(fn);
    await expect(get('/api/permits')).rejects.toBeInstanceOf(ApiError);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });

  it('generates a request id for every POST and keeps an explicit one', async () => {
    const fake = createFakeDesktop();
    window.desktop = fake;
    await post('/api/visitors', { name: 'a' });
    await post('/api/visitors', { name: 'a' }, 'fixed-id');
    expect(fake.calls[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(fake.calls[1].requestId).toBe('fixed-id');
  });

  it('fails clearly outside the desktop app', async () => {
    await expect(get('/api/summary')).rejects.toThrow(/سطح المكتب/);
  });

  it('builds query strings without empty values', () => {
    expect(qs({ a: 1, b: '', c: undefined, d: 'x y' })).toBe('?a=1&d=x+y');
  });
});
