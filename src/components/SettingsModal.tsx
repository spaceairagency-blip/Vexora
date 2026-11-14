import React, { useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useVexoraUpdate } from '../lib/swUpdate';
import { PWAInstallButton } from './PWAInstallButton';
import type {
  VexoraAccent,
  VexoraSettings,
  VexoraTheme,
  VexoraWallpaper,
} from '../types/browser';

interface SettingsModalProps {
  open: boolean;
  settings: VexoraSettings;
  statsSummary: {
    bookmarks: number;
    history: number;
    reading: number;
    blocked: number;
    indexedDocs: number;
  };
  onClose: () => void;
  onUpdateSettings: (patch: Partial<VexoraSettings>) => void;
  onClearHistory: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onResetAll: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  settings,
  statsSummary,
  onClose,
  onUpdateSettings,
  onClearHistory,
  onExportBackup,
  onImportBackup,
  onResetAll,
}) => {
  const [pane, setPane] = useState<'appearance' | 'privacy' | 'data' | 'about'>('appearance');
  const { updateAvailable, isUpdating, applyUpdate, checkForUpdates } = useVexoraUpdate();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateCheckNote, setUpdateCheckNote] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl h-[540px] rounded-2xl border border-[var(--line2)] bg-[var(--panel)] text-[var(--fg)] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--line)]">
          <h2 className="text-base font-semibold">Vexora Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--fg3)] hover:text-[var(--fg)] hover:bg-[var(--hover2)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 flex min-h-0">
          <nav className="w-44 shrink-0 border-r border-[var(--line)] p-3 space-y-1">
            {(
              [
                ['appearance', 'Appearance'],
                ['privacy', 'Privacy & Shield'],
                ['data', 'Your Data'],
                ['about', 'About Vexora'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPane(id)}
                className={`w-full text-left rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  pane === id
                    ? 'bg-[var(--hover2)] text-[var(--a1)]'
                    : 'text-[var(--fg2)] hover:bg-[var(--hover)]'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
            {pane === 'appearance' && (
              <>
                <div>
                  <h3 className="text-xs font-semibold text-[var(--fg3)] mb-3">Theme</h3>
                  <div className="flex flex-wrap gap-3">
                    {(
                      [
                        ['midnight', 'Midnight', '#141c33'],
                        ['abyss', 'Abyss OLED', '#000000'],
                        ['daylight', 'Daylight', '#eef2fb'],
                      ] as Array<[VexoraTheme, string, string]>
                    ).map(([id, label, color]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onUpdateSettings({ theme: id })}
                        className={`w-24 rounded-xl border p-2 text-center cursor-pointer ${
                          settings.theme === id
                            ? 'border-[var(--a1)] text-[var(--fg)]'
                            : 'border-[var(--line)] text-[var(--fg2)]'
                        }`}
                      >
                        <div
                          className="h-9 rounded-lg mb-1.5 border border-white/10"
                          style={{ background: color }}
                        />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-[var(--fg3)] mb-3">Accent Palette</h3>
                  <div className="flex flex-wrap gap-3">
                    {(
                      [
                        ['vexora', 'Vexora', 'linear-gradient(135deg,#19e3ff,#a23dff)'],
                        ['sunset', 'Sunset', 'linear-gradient(135deg,#ffb347,#d63384)'],
                        ['mint', 'Mint', 'linear-gradient(135deg,#7dffb2,#2a9dff)'],
                        ['rose', 'Rose', 'linear-gradient(135deg,#ff9ad5,#c13cff)'],
                        ['mono', 'Mono', 'linear-gradient(135deg,#e8eeff,#7f8cb8)'],
                      ] as Array<[VexoraAccent, string, string]>
                    ).map(([id, label, grad]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onUpdateSettings({ accent: id })}
                        className={`w-20 rounded-xl border p-2 text-center cursor-pointer ${
                          settings.accent === id
                            ? 'border-[var(--a1)] text-[var(--fg)]'
                            : 'border-[var(--line)] text-[var(--fg2)]'
                        }`}
                      >
                        <div className="h-8 rounded-lg mb-1.5" style={{ background: grad }} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-[var(--fg3)] mb-3">
                    Start Page Wallpaper
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {(['aurora', 'ocean', 'grid', 'none'] as VexoraWallpaper[]).map((wp) => (
                      <button
                        key={wp}
                        type="button"
                        onClick={() => onUpdateSettings({ wallpaper: wp })}
                        className={`rounded-lg border px-3 py-1.5 capitalize cursor-pointer ${
                          settings.wallpaper === wp
                            ? 'border-[var(--a1)] bg-[var(--hover2)] text-[var(--fg)]'
                            : 'border-[var(--line)] text-[var(--fg2)]'
                        }`}
                      >
                        {wp}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 border-t border-[var(--line)] pt-4">
                  {(
                    [
                      ['bmbar', 'Show bookmarks bar', 'Quick access ribbon below address bar'],
                      ['tiles', 'Show speed-dial shortcuts', 'Editable site tiles on the start page'],
                      ['cards', 'Show stats cards', 'Trackers blocked, RAM saved, and pages visited'],
                      ['clock24', '24-hour clock', 'Start page time display format'],
                    ] as const
                  ).map(([key, label, hint]) => (
                    <div key={key} className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-[var(--fg)]">{label}</div>
                        <div className="text-[var(--fg3)]">{hint}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onUpdateSettings({ [key]: !settings[key] })}
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold cursor-pointer ${
                          settings[key]
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-[var(--hover2)] text-[var(--fg3)] border border-[var(--line)]'
                        }`}
                      >
                        {settings[key] ? 'On' : 'Off'}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {pane === 'privacy' && (
              <div className="space-y-4">
                {(
                  [
                    ['shield', 'Vexora Shield', 'Block 80+ ad & tracker domains inside proxied pages'],
                    ['httpsFirst', 'HTTPS-First Mode', 'Upgrade insecure connections automatically'],
                    ['fingerprintDefense', 'Fingerprint Noise', 'Randomize Canvas/WebGL readout vectors'],
                    ['darkPages', 'Force Dark Mode on Pages', 'Invert bright sites while preserving images'],
                    [
                      'enableContextualSponsors',
                      'Opt-In Contextual Sponsors',
                      'Preview privacy-safe keyword-only sponsor cards (zero tracking)',
                    ],
                  ] as const
                ).map(([key, label, hint]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-3"
                  >
                    <div>
                      <div className="font-semibold text-[var(--fg)]">{label}</div>
                      <div className="text-[var(--fg3)]">{hint}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onUpdateSettings({ [key]: !settings[key] })}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold cursor-pointer ${
                        settings[key]
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-[var(--hover2)] text-[var(--fg3)] border border-[var(--line)]'
                      }`}
                    >
                      {settings[key] ? 'On' : 'Off'}
                    </button>
                  </div>
                ))}

                <div className="pt-2 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-[var(--fg)]">Clear Browsing History</div>
                    <div className="text-[var(--fg3)]">
                      {statsSummary.history} entries stored locally
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClearHistory}
                    className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-red-400 font-medium cursor-pointer"
                  >
                    Clear History
                  </button>
                </div>
              </div>
            )}

            {pane === 'data' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
                  <div>
                    <div className="font-semibold text-[var(--fg)]">Export Vexora Backup</div>
                    <div className="text-[var(--fg3)]">
                      Download bookmarks, history, notes, reading list, and settings as JSON
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onExportBackup}
                    className="rounded-lg border border-[var(--line2)] bg-[var(--hover2)] px-3.5 py-2 font-medium cursor-pointer"
                  >
                    Export JSON
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
                  <div>
                    <div className="font-semibold text-[var(--fg)]">Restore Backup</div>
                    <div className="text-[var(--fg3)]">Import a previously exported Vexora JSON file</div>
                  </div>
                  <label className="rounded-lg border border-[var(--line2)] bg-[var(--hover2)] px-3.5 py-2 font-medium cursor-pointer">
                    Choose File
                    <input
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onImportBackup(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between py-1 border-b border-[var(--line)]">
                    <span className="text-[var(--fg2)]">Encrypted Search Documents</span>
                    <span className="font-mono tabular-nums">{statsSummary.indexedDocs}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[var(--line)]">
                    <span className="text-[var(--fg2)]">Bookmarks</span>
                    <span className="font-mono tabular-nums">{statsSummary.bookmarks}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[var(--line)]">
                    <span className="text-[var(--fg2)]">Reading List</span>
                    <span className="font-mono tabular-nums">{statsSummary.reading}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[var(--line)]">
                    <span className="text-[var(--fg2)]">Trackers Blocked</span>
                    <span className="font-mono tabular-nums">{statsSummary.blocked}</span>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={onResetAll}
                    className="rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2 text-red-400 font-medium cursor-pointer"
                  >
                    Reset Vexora to Defaults
                  </button>
                </div>
              </div>
            )}

            {pane === 'about' && (
              <div className="text-center py-6 space-y-3">
                <img
                  src="/assets/logo-full.png"
                  alt="Vexora"
                  className="w-40 mx-auto vx-logo-bob"
                />
                <h3 className="text-xl font-extrabold tracking-[0.28em] vx-grad-text">
                  VEXORA
                </h3>
                <p className="text-[var(--fg2)]">
                  Version 2.0 · Sandboxed Proxy Engine + Locally Encrypted Search + Gemini AI Shield
                </p>
                <div className="max-w-sm mx-auto pt-4 text-left space-y-2">
                  <div className="flex justify-between py-1 border-b border-[var(--line)]">
                    <span className="text-[var(--fg3)]">Proxy Engine</span>
                    <span className="font-mono">Express + Opaque Sandbox</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[var(--line)]">
                    <span className="text-[var(--fg3)]">Search Encryption</span>
                    <span className="font-mono">PBKDF2 + AES-256-GCM</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[var(--line)]">
                    <span className="text-[var(--fg3)]">AI Ad Classifier</span>
                    <span className="font-mono">Gemini Server Pipeline</span>
                  </div>
                </div>
                <div className="pt-4 flex flex-wrap items-center justify-center gap-2.5">
                  <PWAInstallButton />
                  {updateAvailable ? (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => void applyUpdate()}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white cursor-pointer disabled:opacity-60"
                      style={{ background: 'var(--grad-soft)' }}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
                      <span>{isUpdating ? 'Updating Browser...' : 'Update Browser'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={checkingUpdate}
                      onClick={async () => {
                        setCheckingUpdate(true);
                        setUpdateCheckNote(null);
                        const found = await checkForUpdates();
                        setCheckingUpdate(false);
                        setUpdateCheckNote(
                          found
                            ? 'New version ready — click Update Browser.'
                            : 'Vexora is up to date.'
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line2)] bg-[var(--hover2)] px-3.5 py-2 text-xs font-medium text-[var(--fg)] hover:border-[var(--a1)] cursor-pointer disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                      <span>{checkingUpdate ? 'Checking...' : 'Check for Updates'}</span>
                    </button>
                  )}
                </div>
                {updateCheckNote && !updateAvailable && (
                  <p className="text-[11px] text-[var(--fg3)]">{updateCheckNote}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
