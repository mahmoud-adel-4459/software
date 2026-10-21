import { useCallback, useState } from 'react';

export interface ListState<F extends object> {
  page: number;
  pageSize: number;
  q: string;
  filters: F;
}

/** Page/size/search/filters state; any filter or search change returns to page 0. */
export function useListState<F extends object>(initial: F, pageSize = 20) {
  const [state, setState] = useState<ListState<F>>({ page: 0, pageSize, q: '', filters: initial });
  const setQ = useCallback((q: string) => setState((s) => ({ ...s, q, page: 0 })), []);
  const setFilter = useCallback(
    <K extends keyof F>(key: K, value: F[K]) =>
      setState((s) => ({ ...s, filters: { ...s.filters, [key]: value }, page: 0 })),
    [],
  );
  const setPagination = useCallback((page: number, size: number) => setState((s) => ({ ...s, page, pageSize: size })), []);
  return { ...state, setQ, setFilter, setPagination };
}
