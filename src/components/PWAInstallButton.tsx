import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Laptop,
  Package,
  Share,
  Smartphone,
  X,
} from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../lib/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showAppModal, setShowAppModal] = useState(false);
  const [copied, setCopied] = useState(false);

  if (isInstalled) {
    return null;
  }

  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://vexora.app';

  const handlePrimaryClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (ok) return;
    }
    setShowAppModal(true);
  };

  const handleCopyUrl = () => {
    void navigator.clipboard?.writeText(currentOrigin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handlePrimaryClick()}
        title="Install Vexora as a standalone app (No code required)"
        className={`inline-flex items-center gap-1.5 rounded-lg font-semibold text-white cursor-pointer whitespace-nowrap transition-opacity hover:opacity-95 ${
          compact ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-2 text-xs'
        }`}
        style={{ background: 'var(--grad-soft)' }}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>{isInstallable ? 'Install App' : 'Get App'}</span>
      </button>

      {showAppModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4"
          onClick={() => setShowAppModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[var(--line2)] bg-[var(--panel)] text-[var(--fg)] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--line)]">
              <div className="flex items-center gap-2.5">
                <img src="/assets/logo-128.png" alt="Vexora" className="w-6 h-6 object-contain" />
                <div>
                  <h2 className="text-sm font-semibold">Make Vexora an App (Zero Code)</h2>
                  <p className="text-[11px] text-[var(--fg3)]">
                    No coding tools required — install or generate store builds directly
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAppModal(false)}
                className="p-1.5 rounded-lg text-[var(--fg3)] hover:text-[var(--fg)] hover:bg-[var(--hover2)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="p-6 space-y-4 text-xs">
              {isInstallable && (
                <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-emerald-400">
                      1-Click Native Install Ready
                    </div>
                    <div className="text-[var(--fg2)] mt-0.5">
                      Installs Vexora directly onto your desktop or phone home screen.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void install()}
                    className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shrink-0 cursor-pointer"
                  >
                    Install Now
                  </button>
                </div>
              )}

              <div className="rounded-xl border border-[var(--line)] bg-[var(--bg2)] p-4 space-y-2">
                <div className="font-semibold flex items-center gap-2 text-[var(--fg)]">
                  <Laptop className="w-4 h-4 text-[var(--a1)]" />
                  1. Instant Desktop & Android App (1 Click, No Store Needed)
                </div>
                <p className="text-[var(--fg2)] leading-relaxed">
                  Vexora already has a verified Web App Manifest & Service Worker installed. Open your deployed Vexora URL in Chrome/Edge and click the{' '}
                  <strong className="text-[var(--fg)]">Install icon</strong> in the browser bar (or menu {'->'} <strong className="text-[var(--fg)]">Install Vexora</strong>), or on macOS Safari click <strong className="text-[var(--fg)]">File {'->'} Add to Dock</strong>.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-[var(--bg2)] p-4 space-y-2">
                <div className="font-semibold flex items-center gap-2 text-[var(--fg)]">
                  <Share className="w-4 h-4 text-[var(--a1)]" />
                  2. iPhone / iPad App {isIOS ? '(Detected)' : ''}
                </div>
                <p className="text-[var(--fg2)] leading-relaxed">
                  Open Vexora in Safari, tap the <strong className="text-[var(--fg)]">Share</strong> button at the bottom, then choose <strong className="text-[var(--fg)]">Add to Home Screen</strong>. It launches fullscreen without Safari bars.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-[var(--bg2)] p-4 space-y-2.5">
                <div className="font-semibold flex items-center gap-2 text-[var(--fg)]">
                  <Package className="w-4 h-4 text-[var(--a1)]" />
                  3. No-Code APK / Google Play / Windows Store Package
                </div>
                <p className="text-[var(--fg2)] leading-relaxed">
                  Want a downloadable <strong className="text-[var(--fg)]">.APK</strong>, <strong className="text-[var(--fg)]">.AAB</strong>, or <strong className="text-[var(--fg)]">Windows .MSIX</strong> installer without touching code? Deploy/share your app URL, copy it below, and paste it into <strong className="text-[var(--fg)]">PWABuilder.com</strong> to generate signed store packages automatically:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={currentOrigin}
                    className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--fg2)]"
                  />
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--line2)] bg-[var(--panel)] px-3 py-1.5 font-medium hover:bg-[var(--hover2)] cursor-pointer shrink-0"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy URL'}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 text-[11px] text-[var(--fg3)]">
                <span className="inline-flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5" />
                  Manifest & Service Worker Active
                </span>
                <button
                  type="button"
                  onClick={() => setShowAppModal(false)}
                  className="rounded-lg border border-[var(--line2)] px-4 py-1.5 text-xs font-medium text-[var(--fg)] hover:bg-[var(--hover2)] cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/95 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
      Offline Mode — Local encrypted vault & cached tabs active.
    </div>
  );
};
