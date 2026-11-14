import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  Eye,
  EyeOff,
  FilePlus2,
  Globe,
  KeyRound,
  Lock,
  Search,
  Trash2,
  Unlock,
} from 'lucide-react';
import { matchContextualSponsor, searchDocuments } from '../lib/searchEngine';
import type { EncryptedBundle, IndexedDocument } from '../types/browser';

interface LiveSearchHit {
  id: string;
  title: string;
  url: string;
  snippet: string;
  domain: string;
  category: string;
}

interface SearchViewProps {
  initialQuery?: string;
  documents: IndexedDocument[];
  encryptedBundle: EncryptedBundle | null;
  isVaultUnlocked: boolean;
  enableContextualSponsors: boolean;
  onUnlockVault: (passphrase: string) => Promise<void>;
  onLockVault: () => void;
  onRekeyVault: (newPassphrase: string) => Promise<void>;
  onAddDocument: (doc: Omit<IndexedDocument, 'id' | 'indexedAt'>) => Promise<void>;
  onRemoveDocument: (id: string) => Promise<void>;
  onOpenUrl: (url: string) => void;
  onSearchExecuted: (query: string) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  initialQuery = '',
  documents,
  encryptedBundle,
  isVaultUnlocked,
  enableContextualSponsors,
  onUnlockVault,
  onLockVault,
  onRekeyVault,
  onAddDocument,
  onRemoveDocument,
  onOpenUrl,
  onSearchExecuted,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [localOnly, setLocalOnly] = useState(false);

