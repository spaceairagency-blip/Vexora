import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { initVexoraUpdateWatcher } from './lib/swUpdate.ts';
import './index.css';

let isInsideProxyViewport = false;
try {
  isInsideProxyViewport =
    window.frameElement?.getAttribute('data-vx-viewport') === '1';
} catch {
  isInsideProxyViewport = false;
}

if (isInsideProxyViewport) {
  createRoot(document.getElementById('root')!).render(
    <div className="min-h-screen flex items-center justify-center bg-[#080b14] text-[#e8eeff] p-6 text-center font-sans">
      <div className="max-w-md rounded-2xl border border-white/10 bg-[#0e1424] p-6 space-y-2">
        <h1 className="text-base font-semibold">Navigation stayed inside proxy sandbox</h1>
        <p className="text-xs text-[#9aa7cc]">
          This site attempted a relative root navigation outside the proxy frame. Use the Original button above to open the site directly if needed.
        </p>
      </div>
    </div>
  );
} else {
  initVexoraUpdateWatcher();
  createRoot(document.getElementById('root')!).render(<App />);
}
