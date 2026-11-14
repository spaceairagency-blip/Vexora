import React, { useState } from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';
import { useVexoraUpdate } from '../lib/swUpdate';

export const ToolbarUpdateButton: React.FC = () => {
  const { updateAvailable, isUpdating, applyUpdate } = useVexoraUpdate();

  if (!updateAvailable) return null;

  return (
    <button
      type="button"
      disabled={isUpdating}
      onClick={() => void applyUpdate()}
      title="A new version of Vexora is ready — click to update"
      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-60 cursor-pointer whitespace-nowrap"
    >
      <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isUpdating ? 'animate-spin' : ''}`} />
      <span>{isUpdating ? 'Updating...' : 'Update'}</span>
    </button>
  );
};

export const BrowserUpdateBanner: React.FC = () => {
  const { updateAvailable, isUpdating, applyUpdate } = useVexoraUpdate();
  const [dismissed, setDismissed] = useState(false);

  if (!updateAvailable || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-emerald-400/40 bg-[var(--panel)]/95 backdrop-blur-md p-4 text-[var(--fg)] shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-[var(--fg)]">
              Vexora Update Available
            </h3>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss update notification"
              className="p-0.5 rounded text-[var(--fg3)] hover:text-[var(--fg)] hover:bg-[var(--hover2)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--fg2)]">
            A newer build of Vexora Browser is ready. Click update to apply the latest fixes and features.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => void applyUpdate()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-60"
              style={{ background: 'var(--grad-soft)' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
              <span>{isUpdating ? 'Updating Browser...' : 'Update Browser'}</span>
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded-lg border border-[var(--line2)] px-3 py-1.5 text-xs font-medium text-[var(--fg2)] hover:text-[var(--fg)] hover:bg-[var(--hover2)] cursor-pointer"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