  const [webResults, setWebResults] = useState<LiveSearchHit[]>([]);
  const [webLoading, setWebLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [webError, setWebError] = useState<string | null>(null);
  const [webMeta, setWebMeta] = useState<{ elapsedMs: number; privacy: string } | null>(null);

  const [unlockPassphrase, setUnlockPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultNotice, setVaultNotice] = useState<string | null>(null);
  const [showCiphertext, setShowCiphertext] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const [docTitle, setDocTitle] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [docSnippet, setDocSnippet] = useState('');
  const [docKeywords, setDocKeywords] = useState('');

  useEffect(() => {
    if (!webLoading) {
      setLoadingStep(0);
      return;
    }
    const id = setInterval(() => {
      setLoadingStep((s) => (s < 3 ? s + 1 : s));
    }, 240);
    return () => clearInterval(id);
  }, [webLoading]);

  const runLiveWebSearch = useCallback(
    async (q: string) => {
      const clean = q.trim();
      if (!clean || localOnly) {
        setWebResults([]);
        setWebError(null);
        setWebMeta(null);
        return;
      }
      setWebLoading(true);
      setLoadingStep(0);
      setWebError(null);
      const startedAt = Date.now();
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(clean)}`);
        const data = (await res.json()) as {
          results?: LiveSearchHit[];
          elapsedMs?: number;
          privacy?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || 'Search request failed.');
        const minDisplayWait = Math.max(0, 620 - (Date.now() - startedAt));
        if (minDisplayWait > 0) {
          await new Promise((r) => setTimeout(r, minDisplayWait));
        }
        setWebResults(data.results || []);
        setWebMeta({
          elapsedMs: Number(data.elapsedMs || 0),
          privacy: data.privacy || 'Server-stripped zero-cookie crawl',
        });
      } catch (err) {
        setWebError(err instanceof Error ? err.message : 'Unable to run web search.');
        setWebResults([]);
      } finally {
        setWebLoading(false);
      }
    },
    [localOnly]
  );

  // Sync if initialQuery changes (e.g. searching from Start Page or Omnibox)
  useEffect(() => {
    setQuery(initialQuery);
    setSubmittedQuery(initialQuery);
    if (initialQuery.trim()) {
      void runLiveWebSearch(initialQuery);
    } else {
      setWebResults([]);
      setWebMeta(null);
    }
  }, [initialQuery, runLiveWebSearch]);

  const localResults = useMemo(() => {
    if (!isVaultUnlocked) return [];
    if (!submittedQuery.trim()) {
      return documents.slice(0, 8).map((doc) => ({
        doc,
        score: 1,
        matchedTerms: [],
      }));
    }
    return searchDocuments(documents, submittedQuery);
  }, [documents, isVaultUnlocked, submittedQuery]);

  const indexedUrlSet = useMemo(() => new Set(documents.map((d) => d.url)), [documents]);

  const sponsor =
    enableContextualSponsors && submittedQuery.trim()
      ? matchContextualSponsor(submittedQuery, 'search')
      : null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    setSubmittedQuery(trimmed);
    if (trimmed) {
      onSearchExecuted(trimmed);
      void runLiveWebSearch(trimmed);
    } else {
      setWebResults([]);
      setWebMeta(null);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setVaultError(null);
    setVaultNotice(null);
    try {
      await onUnlockVault(unlockPassphrase);
      setUnlockPassphrase('');
      setVaultNotice('Local AES-256-GCM index unlocked in memory.');
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Unable to unlock index.');
    }
  };

  const handleRekey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassphrase.trim().length < 6) {
      setVaultError('Choose a passphrase of at least 6 characters.');
      return;
    }
    setVaultError(null);
    setVaultNotice(null);
    try {
      await onRekeyVault(newPassphrase.trim());
      setNewPassphrase('');
      setVaultNotice('Index re-encrypted with new PBKDF2 + AES-256-GCM key.');
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Re-key failed.');
    }
  };

  const handleCreateDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle.trim() || !docSnippet.trim()) return;
    await onAddDocument({
      title: docTitle.trim(),
      url: docUrl.trim() || `https://notes.local/${Date.now()}`,
      snippet: docSnippet.trim(),
      keywords: docKeywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
      category: 'Private Index',
      source: 'note',
    });
    setDocTitle('');
    setDocUrl('');
    setDocSnippet('');
    setDocKeywords('');
    setShowAddForm(false);
    setVaultNotice('Document encrypted and committed to local index.');
  };

  const handleSaveHitToVault = async (hit: LiveSearchHit) => {
    if (!isVaultUnlocked) {
      setVaultError('Unlock your encrypted local vault first to save web results.');
      return;
    }
    if (indexedUrlSet.has(hit.url)) return;
    await onAddDocument({
      title: hit.title,
      url: hit.url,
      snippet: hit.snippet,
      keywords: [
        hit.domain,
        ...submittedQuery
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length >= 2),
      ],
      category: hit.category || 'Crawled Web',
      source: 'crawled',
    });
    setVaultNotice(`Encrypted "${hit.title}" into your local AES-256-GCM core index.`);
  };

  const loadingStages = [
    'Decrypting local AES-256-GCM vault',
    'Stripping client IP, cookies & trackers',
    'Crawling Vexora web & encyclopedia nodes',
    'Ranking clean results locally',
  ];

  return (
    <div className="min-h-full bg-[var(--bg)] text-[var(--fg)] px-6 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
          <div>
            <h1 className="text-2xl font-semibold">Vexora Private Search Engine</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--fg2)]">
              <span>First-party web crawler + AES-256-GCM local core index</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{documents.length} encrypted local records</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const next = !localOnly;
                setLocalOnly(next);
                if (!next && submittedQuery.trim()) {
                  void runLiveWebSearch(submittedQuery);
                } else if (next) {
                  setWebResults([]);
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium whitespace-nowrap cursor-pointer ${
                localOnly
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-[var(--line2)] bg-[var(--panel)] text-[var(--fg)]'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              {localOnly ? 'Local Vault Only' : 'Local + First-Party Web'}
            </button>
            <button
              type="button"
              onClick={() => setShowCiphertext((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line2)] bg-[var(--panel)] px-3 py-2 text-xs font-medium text-[var(--fg)] hover:bg-[var(--hover2)] whitespace-nowrap cursor-pointer"
            >
              {showCiphertext ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showCiphertext ? 'Hide Ciphertext' : 'Inspect Disk Vault'}
            </button>
            {isVaultUnlocked && (
              <button
                type="button"
                onClick={onLockVault}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/20 whitespace-nowrap cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                Lock Vault
              </button>
            )}
          </div>
        </div>

        {showCiphertext && encryptedBundle && (
          <div className="rounded-2xl border border-[var(--line2)] bg-[var(--panel)] p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold">
                Raw Encrypted Core Index on Disk (localStorage)
              </div>
              <div className="text-xs font-mono text-emerald-400 tabular-nums">
                {encryptedBundle.algorithm} · {encryptedBundle.ciphertext.length} base64 chars
              </div>
            </div>
            <pre className="max-h-40 overflow-auto rounded-lg bg-black/60 text-slate-200 p-3 text-xs font-mono leading-relaxed">
              {JSON.stringify(
                {
                  algorithm: encryptedBundle.algorithm,
                  salt: encryptedBundle.salt,
                  iv: encryptedBundle.iv,
                  ciphertextPreview: `${encryptedBundle.ciphertext.slice(0, 260)}...`,
                  createdAt: encryptedBundle.createdAt,
                },
                null,
                2
              )}
            </pre>
            <form onSubmit={handleRekey} className="flex flex-col sm:flex-row gap-2 pt-1">
              <input
                type="password"
                value={newPassphrase}
                onChange={(e) => setNewPassphrase(e.target.value)}
                placeholder="Set custom passphrase (min 6 chars) to re-encrypt..."
                className="flex-1 rounded-lg border border-[var(--line2)] bg-[var(--bg2)] px-3 py-2 text-xs text-[var(--fg)]"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
                style={{ background: 'var(--grad-soft)' }}
              >
                <KeyRound className="w-3.5 h-3.5" />
                Re-Key Local Index
              </button>
            </form>
          </div>
        )}

        {vaultError && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-400">
            {vaultError}
          </div>
        )}
        {vaultNotice && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-400">
            {vaultNotice}
          </div>
        )}

        {/* Search Input Bar */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-xl border border-[var(--line2)] bg-[var(--panel)] px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-[var(--a1)]">
            <Search className="w-4 h-4 text-[var(--fg3)] shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the web privately or query your encrypted vault (supports site:domain.org)..."
              className="w-full bg-transparent text-sm text-[var(--fg)] placeholder:text-[var(--fg3)] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
            style={{ background: 'var(--grad-soft)' }}
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--line2)] bg-[var(--panel)] px-4 py-2.5 text-sm font-medium text-[var(--fg)] hover:bg-[var(--hover2)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FilePlus2 className="w-4 h-4" />
            Add Note
          </button>
        </form>

        {!isVaultUnlocked && (
          <div className="rounded-2xl border border-amber-500/30 bg-[var(--panel)] p-6 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
              <Lock className="w-4 h-4" />
              Local Encrypted Core Index Is Locked
            </div>
            <p className="text-xs text-[var(--fg2)]">
              Enter your passphrase to decrypt your personal local index in memory.
            </p>
            <form onSubmit={handleUnlock} className="flex flex-col sm:flex-row gap-2 max-w-md">
              <input
                type="password"
                value={unlockPassphrase}
                onChange={(e) => setUnlockPassphrase(e.target.value)}
                placeholder="Passphrase (default: vexora-local-device-key)"
                className="flex-1 rounded-lg border border-[var(--line2)] bg-[var(--bg2)] px-3 py-2 text-xs text-[var(--fg)]"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
                style={{ background: 'var(--grad-soft)' }}
              >
                <Unlock className="w-3.5 h-3.5" />
                Unlock
              </button>
            </form>
          </div>
        )}

        {showAddForm && (
          <form
            onSubmit={handleCreateDoc}
            className="rounded-2xl border border-[var(--line2)] bg-[var(--panel)] p-5 space-y-3"
          >
            <div className="text-sm font-semibold">
              Index New Document Locally (AES-GCM Encrypted on Save)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="Document title"
                className="rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-3 py-2 text-xs text-[var(--fg)]"
              />
              <input
                type="text"
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                placeholder="Source URL (optional)"
                className="rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-3 py-2 text-xs text-[var(--fg)]"
              />
            </div>
            <textarea
              required
              rows={2}
              value={docSnippet}
              onChange={(e) => setDocSnippet(e.target.value)}
              placeholder="Searchable summary or excerpt..."
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-3 py-2 text-xs text-[var(--fg)]"
            />
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={docKeywords}
                onChange={(e) => setDocKeywords(e.target.value)}
                placeholder="Keywords separated by commas"
                className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-3 py-2 text-xs text-[var(--fg)]"
              />
              <button
                type="submit"
                className="rounded-lg px-4 py-2 text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
                style={{ background: 'var(--grad-soft)' }}
              >
                Encrypt & Store
              </button>
            </div>
          </form>
        )}

        {sponsor && (
          <div className="rounded-2xl border border-[var(--line2)] bg-[var(--panel)] p-4">
            <div className="flex items-center gap-2 text-xs text-[var(--fg3)]">
              <span className="font-semibold text-[var(--a1)]">
                Sponsored (Contextual Only)
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{sponsor.domain}</span>
              <span aria-hidden="true">·</span>
              <span>{sponsor.cpmNote}</span>
            </div>
            <button
              type="button"
              onClick={() => onOpenUrl(sponsor.url)}
              className="mt-1 text-sm font-semibold text-[var(--fg)] hover:text-[var(--a1)] text-left cursor-pointer"
            >
              {sponsor.title}
            </button>
            <p className="text-xs text-[var(--fg2)] mt-0.5">{sponsor.summary}</p>
          </div>
        )}

        {/* Section 1: Live First-Party Vexora Web Search Results */}
        {submittedQuery.trim() && !localOnly && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--fg3)]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--fg2)]">
                <Globe className="w-3.5 h-3.5 text-[var(--a1)]" />
                Vexora First-Party Web Results
              </span>
              {webMeta && !webLoading && (
                <span>
                  {webResults.length} results ({webMeta.elapsedMs} ms) · {webMeta.privacy}
                </span>
              )}
            </div>

            {webLoading ? (
              <div className="space-y-4">
                <div className="relative overflow-hidden rounded-2xl border border-[var(--line2)] bg-[var(--panel)] p-8 flex flex-col items-center text-center">
                  <div
                    className="pointer-events-none absolute -top-24 h-48 w-96 rounded-full blur-3xl opacity-25"
                    style={{ background: 'var(--grad)' }}
                  />

                  {/* Orbital Vexora Search Scanner */}
                  <div className="relative w-20 h-20 flex items-center justify-center mb-5">
                    <div
                      className="absolute inset-0 rounded-full animate-spin opacity-85"
                      style={{
                        background:
                          'conic-gradient(from 0deg, var(--a1), var(--a2), var(--a3), transparent 72%)',
                        WebkitMask:
                          'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 0)',
                        mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 0)',
                      }}
                    />
                    <div className="absolute inset-2 rounded-full border border-[var(--line2)] animate-ping opacity-30" />
                    <img
                      src="/assets/logo-128.png"
                      alt="Vexora"
                      className="relative w-10 h-10 object-contain vx-logo-bob"
                    />
                  </div>

                  <div className="font-display text-base font-bold tracking-wide vx-grad-text">
                    Searching Privately for "{submittedQuery}"
                  </div>
                  <p className="mt-1 text-xs text-[var(--fg3)]">
                    First-party Vexora crawl · Zero third-party cookies or query tracking
                  </p>

                  {/* Animated 4-step pipeline */}
                  <div className="mt-6 w-full max-w-md space-y-2 text-left">
                    {loadingStages.map((label, idx) => {
                      const done = idx < loadingStep;
                      const active = idx === loadingStep;
                      return (
                        <div
                          key={label}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-all ${
                            active
                              ? 'border-[var(--a1)]/60 bg-[var(--hover2)] text-[var(--fg)]'
                              : done
                              ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-400'
                              : 'border-[var(--line)] text-[var(--fg3)] opacity-60'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                done
                                  ? 'bg-emerald-400'
                                  : active
                                  ? 'bg-[var(--a1)] animate-pulse'
                                  : 'bg-[var(--fg3)]'
                              }`}
                            />
                            {label}
                          </span>
                          <span className="font-mono text-[10px]">
                            {done ? 'DONE' : active ? 'ACTIVE' : 'WAIT'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Skeleton Result Shimmers */}
                <div className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="p-5 space-y-2.5 animate-pulse">
                      <div className="h-3 w-48 rounded bg-[var(--hover2)]" />
                      <div className="h-4 w-2/3 rounded bg-[var(--hover2)]" />
                      <div className="h-3 w-full rounded bg-[var(--hover)]" />
                    </div>
                  ))}
                </div>
              </div>
            ) : webError ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400">
                {webError}
              </div>
            ) : webResults.length === 0 ? (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 text-xs text-[var(--fg2)]">
                No external web results returned for "{submittedQuery}".
              </div>
            ) : (
              <div className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
                {webResults.map((hit) => {
                  const saved = indexedUrlSet.has(hit.url);
                  return (
                    <div key={hit.id} className="p-5 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--fg3)]">
                          <img
                            src={`/api/favicon?d=${encodeURIComponent(hit.domain)}`}
                            alt=""
                            className="w-3.5 h-3.5 rounded-xs"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          <span className="font-mono truncate max-w-md">{hit.url}</span>
                          <span aria-hidden="true">·</span>
                          <span>{hit.category}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenUrl(hit.url)}
                          className="mt-1.5 text-base font-semibold text-[var(--a1)] hover:underline text-left cursor-pointer"
                        >
                          {hit.title}
                        </button>
                        <p className="mt-1 text-sm text-[var(--fg2)] leading-relaxed">
                          {hit.snippet}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={saved}
                        onClick={() => void handleSaveHitToVault(hit)}
                        title={saved ? 'Encrypted in Local Vault' : 'Save & Encrypt to Local Vault'}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--line2)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--fg2)] hover:bg-[var(--hover2)] disabled:opacity-60 shrink-0 whitespace-nowrap cursor-pointer"
                      >
                        {saved ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            In Vault
                          </>
                        ) : (
                          <>
                            <BookmarkPlus className="w-3 h-3" />
                            Encrypt
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Section 2: Local AES-256-GCM Encrypted Core Index */}
        {isVaultUnlocked && (
          <section className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[var(--fg3)]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--fg2)]">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                {submittedQuery.trim()
                  ? `Local Encrypted Vault Matches (${localResults.length})`
                  : `Local Encrypted Core Index (${localResults.length} shown)`}
              </span>
              <span>AES-256-GCM · 0 bytes sent to 3rd parties</span>
            </div>

            {localResults.length === 0 ? (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 text-center text-xs text-[var(--fg2)]">
                No local encrypted documents matched "{submittedQuery}". Click "Encrypt" on any web result above to store it privately in your local index.
              </div>
            ) : (
              <div className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
                {localResults.map(({ doc, score, matchedTerms }) => (
                  <div key={doc.id} className="p-5 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--fg3)]">
                        <span className="font-mono truncate max-w-md">{doc.url}</span>
                        <span aria-hidden="true">·</span>
                        <span>{doc.category}</span>
                        {submittedQuery.trim() && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              Score {score.toFixed(2)}
                            </span>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenUrl(doc.url)}
                        className="mt-1.5 text-base font-semibold text-[var(--a1)] hover:underline text-left cursor-pointer"
                      >
                        {doc.title}
                      </button>
                      <p className="mt-1 text-sm text-[var(--fg2)] leading-relaxed">
                        {doc.snippet}
                      </p>
                      {matchedTerms.length > 0 && (
                        <div className="mt-2 text-xs text-[var(--fg3)]">
                          Matched: {matchedTerms.join(' · ')}
                        </div>
                      )}
                    </div>
                    {doc.source !== 'seed' && (
                      <button
                        type="button"
                        onClick={() => void onRemoveDocument(doc.id)}
                        className="p-2 rounded-lg text-[var(--fg3)] hover:text-red-400 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};
