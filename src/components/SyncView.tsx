import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  Laptop,
  Lock,
  RefreshCw,
  Smartphone,
  Upload,
} from 'lucide-react';
import { decryptJson, encryptJson } from '../lib/crypto';
import type {
  BookmarkItem,
  BrowserStats,
  BrowserTab,
  EncryptedBundle,
  IndexedDocument,
  SpeedTile,
} from '../types/browser';

interface SyncViewProps {
  tabs: BrowserTab[];
  bookmarks: BookmarkItem[];
  documents: IndexedDocument[];
  speedTiles: SpeedTile[];
  notes: string;
  stats: BrowserStats;
  onImportSyncedState: (payload: {
    bookmarks?: BookmarkItem[];
    documents?: IndexedDocument[];
    speedTiles?: SpeedTile[];
    notes?: string;
  }) => Promise<void>;
}

interface SyncPayload {
  bookmarks: BookmarkItem[];
  documentsCount: number;
  documents: IndexedDocument[];
  speedTiles: SpeedTile[];
  notes: string;
  tabSummary: Array<{ title: string; url: string; groupId: string }>;
  statsSnapshot: BrowserStats;
  exportedAt: string;
}

export const SyncView: React.FC<SyncViewProps> = ({
  tabs,
  bookmarks,
  documents,
  speedTiles,
  notes,
  stats,
  onImportSyncedState,
}) => {
  const [vaultId, setVaultId] = useState('vexora-vault-alpha');
  const [passphrase, setPassphrase] = useState('vexora-zero-knowledge-key');
  const [deviceLabel, setDeviceLabel] = useState('Vexora Desktop');

  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastCipherPreview, setLastCipherPreview] = useState<EncryptedBundle | null>(null);
  const [secondDeviceDecrypted, setSecondDeviceDecrypted] = useState<SyncPayload | null>(null);

  const buildPayload = (): SyncPayload => ({
    bookmarks,
    documentsCount: documents.length,
    documents,
    speedTiles,
    notes,
    tabSummary: tabs.map((t) => ({
      title: t.title,
      url: t.url || 'vexora://newtab',
      groupId: t.groupId,
    })),
    statsSnapshot: stats,
    exportedAt: new Date().toISOString(),
  });

  const handlePushSync = async () => {
    if (passphrase.trim().length < 6) {
      setErrorMsg('Use a sync passphrase of at least 6 characters.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const encrypted = await encryptJson(buildPayload(), passphrase);
      setLastCipherPreview(encrypted);

      const res = await fetch(`/api/sync/${encodeURIComponent(vaultId.trim())}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...encrypted, deviceLabel }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Sync upload failed.');
      setStatusMsg(
        `Encrypted ${json.byteLength} bytes locally and pushed ciphertext to relay (${json.updatedAt}).`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to push encrypted sync.');
    } finally {
      setBusy(false);
    }
  };

  const handlePullSync = async (applyToCurrentDevice: boolean) => {
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/sync/${encodeURIComponent(vaultId.trim())}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to retrieve encrypted vault.');

      const bundle: EncryptedBundle = {
        salt: json.salt,
        iv: json.iv,
        ciphertext: json.ciphertext,
        algorithm: json.algorithm || 'AES-256-GCM',
        createdAt: json.updatedAt,
      };
      setLastCipherPreview(bundle);

      const decrypted = await decryptJson<SyncPayload>(bundle, passphrase);
      setSecondDeviceDecrypted(decrypted);

      if (applyToCurrentDevice) {
        await onImportSyncedState({
          bookmarks: decrypted.bookmarks,
          documents: decrypted.documents,
          speedTiles: decrypted.speedTiles,
          notes: decrypted.notes,
        });
        setStatusMsg(
          `Pulled & decrypted ${decrypted.bookmarks.length} bookmarks and ${decrypted.documentsCount} encrypted search records.`
        );
      } else {
        setStatusMsg(
          `Simulated Secondary Device successfully decrypted ciphertext from "${json.deviceLabel}".`
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sync pull or decryption failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleExportSnapshot = async () => {
    const encrypted = await encryptJson(buildPayload(), passphrase);
    const blob = new Blob([JSON.stringify(encrypted, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${vaultId || 'vexora'}.vexora-sync.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-full bg-[var(--bg)] text-[var(--fg)] px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
          <div className="flex items-center gap-3">
            <img
              src="/assets/logo-128.png"
              alt="Vexora"
              className="w-10 h-10 object-contain"
            />
            <div>
              <h1 className="text-2xl font-semibold">Vexora Zero-Knowledge Sync</h1>
              <p className="mt-0.5 text-xs text-[var(--fg2)]">
                Client-side PBKDF2 + AES-256-GCM encryption · Relay only stores opaque ciphertext
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportSnapshot}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line2)] bg-[var(--panel)] px-3.5 py-2 text-xs font-medium text-[var(--fg)] hover:bg-[var(--hover2)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export .vexora-sync File
          </button>
        </div>

        {statusMsg && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-400">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Laptop className="w-4 h-4 text-[var(--a1)]" />
              Primary Device Vault Configuration
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--fg2)] mb-1">
                  Sync Vault Identifier
                </label>
                <input
                  type="text"
                  value={vaultId}
                  onChange={(e) => setVaultId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-3 py-2 text-xs font-mono text-[var(--fg)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--fg2)] mb-1">
                  Client-Side Encryption Passphrase (Never leaves device)
                </label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-3 py-2 text-xs font-mono text-[var(--fg)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--fg2)] mb-1">
                  Device Label
                </label>
                <input
                  type="text"
                  value={deviceLabel}
                  onChange={(e) => setDeviceLabel(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-3 py-2 text-xs text-[var(--fg)]"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={handlePushSync}
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 whitespace-nowrap cursor-pointer"
                style={{ background: 'var(--grad-soft)' }}
              >
                <Upload className="w-3.5 h-3.5" />
                Encrypt & Push to Relay
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handlePullSync(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line2)] px-4 py-2 text-xs font-medium text-[var(--fg)] hover:bg-[var(--hover2)] whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Pull & Merge Vault
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                Secondary Device Pull Simulator
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => handlePullSync(false)}
                className="rounded-lg border border-[var(--line2)] bg-[var(--hover2)] px-3 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer"
              >
                Test Second Device Pull
              </button>
            </div>

            <p className="text-xs text-[var(--fg2)] leading-relaxed">
              Push your encrypted Vexora state from the left panel, then verify that a paired device can pull the relay ciphertext and decrypt tabs, notes, bookmarks, and search index locally.
            </p>

            {secondDeviceDecrypted ? (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--bg2)] p-4 space-y-2 text-xs">
                <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Decrypted Snapshot Received
                </div>
                <div className="text-[var(--fg2)] tabular-nums">
                  {secondDeviceDecrypted.tabSummary.length} tabs ·{' '}
                  {secondDeviceDecrypted.bookmarks.length} bookmarks ·{' '}
                  {secondDeviceDecrypted.documentsCount} encrypted search docs
                </div>
                <div className="space-y-1 pt-1">
                  {secondDeviceDecrypted.tabSummary.slice(0, 4).map((t, i) => (
                    <div key={i} className="font-mono text-[11px] text-[var(--fg3)] truncate">
                      [{t.groupId}] {t.title} — {t.url}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--line2)] p-6 text-center text-xs text-[var(--fg3)]">
                Push an encrypted snapshot, then click "Test Second Device Pull".
              </div>
            )}
          </div>
        </div>

        {lastCipherPreview && (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-2">
            <div className="text-xs font-semibold">
              Relay Wire Payload (Server stores zero plaintext)
            </div>
            <pre className="rounded-lg bg-black/60 text-slate-300 p-3 text-xs font-mono overflow-x-auto">
              {JSON.stringify(
                {
                  vaultId,
                  algorithm: lastCipherPreview.algorithm,
                  salt: lastCipherPreview.salt,
                  iv: lastCipherPreview.iv,
                  ciphertext: `${lastCipherPreview.ciphertext.slice(0, 180)}...`,
                },
                null,
                2
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
