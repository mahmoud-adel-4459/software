import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import { useMemo, type ReactNode } from 'react';
import { buildTheme } from './theme';

/** Nonce injected at build time (index.html meta) so emotion's <style> tags satisfy the CSP. */
function readNonce(): string | undefined {
  return document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content || undefined;
}

/** Emotion RTL cache + MUI theme + baseline. */
export function ThemeRegistry({ children }: { children: ReactNode }) {
  const nonce = useMemo(readNonce, []);
  const cache = useMemo(() => createCache({ key: 'muirtl', nonce, stylisPlugins: [prefixer, rtlPlugin] }), [nonce]);
  const theme = useMemo(buildTheme, []);
  return (
    <CacheProvider value={cache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
}
