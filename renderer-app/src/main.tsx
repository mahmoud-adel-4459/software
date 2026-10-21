import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'react-toastify/dist/ReactToastify.css';
import './styles/fonts.css';
import './styles/global.css';
import { App } from './App';

async function start() {
  // Development-only bridge so pages can be viewed in a regular browser (tree-shaken from production).
  if (__DEV_MOCK__ && !window.desktop) {
    const { installMockDesktop } = await import('./dev/mockDesktop');
    installMockDesktop();
  }
  document.documentElement.lang = 'ar';
  document.documentElement.dir = 'rtl';
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
void start();
