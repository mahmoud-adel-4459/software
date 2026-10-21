import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { createFakeDesktop } from '@/dev/mockDesktop';
import { useIdempotentPost } from '@/lib/useIdempotentPost';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe('useIdempotentPost', () => {
  it('reuses the request id when retrying the same payload after a failure, rotates on success or change', async () => {
    const fake = createFakeDesktop({ failures: { 'POST /api/fitness': { status: 0, error: 'تعذر الاتصال' } } });
    window.desktop = fake;
    const { result } = renderHook(() => useIdempotentPost<{ v: number }>('/api/fitness'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ v: 1 }).catch(() => {});
    });
    await act(async () => {
      await result.current.mutateAsync({ v: 1 }).catch(() => {});
    });
    expect(fake.calls[1].requestId).toBe(fake.calls[0].requestId);
    await act(async () => {
      await result.current.mutateAsync({ v: 2 }).catch(() => {});
    });
    expect(fake.calls[2].requestId).not.toBe(fake.calls[0].requestId);
    delete fake.failures['POST /api/fitness'];
    await act(async () => {
      await result.current.mutateAsync({ v: 2 });
    });
    const okId = fake.calls[3].requestId;
    await act(async () => {
      await result.current.mutateAsync({ v: 2 });
    });
    expect(fake.calls[4].requestId).not.toBe(okId);
  });
});
