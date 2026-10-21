import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { useRef } from 'react';
import { post } from '@/api/client';

/**
 * POST mutation that keeps one request id per distinct payload: retrying the same submission
 * (e.g. after a network failure) reuses the id so the server de-duplicates it; a changed payload
 * or a successful save rotates it.
 */
export function useIdempotentPost<TBody extends object, TRes = unknown>(
  path: string,
  options: Omit<UseMutationOptions<TRes, Error, TBody>, 'mutationFn'> = {},
) {
  const last = useRef<{ key: string; id: string } | null>(null);
  return useMutation<TRes, Error, TBody>({
    ...options,
    mutationFn: (body) => {
      const key = JSON.stringify(body);
      if (!last.current || last.current.key !== key) last.current = { key, id: crypto.randomUUID() };
      return post<TRes>(path, body, last.current.id);
    },
    onSuccess: (data, vars, ctx, meta) => {
      last.current = null;
      return options.onSuccess?.(data, vars, ctx, meta);
    },
  });
}
