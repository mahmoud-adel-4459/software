import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

configure({ asyncUtilTimeout: 10000 });

afterEach(() => {
  cleanup();
  delete window.desktop;
  try {
    sessionStorage.clear();
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

// jsdom lacks these browser APIs used by MUI / x-charts / motion.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver ??= RO;
window.matchMedia ??= ((query: string) => ({ matches: query.includes('min-width'), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
window.scrollTo = () => {};

// jsdom's cssstyle throws on `border: 1px solid var(--x)` shorthands (used by MUI DataGrid) inside getComputedStyle.
const realComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
  try {
    return realComputedStyle(el, pseudo);
  } catch {
    return realComputedStyle(document.createElement('div'));
  }
}) as typeof window.getComputedStyle;
