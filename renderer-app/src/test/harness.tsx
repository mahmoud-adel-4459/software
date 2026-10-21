import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { AppRoutes, Providers } from '@/App';
import { createFakeDesktop, type FakeDesktop, type FakeOptions } from '@/dev/mockDesktop';

/** Renders the real routes at `route` with a fake desktop bridge and a signed-in (or signed-out) session. */
export async function renderApp(route: string, options: FakeOptions & { signedOut?: boolean } = {}): Promise<FakeDesktop> {
  const fake = createFakeDesktop(options);
  window.desktop = fake;
  const login = options.signedOut ? null : (await fake.login({ username: 'x', password: 'y' })).data!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } });
  render(
    <Providers client={client} session={login} router={(c) => <MemoryRouter initialEntries={[route]}>{c}</MemoryRouter>}>
      <AppRoutes />
    </Providers>,
  );
  return fake;
}
