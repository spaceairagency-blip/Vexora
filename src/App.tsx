import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  Columns2,
  Command,
  Copy,
  FileText,
  Globe,
  History,
  Home,
  Layers,
  Lock,
  Moon,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  PauseCircle,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Sun,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  DEFAULT_AD_RULES,
  DEFAULT_PERMISSIONS,
  evaluateUrlPhishingRisk,
} from './lib/adBlocker';
import {
  DEFAULT_LOCAL_PASSPHRASE,
  getRawEncryptedIndexPreview,
  getSeedDocuments,
  loadEncryptedIndex,
  saveEncryptedIndex,
} from './lib/searchEngine';
import {
  DEFAULT_SETTINGS,
  DEFAULT_SPEED_TILES,
  INITIAL_BOOKMARKS,
  INITIAL_STATS,
  INITIAL_TABS,
  TAB_GROUPS,
  loadBookmarks,
  loadBrowserStats,
  loadHistory,
  loadNotes,
  loadReading,
  loadSettings,
  loadSpeedTiles,
  saveBookmarks,
  saveBrowserStats,
  saveHistory,
  saveNotes,
  saveReading,
  saveSettings,
  saveSpeedTiles,
} from './lib/storage';
import type {
  AdRule,
  BookmarkItem,
  BrowserStats,
  BrowserTab,
  EncryptedBundle,
  HistoryItem,
  IndexedDocument,
  OriginPermission,
  ReaderArticle,
  ReadingItem,
  SpeedTile,
  TabGroupId,
  VexoraSettings,
} from './types/browser';
import { ArchitectureView } from './components/ArchitectureView';
import { CommandPalette } from './components/CommandPalette';
import { DashboardView } from './components/DashboardView';
import { NewTabView } from './components/NewTabView';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { ProxyViewport } from './components/ProxyViewport';
import { SearchView } from './components/SearchView';
import { SettingsModal } from './components/SettingsModal';
import { ShieldView } from './components/ShieldView';
import { SyncView } from './components/SyncView';
import { BrowserUpdateBanner, ToolbarUpdateButton } from './components/UpdatePrompt';

type SidebarSection = 'workspaces' | 'bookmarks' | 'history' | 'reading' | 'notes';

const DISTRACTING_HOSTS = [
  'reddit.com',
  'x.com',
  'twitter.com',
  'instagram.com',
  'tiktok.com',
  'facebook.com',
  'social-feed.example',
];

function getInternalTitle(url: string): string {
  if (!url || url === 'vexora://newtab') return 'New Tab';
  if (url === 'vexora://search') return 'Vexora Search';
  if (url === 'vexora://dashboard') return 'Focus & Stats';
  if (url === 'vexora://shield') return 'AI Ad Shield';
  if (url === 'vexora://sync') return 'Encrypted Sync';
  if (url === 'vexora://architecture') return 'App & Ad Model';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function normalizeUrlInput(raw: string, httpsFirst: boolean): string {
  const s = raw.trim();
  if (!s || s === 'vexora://newtab') return '';
  if (/^vexora:\/\//i.test(s)) return s.toLowerCase();
  if (/^https?:\/\//i.test(s)) {
    if (httpsFirst && s.startsWith('http://')) {
      return `https://${s.slice(7)}`;
    }
    return s;
  }
  if (!s.includes(' ') && /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#:].*)?$/i.test(s)) {
    return `https://${s}`;
  }
  return s;
}

function isNavigableUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s || s === 'vexora://newtab') return true;
  if (/^vexora:\/\//i.test(s)) return true;
  if (/^https?:\/\//i.test(s)) return true;
  if (!s.includes(' ') && /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#:].*)?$/i.test(s)) return true;
  return false;
}

function extractDomain(url: string): string {
  try {
    if (url.startsWith('http')) {
      return new URL(url).hostname.replace(/^www\./, '');
    }
  } catch {
    // ignore
  }
  return '';
}

function createTabObject(opts: {
  url: string;
  title?: string;
  groupId?: TabGroupId;
  priv?: boolean;
  pinned?: boolean;
  searchQuery?: string;
  readerMode?: boolean;
}): BrowserTab {
  const cleanUrl = opts.url === 'vexora://newtab' ? '' : opts.url;
  const title = opts.title || getInternalTitle(cleanUrl);
  return {
    id: `tab-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    url: cleanUrl,
    frameUrl: cleanUrl,
    reloadNonce: 0,
    title,
    groupId: opts.groupId || 'personal',
    pinned: !!opts.pinned,
    priv: !!opts.priv,
    isSleeping: false,
    memoryMb: cleanUrl.startsWith('http') ? 42 : 28,
    lastActiveAt: Date.now(),
    history: cleanUrl ? [{ url: cleanUrl, title }] : [],
    historyIndex: cleanUrl ? 0 : -1,
    processId: `pid-${Math.floor(1200 + Math.random() * 8000)}`,
    blockedCount: 0,
    blockedHosts: [],
    zoom: 1,
    dark: false,
    readerMode: !!opts.readerMode,
    readerData: null,
    searchQuery: opts.searchQuery,
  };
}

export default function App() {
  const [settings, setSettings] = useState<VexoraSettings>(loadSettings);
  const [tabs, setTabs] = useState<BrowserTab[]>(INITIAL_TABS);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const [activeTabId, setActiveTabId] = useState<string>(INITIAL_TABS[0].id);
  const [splitTabId, setSplitTabId] = useState<string | null>(null);
  const [closedTabs, setClosedTabs] = useState<BrowserTab[]>([]);
  const [groupFilter, setGroupFilter] = useState<TabGroupId | 'all'>('all');

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>('workspaces');
  const [sidebarQuery, setSidebarQuery] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [omniboxValue, setOmniboxValue] = useState<string>(INITIAL_TABS[0].url);
  const omniboxRef = useRef<HTMLInputElement>(null);
  const dragTabIdRef = useRef<string | null>(null);

  // Local Encrypted Search Vault
  const [passphrase, setPassphrase] = useState(DEFAULT_LOCAL_PASSPHRASE);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(true);
  const [documents, setDocuments] = useState<IndexedDocument[]>(getSeedDocuments);
  const [encryptedBundle, setEncryptedBundle] = useState<EncryptedBundle | null>(null);

  // Vexora Data State
  const [stats, setStats] = useState<BrowserStats>(loadBrowserStats);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(loadBookmarks);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(loadHistory);
  const [readingList, setReadingList] = useState<ReadingItem[]>(loadReading);
  const [notes, setNotes] = useState<string>(loadNotes);
  const [speedTiles, setSpeedTiles] = useState<SpeedTile[]>(loadSpeedTiles);

  // Shield & Focus State
  const [focusModeActive, setFocusModeActive] = useState(false);
  const [adRules, setAdRules] = useState<AdRule[]>(DEFAULT_AD_RULES);
  const [permissions, setPermissions] = useState<OriginPermission[]>(DEFAULT_PERMISSIONS);
  const [shieldInspectTarget, setShieldInspectTarget] = useState<{
    url: string;
    snippet: string;
  } | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Apply Vexora theme & accent palette to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.accent = settings.accent;
    root.classList.toggle('dark', settings.theme !== 'daylight');
    saveSettings(settings);
  }, [settings]);

  // Persist user data
  useEffect(() => saveBrowserStats(stats), [stats]);
  useEffect(() => saveBookmarks(bookmarks), [bookmarks]);
  useEffect(() => saveHistory(historyItems), [historyItems]);
  useEffect(() => saveReading(readingList), [readingList]);
  useEffect(() => saveNotes(notes), [notes]);
  useEffect(() => saveSpeedTiles(speedTiles), [speedTiles]);

  // Initialize local AES-256-GCM encrypted search index on boot
  useEffect(() => {
    let active = true;
    loadEncryptedIndex(DEFAULT_LOCAL_PASSPHRASE)
      .then(({ docs, bundle }) => {
        if (!active) return;
        setDocuments(docs);
        setEncryptedBundle(bundle);
      })
      .catch(() => {
        if (!active) return;
        setIsVaultUnlocked(false);
        setEncryptedBundle(getRawEncryptedIndexPreview());
      });
    return () => {
      active = false;
    };
  }, []);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? tabs[0],
    [tabs, activeTabId]
  );

  const splitTab = useMemo(
    () => (splitTabId ? tabs.find((t) => t.id === splitTabId) ?? null : null),
    [tabs, splitTabId]
  );

  // Keep omnibox synced when switching tabs or navigating
  useEffect(() => {
    if (activeTab) {
      setOmniboxValue(activeTab.url);
    }
  }, [activeTab?.id, activeTab?.url]);

  const updateSettings = useCallback((patch: Partial<VexoraSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const recordHistoryVisit = useCallback((url: string, title: string, isPriv: boolean) => {
    if (isPriv || !url || url.startsWith('vexora://')) return;
    setHistoryItems((prev) => {
      const next = prev.filter((item) => item.url !== url);
      return [{ url, title: title || getInternalTitle(url), t: Date.now() }, ...next].slice(0, 200);
    });
    const dom = extractDomain(url);
    if (!dom) return;
    setStats((prev) => {
      const existing = prev.domainStats.find((d) => d.domain === dom);
      const updatedDomains = existing
        ? prev.domainStats.map((d) =>
            d.domain === dom
              ? { ...d, visits: d.visits + 1, minutes: d.minutes + 2, lastVisitedAt: 'Just now' }
              : d
          )
        : [
            {
              domain: dom,
              visits: 1,
              minutes: 2,
              trackersBlocked: 0,
              category: 'Research' as const,
              lastVisitedAt: 'Just now',
            },
            ...prev.domainStats,
          ];
      return {
        ...prev,
        totalPagesVisited: prev.totalPagesVisited + 1,
        domainStats: updatedDomains,
      };
    });
  }, []);

  const loadReaderArticle = useCallback(async (tabId: string, url: string) => {
    try {
      const res = await fetch(`/api/reader?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reader extraction failed');
      const article = data as ReaderArticle;
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? {
                ...t,
                readerMode: true,
                readerData: article,
                title: article.title || t.title,
              }
            : t
        )
      );
    } catch (err) {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? {
                ...t,
                readerMode: true,
                readerData: {
                  title: t.title || 'Reader Unavailable',
                  byline: '',
                  site: extractDomain(url) || 'vexora',
                  html: `<p>${err instanceof Error ? err.message : 'Unable to distill article from this origin.'}</p>`,
                  words: 0,
                  minutes: 1,
                  url,
                },
              }
            : t
        )
      );
    }
  }, []);

  const navigateTab = useCallback(
    (
      tabId: string,
      rawInput: string,
      opts?: { searchQuery?: string; readerMode?: boolean; forceReload?: boolean }
    ) => {
      const normalized = normalizeUrlInput(rawInput, settings.httpsFirst);
      const navigable = isNavigableUrl(rawInput);

      if (!navigable && rawInput.trim()) {
        // Non-URL string -> route directly to local encrypted first-party search
        const q = rawInput.trim();
        setStats((s) => ({ ...s, totalSearches: s.totalSearches + 1 }));
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;
            const entry = { url: 'vexora://search', title: `Search: ${q}` };
            const nextHistory = t.history.slice(0, t.historyIndex + 1).concat(entry);
            return {
              ...t,
              url: 'vexora://search',
              frameUrl: 'vexora://search',
              title: `Search: ${q}`,
              searchQuery: q,
              isSleeping: false,
              memoryMb: 32,
              lastActiveAt: Date.now(),
              history: nextHistory,
              historyIndex: nextHistory.length - 1,
              readerMode: false,
              readerData: null,
            };
          })
        );
        return;
      }

      const targetTitle = getInternalTitle(normalized);
      const existingTab = tabsRef.current.find((t) => t.id === tabId);
      const isPrivTab = Boolean(existingTab?.priv);

      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== tabId) return t;
          if (!normalized) {
            return {
              ...t,
              url: '',
              frameUrl: '',
              title: 'New Tab',
              isSleeping: false,
              memoryMb: 26,
              lastActiveAt: Date.now(),
              readerMode: false,
              readerData: null,
              searchQuery: undefined,
            };
          }
          const entry = { url: normalized, title: targetTitle };
          const currentEntry = t.history[t.historyIndex];
          const nextHistory =
            currentEntry && currentEntry.url === normalized
              ? t.history
              : t.history.slice(0, t.historyIndex + 1).concat(entry);
          const shouldBumpNonce =
            opts?.forceReload || t.frameUrl === normalized || t.url === normalized;
          return {
            ...t,
            url: normalized,
            frameUrl: normalized,
            reloadNonce: shouldBumpNonce ? (t.reloadNonce || 0) + 1 : t.reloadNonce || 0,
            title: targetTitle,
            isSleeping: false,
            memoryMb: normalized.startsWith('http') ? 44 : 30,
            lastActiveAt: Date.now(),
            history: nextHistory,
            historyIndex: nextHistory.length - 1,
            blockedCount: 0,
            blockedHosts: [],
            readerMode: !!opts?.readerMode,
            readerData: null,
            searchQuery: opts?.searchQuery ?? (normalized === 'vexora://search' ? t.searchQuery : undefined),
          };
        })
      );

      if (normalized.startsWith('http')) {
        recordHistoryVisit(normalized, targetTitle, isPrivTab);
        if (opts?.readerMode) {
          void loadReaderArticle(tabId, normalized);
        }
      }
      if (tabId === activeTabId) {
        setOmniboxValue(normalized);
        setFindOpen(false);
      }
    },
    [settings.httpsFirst, activeTabId, recordHistoryVisit, loadReaderArticle]
  );

  const openNewTab = useCallback(
    (
      url = '',
      opts?: {
        groupId?: TabGroupId;
        priv?: boolean;
        activate?: boolean;
        searchQuery?: string;
        readerMode?: boolean;
      }
    ) => {
      const normalized = url ? normalizeUrlInput(url, settings.httpsFirst) : '';
      const tab = createTabObject({
        url: normalized,
        groupId: opts?.groupId || (groupFilter === 'all' ? 'personal' : groupFilter),
        priv: opts?.priv,
        searchQuery: opts?.searchQuery,
        readerMode: opts?.readerMode,
      });
      setTabs((prev) => [...prev, tab]);
      if (opts?.activate !== false) {
        setActiveTabId(tab.id);
        setOmniboxValue(tab.url);
      }
      if (normalized.startsWith('http')) {
        recordHistoryVisit(normalized, tab.title, !!opts?.priv);
        if (opts?.readerMode) {
          void loadReaderArticle(tab.id, normalized);
        }
      }
      return tab.id;
    },
    [settings.httpsFirst, groupFilter, recordHistoryVisit, loadReaderArticle]
  );

  const selectTab = useCallback((tabId: string) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId
          ? {
              ...t,
              isSleeping: false,
              memoryMb: t.url.startsWith('http') ? 42 : 28,
              lastActiveAt: Date.now(),
            }
          : t
      )
    );
    setActiveTabId(tabId);
    setFindOpen(false);
  }, []);

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const target = prev.find((t) => t.id === tabId);
        if (target && !target.priv && target.url) {
          setClosedTabs((c) => [target, ...c].slice(0, 20));
        }
        if (prev.length === 1) {
          const fresh = createTabObject({ url: '', groupId: prev[0].groupId });
          setActiveTabId(fresh.id);
          setSplitTabId(null);
          return [fresh];
        }
        const idx = prev.findIndex((t) => t.id === tabId);
        const remaining = prev.filter((t) => t.id !== tabId);
        if (tabId === activeTabId) {
          const fallback = remaining[Math.max(0, idx - 1)] ?? remaining[0];
          setActiveTabId(fallback.id);
        }
        if (splitTabId === tabId) {
          setSplitTabId(null);
        }
        return remaining;
      });
    },
    [activeTabId, splitTabId]
  );

  const reopenClosedTab = useCallback(() => {
    setClosedTabs((prev) => {
      if (prev.length === 0) return prev;
      const [first, ...rest] = prev;
      const restored = { ...first, id: `tab-${Date.now()}`, isSleeping: false, lastActiveAt: Date.now() };
      setTabs((cur) => [...cur, restored]);
      setActiveTabId(restored.id);
      return rest;
    });
  }, []);

  const togglePinTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const updated = prev.map((t) => (t.id === tabId ? { ...t, pinned: !t.pinned } : t));
      return [...updated].sort((a, b) => Number(b.pinned) - Number(a.pinned));
    });
  }, []);

  const goBack = useCallback(
    (tabId: string) => {
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== tabId || t.historyIndex <= 0) return t;
          const nextIdx = t.historyIndex - 1;
          const target = t.history[nextIdx];
          return {
            ...t,
            url: target.url,
            frameUrl: target.url,
            title: target.title,
            historyIndex: nextIdx,
            readerMode: false,
          };
        })
      );
    },
    []
  );

  const goForward = useCallback(
    (tabId: string) => {
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== tabId || t.historyIndex >= t.history.length - 1) return t;
          const nextIdx = t.historyIndex + 1;
          const target = t.history[nextIdx];
          return {
            ...t,
            url: target.url,
            frameUrl: target.url,
            title: target.title,
            historyIndex: nextIdx,
            readerMode: false,
          };
        })
      );
    },
    []
  );

  const toggleReaderMode = useCallback(
    (tab: BrowserTab) => {
      if (!tab.url.startsWith('http')) return;
      if (tab.readerMode) {
        setTabs((prev) =>
          prev.map((t) => (t.id === tab.id ? { ...t, readerMode: false } : t))
        );
      } else {
        setTabs((prev) =>
          prev.map((t) => (t.id === tab.id ? { ...t, readerMode: true } : t))
        );
        if (!tab.readerData || tab.readerData.url !== tab.url) {
          void loadReaderArticle(tab.id, tab.url);
        }
      }
    },
    [loadReaderArticle]
  );

  const hibernateIdleTabs = useCallback(() => {
    let saved = 0;
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === activeTabId || t.id === splitTabId || t.pinned || t.isSleeping) {
          return t;
        }
        saved += Math.max(t.memoryMb - 4, 24);
        return { ...t, isSleeping: true, memoryMb: 4 };
      })
    );
    if (saved > 0) {
      setStats((s) => ({ ...s, totalRamSavedMb: s.totalRamSavedMb + saved }));
      showToast(`Hibernated idle tabs · Reclaimed ${saved} MB RAM`);
    } else {
      showToast('All background tabs are already hibernated or pinned.');
    }
  }, [activeTabId, splitTabId, showToast]);

  const toggleSplitView = useCallback(() => {
    if (splitTabId) {
      setSplitTabId(null);
      return;
    }
    const partner = tabs.find((t) => t.id !== activeTabId && !t.isSleeping) ||
      tabs.find((t) => t.id !== activeTabId);
    if (partner) {
      setSplitTabId(partner.id);
    } else {
      const created = openNewTab('vexora://search', { activate: false });
      setSplitTabId(created);
    }
  }, [splitTabId, tabs, activeTabId, openNewTab]);

  // Encrypted local index actions
  const handleUnlockVault = async (inputPass: string) => {
    const { docs, bundle } = await loadEncryptedIndex(inputPass);
    setPassphrase(inputPass);
    setDocuments(docs);
    setEncryptedBundle(bundle);
    setIsVaultUnlocked(true);
  };

  const handleLockVault = () => {
    setIsVaultUnlocked(false);
    setEncryptedBundle(getRawEncryptedIndexPreview());
  };

  const handleRekeyVault = async (newPass: string) => {
    const bundle = await saveEncryptedIndex(documents, newPass);
    setPassphrase(newPass);
    setEncryptedBundle(bundle);
  };

  const handleAddDocument = async (docInput: Omit<IndexedDocument, 'id' | 'indexedAt'>) => {
    const newDoc: IndexedDocument = {
      ...docInput,
      id: `doc-${Date.now()}`,
      indexedAt: new Date().toISOString(),
    };
    const nextDocs = [newDoc, ...documents];
    setDocuments(nextDocs);
    if (isVaultUnlocked) {
      const bundle = await saveEncryptedIndex(nextDocs, passphrase);
      setEncryptedBundle(bundle);
    }
  };

  const handleRemoveDocument = async (id: string) => {
    const nextDocs = documents.filter((d) => d.id !== id);
    setDocuments(nextDocs);
    if (isVaultUnlocked) {
      const bundle = await saveEncryptedIndex(nextDocs, passphrase);
      setEncryptedBundle(bundle);
    }
  };

  const handleIndexReaderArticle = async (article: ReaderArticle) => {
    const exists = documents.some((d) => d.url === article.url);
    if (exists) {
      showToast('Article is already indexed in your encrypted search vault.');
      return;
    }
    await handleAddDocument({
      url: article.url,
      title: article.title,
      snippet: (article.textPreview || article.title).slice(0, 220),
      keywords: [article.site, 'reader', 'article', ...article.title.toLowerCase().split(/\s+/).slice(0, 5)],
      category: 'Saved Web',
      source: 'crawled',
    });
    showToast('Article encrypted and added to local search index.');
  };

  // Frame postMessage bridge from /__vx/inject.js inside opaque sandboxed iframe
  const handleFrameMessage = useCallback(
    (tabId: string, msg: Record<string, unknown>) => {
      const kind = String(msg.t || '');
      if (kind === 'loaded') {
        const loadedUrl = String(msg.url || '');
        const loadedTitle = String(msg.title || '') || getInternalTitle(loadedUrl);
        const blocked = Number(msg.blocked || 0);
        const blockedHosts = Array.isArray(msg.blockedHosts)
          ? (msg.blockedHosts as string[])
          : [];
        const isError = Boolean(msg.error);

        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;
            const resolvedUrl = loadedUrl || t.url;
            const entry = { url: resolvedUrl, title: loadedTitle };
            const nextHistory =
              t.historyIndex >= 0
                ? t.history.map((h, i) => (i === t.historyIndex ? entry : h))
                : [entry];
            return {
              ...t,
              url: resolvedUrl,
              title: loadedTitle,
              blockedCount: blocked,
              blockedHosts,
              error: isError,
              history: nextHistory,
              historyIndex: Math.max(0, t.historyIndex),
            };
          })
        );

        if (blocked > 0) {
          setStats((s) => ({
            ...s,
            totalTrackersBlocked: s.totalTrackersBlocked + blocked,
          }));
        }
        const matchedTab = tabsRef.current.find((x) => x.id === tabId);
        if (loadedUrl.startsWith('http') && matchedTab && loadedUrl !== matchedTab.url) {
          recordHistoryVisit(loadedUrl, loadedTitle, matchedTab.priv);
        }
      } else if (kind === 'nav') {
        const navUrl = String(msg.url || '');
        if (navUrl) {
          navigateTab(tabId, navUrl);
        }
      } else if (kind === 'reload') {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId ? { ...t, reloadNonce: (t.reloadNonce || 0) + 1 } : t
          )
        );
      } else if (kind === 'external') {
        const extUrl = String(msg.url || '');
        if (/^https?:\/\//i.test(extUrl)) {
          window.open(extUrl, '_blank', 'noopener,noreferrer');
        }
      } else if (kind === 'open') {
        const openUrl = String(msg.url || '');
        if (openUrl) {
          openNewTab(openUrl, { activate: !msg.bg });
        }
      } else if (kind === 'title') {
        const newTitle = String(msg.title || '');
        if (newTitle) {
          setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, title: newTitle } : t)));
        }
      } else if (kind === 'push') {
        const pushUrl = String(msg.url || '');
        const pushTitle = String(msg.title || '') || getInternalTitle(pushUrl);
        if (pushUrl) {
          setTabs((prev) =>
            prev.map((t) => {
              if (t.id !== tabId) return t;
              const entry = { url: pushUrl, title: pushTitle };
              const nextHistory = msg.replace
                ? t.history.map((h, i) => (i === t.historyIndex ? entry : h))
                : t.history.slice(0, t.historyIndex + 1).concat(entry);
              return {
                ...t,
                url: pushUrl,
                title: pushTitle,
                history: nextHistory,
                historyIndex: nextHistory.length - 1,
              };
            })
          );
        }
      } else if (kind === 'focus') {
        setActiveTabId(tabId);
      } else if (kind === 'key') {
        const k = String(msg.key || '').toLowerCase();
        const ctrl = Boolean(msg.ctrl);
        if (ctrl && k === 'k') setPaletteOpen(true);
        else if (ctrl && k === 'f') setFindOpen(true);
        else if (ctrl && k === 'b') setSidebarOpen((o) => !o);
        else if (ctrl && k === 'l') {
          omniboxRef.current?.focus();
          omniboxRef.current?.select();
        } else if (ctrl && k === ',') setSettingsOpen(true);
        else if (k === 'escape') setFindOpen(false);
      }
    },
    [navigateTab, openNewTab, recordHistoryVisit]
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (mod && k === 'l') {
        e.preventDefault();
        omniboxRef.current?.focus();
        omniboxRef.current?.select();
      } else if (mod && k === 'b') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      } else if (mod && k === 'f') {
        e.preventDefault();
        setFindOpen(true);
      } else if (mod && k === ',') {
        e.preventDefault();
        setSettingsOpen((v) => !v);
      } else if (mod && e.shiftKey && k === 't') {
        e.preventDefault();
        reopenClosedTab();
      } else if (mod && k === 't') {
        e.preventDefault();
        openNewTab('');
      } else if (mod && k === 'w') {
        e.preventDefault();
        if (activeTab) closeTab(activeTab.id);
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
        setSettingsOpen(false);
        setFindOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, closeTab, openNewTab, reopenClosedTab]);

  // Bookmarks, Reading List, Speed Tiles, Notes
  const isBookmarked = useMemo(
    () => Boolean(activeTab?.url && bookmarks.some((b) => b.url === activeTab.url)),
    [bookmarks, activeTab?.url]
  );

  const toggleBookmarkCurrent = () => {
    if (!activeTab?.url) return;
    if (isBookmarked) {
      setBookmarks((prev) => prev.filter((b) => b.url !== activeTab.url));
      showToast('Removed from Vexora bookmarks.');
    } else {
      setBookmarks((prev) => [
        {
          id: `bm-${Date.now()}`,
          title: activeTab.title || getInternalTitle(activeTab.url),
          url: activeTab.url,
          groupId: activeTab.groupId,
        },
        ...prev,
      ]);
      showToast('Bookmarked locally in Vexora.');
    }
  };

  const saveToReadingList = (tab: BrowserTab) => {
    if (!tab.url || !tab.url.startsWith('http')) return;
    setReadingList((prev) => {
      if (prev.some((r) => r.url === tab.url)) {
        showToast('Already saved in Reading List.');
        return prev;
      }
      showToast('Saved to Reading List.');
      return [
        {
          id: `rl-${Date.now()}`,
          url: tab.url,
          title: tab.title || getInternalTitle(tab.url),
          added: Date.now(),
          read: false,
        },
        ...prev,
      ];
    });
  };

  const handleInspectWithAiShield = (tab: BrowserTab) => {
    const hostsText = tab.blockedHosts.length
      ? tab.blockedHosts.map((h) => `<script src="https://${h}/collect.js"></script>`).join('\n')
      : `<div data-ad-slot="header"><script src="https://${extractDomain(tab.url) || 'site.example'}/analytics.js"></script></div>`;
    setShieldInspectTarget({
      url: tab.url,
      snippet: hostsText,
    });
    navigateTab(activeTab.id, 'vexora://shield');
  };

  const handleOpenExternal = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  const handleExportBackup = () => {
    const payload = {
      app: 'Vexora',
      version: 2,
      exportedAt: new Date().toISOString(),
      settings,
      bookmarks,
      history: historyItems,
      reading: readingList,
      notes,
      speedTiles,
      stats,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vexora-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported Vexora backup JSON.');
  };

  const handleImportBackup = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as {
        settings?: Partial<VexoraSettings>;
        bookmarks?: BookmarkItem[];
        history?: HistoryItem[];
        reading?: ReadingItem[];
        notes?: string;
        speedTiles?: SpeedTile[];
        stats?: BrowserStats;
      };
      if (data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      if (Array.isArray(data.bookmarks)) setBookmarks(data.bookmarks);
      if (Array.isArray(data.history)) setHistoryItems(data.history);
      if (Array.isArray(data.reading)) setReadingList(data.reading);
      if (typeof data.notes === 'string') setNotes(data.notes);
      if (Array.isArray(data.speedTiles)) setSpeedTiles(data.speedTiles);
      if (data.stats) setStats(data.stats);
      showToast('Vexora backup restored successfully.');
    } catch {
      showToast('Invalid Vexora JSON backup file.');
    }
  };

  const handleResetAll = () => {
    setSettings(DEFAULT_SETTINGS);
    setBookmarks(INITIAL_BOOKMARKS);
    setHistoryItems([]);
    setReadingList([]);
    setNotes('');
    setSpeedTiles(DEFAULT_SPEED_TILES);
    setStats(INITIAL_STATS);
    showToast('Vexora preferences and local data reset to defaults.');
  };

  const visibleTabs = useMemo(() => {
    if (groupFilter === 'all') return tabs;
    return tabs.filter((t) => t.groupId === groupFilter || t.id === activeTabId || t.pinned);
  }, [tabs, groupFilter, activeTabId]);

  const phishingCheck = useMemo(
    () => evaluateUrlPhishingRisk(activeTab?.url || ''),
    [activeTab?.url]
  );

  const renderTabViewport = (tab: BrowserTab) => {
    if (!tab.url || tab.url === 'vexora://newtab') {
      return (
        <NewTabView
          stats={stats}
          settings={settings}
          indexedCount={documents.length}
          isVaultUnlocked={isVaultUnlocked}
          speedTiles={speedTiles}
          bookmarksCount={bookmarks.length}
          onNavigate={(u) => navigateTab(tab.id, u)}
          onSearch={(q) => navigateTab(tab.id, 'vexora://search', { searchQuery: q })}
          onAddSpeedTile={(tile) => setSpeedTiles((prev) => [...prev, tile])}
          onRemoveSpeedTile={(idx) =>
            setSpeedTiles((prev) => prev.filter((_, i) => i !== idx))
          }
        />
      );
    }

    if (tab.url === 'vexora://search') {
      return (
        <SearchView
          key={`${tab.id}-${tab.searchQuery || ''}`}
          initialQuery={tab.searchQuery || ''}
          documents={documents}
          encryptedBundle={encryptedBundle}
          isVaultUnlocked={isVaultUnlocked}
          enableContextualSponsors={settings.enableContextualSponsors}
          onUnlockVault={handleUnlockVault}
          onLockVault={handleLockVault}
          onRekeyVault={handleRekeyVault}
          onAddDocument={handleAddDocument}
          onRemoveDocument={handleRemoveDocument}
          onOpenUrl={(u) => navigateTab(tab.id, u)}
          onSearchExecuted={() =>
            setStats((s) => ({ ...s, totalSearches: s.totalSearches + 1 }))
          }
        />
      );
    }

    if (tab.url === 'vexora://dashboard') {
      return (
        <DashboardView
          stats={stats}
          tabs={tabs}
          focusModeActive={focusModeActive}
          onToggleFocusMode={() => setFocusModeActive((f) => !f)}
          onCompleteFocusSession={() =>
            setStats((s) => ({
              ...s,
              focusSessionsCompleted: s.focusSessionsCompleted + 1,
            }))
          }
          onHibernateAllIdle={hibernateIdleTabs}
        />
      );
    }

    if (tab.url === 'vexora://shield') {
      return (
        <ShieldView
          rules={adRules}
          permissions={permissions}
          tabs={tabs}
          httpsFirst={settings.httpsFirst}
          fingerprintDefense={settings.fingerprintDefense}
          initialInspectUrl={shieldInspectTarget?.url}
          initialInspectSnippet={shieldInspectTarget?.snippet}
          onTogglehttpsFirst={() => updateSettings({ httpsFirst: !settings.httpsFirst })}
          onToggleFingerprintDefense={() =>
            updateSettings({ fingerprintDefense: !settings.fingerprintDefense })
          }
          onToggleRule={(id) =>
            setAdRules((prev) =>
              prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
            )
          }
          onAddAiRules={(selectors) => {
            const added: AdRule[] = selectors.map((sel, i) => ({
              id: `ai-${Date.now()}-${i}`,
              pattern: sel,
              category: 'AI Rule',
              enabled: true,
              hits: 1,
              source: 'AI Shield',
            }));
            setAdRules((prev) => [...added, ...prev]);
            showToast(`Added ${added.length} AI Shield rule(s).`);
          }}
          onUpdatePermission={(origin, field, val) =>
            setPermissions((prev) =>
              prev.map((p) => (p.origin === origin ? { ...p, [field]: val } : p))
            )
          }
        />
      );
    }

    if (tab.url === 'vexora://sync') {
      return (
        <SyncView
          tabs={tabs}
          bookmarks={bookmarks}
          documents={documents}
          speedTiles={speedTiles}
          notes={notes}
          stats={stats}
          onImportSyncedState={async (payload) => {
            if (payload.bookmarks) setBookmarks(payload.bookmarks);
            if (payload.speedTiles) setSpeedTiles(payload.speedTiles);
            if (typeof payload.notes === 'string') setNotes(payload.notes);
            if (payload.documents) {
              setDocuments(payload.documents);
              if (isVaultUnlocked) {
                const bundle = await saveEncryptedIndex(payload.documents, passphrase);
                setEncryptedBundle(bundle);
              }
            }
          }}
        />
      );
    }

    if (tab.url === 'vexora://architecture') {
      return (
        <ArchitectureView
          enableContextualSponsors={settings.enableContextualSponsors}
          onToggleContextualSponsors={() =>
            updateSettings({
              enableContextualSponsors: !settings.enableContextualSponsors,
            })
          }
          onNavigate={(u) => navigateTab(tab.id, u)}
        />
      );
    }

    // Live web URL via Vexora's sandboxed proxy engine (with optional Focus Blocker pause)
    const dom = extractDomain(tab.url);
    const isDistracting =
      focusModeActive &&
      DISTRACTING_HOSTS.some((h) => dom === h || dom.endsWith(`.${h}`));

    if (isDistracting) {
      return (
        <div className="h-full flex items-center justify-center bg-[var(--bg)] text-[var(--fg)] p-8">
          <div className="max-w-md w-full rounded-2xl border border-[var(--line2)] bg-[var(--panel)] p-8 text-center space-y-4">
            <PauseCircle className="w-10 h-10 text-amber-400 mx-auto" />
            <h2 className="text-xl font-semibold">Paused by Vexora Focus Shield</h2>
            <p className="text-xs text-[var(--fg2)] leading-relaxed">
              <span className="font-mono text-[var(--fg)]">{dom}</span> is paused while Deep Work Focus Shield is active.
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => navigateTab(tab.id, 'vexora://dashboard')}
                className="rounded-lg border border-[var(--line2)] px-4 py-2 text-xs font-medium hover:bg-[var(--hover2)] cursor-pointer"
              >
                Return to Focus Dashboard
              </button>
              <button
                type="button"
                onClick={() => setFocusModeActive(false)}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-white cursor-pointer"
                style={{ background: 'var(--grad-soft)' }}
              >
                Turn Off Focus Shield
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <ProxyViewport
        key={tab.id}
        tab={tab}
        settings={settings}
        alreadyIndexed={documents.some((d) => d.url === tab.url)}
        findOpen={tab.id === activeTabId && findOpen}
        onCloseFind={() => setFindOpen(false)}
        onFrameMessage={handleFrameMessage}
        onCloseReader={(id) =>
          setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, readerMode: false } : t)))
        }
        onSaveReadingList={saveToReadingList}
        onIndexArticle={handleIndexReaderArticle}
        onInspectWithAiShield={handleInspectWithAiShield}
        onOpenExternal={handleOpenExternal}
      />
    );
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--bg)] text-[var(--fg)] select-none">
      {/* 1. Vexora Top Tab Bar */}
      <header className="vx-shell-bg border-b border-[var(--line)]">
        <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1">
          {/* Vexora Brand Button */}
          <button
            type="button"
            onClick={() => navigateTab(activeTab.id, '')}
            title="Vexora Home"
            className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-[var(--hover2)] shrink-0 cursor-pointer"
          >
            <img src="/assets/logo-128.png" alt="Vexora" className="w-5 h-5 object-contain" />
            <span className="hidden sm:inline font-display text-xs font-extrabold tracking-[0.2em] vx-grad-text">
              VEXORA
            </span>
          </button>

          {/* Draggable Tab Strip */}
          <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0">
            {visibleTabs.map((tab) => {
              const isActive = tab.id === activeTab.id;
              const isSplitPartner = tab.id === splitTabId;
              const dom = extractDomain(tab.url);
              return (
                <div
                  key={tab.id}
                  draggable
                  onDragStart={() => {
                    dragTabIdRef.current = tab.id;
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    const sourceId = dragTabIdRef.current;
                    dragTabIdRef.current = null;
                    if (!sourceId || sourceId === tab.id) return;
                    setTabs((prev) => {
                      const from = prev.findIndex((t) => t.id === sourceId);
                      const to = prev.findIndex((t) => t.id === tab.id);
                      if (from < 0 || to < 0) return prev;
                      const copy = [...prev];
                      const [moved] = copy.splice(from, 1);
                      copy.splice(to, 0, moved);
                      return copy;
                    });
                  }}
                  onClick={() => selectTab(tab.id)}
                  onMouseDown={(e) => {
                    if (e.button === 1) {
                      e.preventDefault();
                      closeTab(tab.id);
                    }
                  }}
                  className={`group relative flex items-center gap-2 rounded-t-xl px-3 py-1.5 text-xs transition-all cursor-pointer shrink-0 ${
                    tab.pinned ? 'max-w-[140px]' : 'min-w-[140px] max-w-[210px]'
                  } ${
                    isActive
                      ? 'bg-[var(--tab-on)] text-[var(--fg)] border border-b-0 border-[var(--line2)]'
                      : isSplitPartner
                      ? 'bg-[var(--tab-on)]/60 text-[var(--fg)] border border-b-0 border-[var(--a1)]/40'
                      : 'bg-[var(--tab)] text-[var(--fg2)] hover:bg-[var(--hover2)] border border-transparent'
                  } ${tab.isSleeping ? 'opacity-60' : ''}`}
                >
                  {isActive && (
                    <span
                      className="absolute top-0 left-3 right-3 h-[2px] rounded-full"
                      style={{ background: 'var(--grad)' }}
                    />
                  )}

                  {tab.priv ? (
                    <Shield className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  ) : dom ? (
                    <img
                      src={`/api/favicon?d=${encodeURIComponent(dom)}`}
                      alt=""
                      className="w-3.5 h-3.5 shrink-0 rounded-xs"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Layers className="w-3.5 h-3.5 text-[var(--a1)] shrink-0" />
                  )}

                  <span className="truncate flex-1 font-medium">{tab.title}</span>

                  {tab.isSleeping && (
                    <span className="text-[10px] font-mono text-amber-400 shrink-0">ZZ</span>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePinTab(tab.id);
                    }}
                    title={tab.pinned ? 'Unpin tab' : 'Pin tab'}
                    className={`p-0.5 rounded hover:bg-[var(--hover2)] shrink-0 cursor-pointer ${
                      tab.pinned ? 'text-[var(--a1)]' : 'opacity-0 group-hover:opacity-70'
                    }`}
                  >
                    <Pin className="w-3 h-3" />
                  </button>

                  {!tab.pinned && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                      title="Close tab"
                      className="p-0.5 rounded hover:bg-red-500/20 hover:text-red-400 opacity-60 group-hover:opacity-100 shrink-0 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Tab Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => openNewTab('')}
              title="New Tab (Ctrl+T)"
              className="p-1.5 rounded-lg text-[var(--fg2)] hover:text-[var(--fg)] hover:bg-[var(--hover2)] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => openNewTab('', { priv: true })}
              title="New Private Tab (No local history)"
              className="p-1.5 rounded-lg text-purple-400 hover:bg-[var(--hover2)] cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5" />
            </button>
            {closedTabs.length > 0 && (
              <button
                type="button"
                onClick={reopenClosedTab}
                title="Reopen Closed Tab (Ctrl+Shift+T)"
                className="p-1.5 rounded-lg text-[var(--fg2)] hover:text-[var(--fg)] hover:bg-[var(--hover2)] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 2. Vexora Address & Control Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--tab-on)] border-t border-[var(--line)]">
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              disabled={activeTab.historyIndex <= 0}
              onClick={() => goBack(activeTab.id)}
              title="Back"
              className="p-1.5 rounded-lg text-[var(--fg2)] hover:text-[var(--fg)] hover:bg-[var(--hover2)] disabled:opacity-30 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={activeTab.historyIndex >= activeTab.history.length - 1}
              onClick={() => goForward(activeTab.id)}
              title="Forward"
              className="p-1.5 rounded-lg text-[var(--fg2)] hover:text-[var(--fg)] hover:bg-[var(--hover2)] disabled:opacity-30 cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigateTab(activeTab.id, activeTab.url, { forceReload: true })}
              title="Reload"
              className="p-1.5 rounded-lg text-[var(--fg2)] hover:text-[var(--fg)] hover:bg-[var(--hover2)] cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => navigateTab(activeTab.id, '')}
              title="Start Page"
              className="p-1.5 rounded-lg text-[var(--fg2)] hover:text-[var(--fg)] hover:bg-[var(--hover2)] cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Omnibox */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              navigateTab(activeTab.id, omniboxValue);
            }}
            className="flex-1 min-w-0 flex items-center gap-2 rounded-full border border-[var(--line2)] bg-[var(--bg2)] px-3.5 py-1.5 focus-within:ring-2 focus-within:ring-[var(--a1)]"
          >
            {activeTab.priv ? (
              <Shield className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            ) : !phishingCheck.safe ? (
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            ) : activeTab.url.startsWith('http') ? (
              <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <Search className="w-3.5 h-3.5 text-[var(--a1)] shrink-0" />
            )}

            <input
              ref={omniboxRef}
              type="text"
              value={omniboxValue}
              onChange={(e) => setOmniboxValue(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="Search your encrypted Vexora vault or enter a URL..."
              className="flex-1 min-w-0 bg-transparent text-xs text-[var(--fg)] placeholder:text-[var(--fg3)] focus:outline-none font-mono"
            />

            {activeTab.url && (
              <button
                type="button"
                onClick={toggleBookmarkCurrent}
                title={isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
                className={`p-0.5 rounded cursor-pointer ${
                  isBookmarked ? 'text-amber-400' : 'text-[var(--fg3)] hover:text-[var(--fg)]'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-amber-400' : ''}`} />
              </button>
            )}
          </form>

          {/* Page & Engine Controls */}
          <div className="flex items-center gap-1 shrink-0">
            {activeTab.url.startsWith('http') && (
              <>
                <div className="hidden md:flex items-center rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-1">
                  <button
                    type="button"
                    onClick={() =>
                      setTabs((prev) =>
                        prev.map((t) =>
                          t.id === activeTab.id
                            ? { ...t, zoom: Math.max(0.7, Number((t.zoom - 0.1).toFixed(2))) }
                            : t
                        )
                      )
                    }
                    title="Zoom Out"
                    className="p-1 text-[var(--fg2)] hover:text-[var(--fg)] cursor-pointer"
                  >
                    <ZoomOut className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setTabs((prev) =>
                        prev.map((t) => (t.id === activeTab.id ? { ...t, zoom: 1 } : t))
                      )
                    }
                    title="Reset Zoom"
                    className="px-1.5 text-[11px] font-mono tabular-nums text-[var(--fg2)] cursor-pointer"
                  >
                    {Math.round(activeTab.zoom * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setTabs((prev) =>
                        prev.map((t) =>
                          t.id === activeTab.id
                            ? { ...t, zoom: Math.min(1.8, Number((t.zoom + 0.1).toFixed(2))) }
                            : t
                        )
                      )
                    }
                    title="Zoom In"
                    className="p-1 text-[var(--fg2)] hover:text-[var(--fg)] cursor-pointer"
                  >
                    <ZoomIn className="w-3 h-3" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setTabs((prev) =>
                      prev.map((t) => (t.id === activeTab.id ? { ...t, dark: !t.dark } : t))
                    )
                  }
                  title="Force Dark Mode on Page"
                  className={`p-1.5 rounded-lg cursor-pointer ${
                    activeTab.dark || settings.darkPages
                      ? 'bg-[var(--hover2)] text-[var(--a1)]'
                      : 'text-[var(--fg2)] hover:bg-[var(--hover2)]'
                  }`}
                >
                  {activeTab.dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => toggleReaderMode(activeTab)}
                  title="Reader Mode"
                  className={`p-1.5 rounded-lg cursor-pointer ${
                    activeTab.readerMode
                      ? 'bg-[var(--hover2)] text-[var(--a1)]'
                      : 'text-[var(--fg2)] hover:bg-[var(--hover2)]'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {/* Shield Chip */}
            <button
              type="button"
              onClick={() => navigateTab(activeTab.id, 'vexora://shield')}
              title="Open Vexora AI Shield"
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-mono tabular-nums cursor-pointer ${
                settings.shield
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-400'
                  : 'border-[var(--line)] text-[var(--fg3)]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{activeTab.blockedCount || stats.totalTrackersBlocked}</span>
            </button>

            {/* Split View */}
            <button
              type="button"
              onClick={toggleSplitView}
              title="Toggle Split View (non-destructive)"
              className={`p-1.5 rounded-lg cursor-pointer ${
                splitTabId
                  ? 'bg-[var(--hover2)] text-[var(--a1)]'
                  : 'text-[var(--fg2)] hover:bg-[var(--hover2)]'
              }`}
            >
              <Columns2 className="w-4 h-4" />
            </button>

            {/* Command Palette */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title="Command Palette (Ctrl+K)"
              className="p-1.5 rounded-lg text-[var(--fg2)] hover:text-[var(--fg)] hover:bg-[var(--hover2)] cursor-pointer"
            >
              <Command className="w-4 h-4" />
            </button>

            {/* Sidebar Toggle */}
            <button
              type="button"
              onClick={() => setSidebarOpen((o) => !o)}
              title="Toggle Sidebar (Ctrl+B)"
              className="p-1.5 rounded-lg text-[var(--fg2)] hover:text-[var(--fg)] hover:bg-[var(--hover2)] cursor-pointer"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4" />
              )}
            </button>

            {/* Browser Update Available */}
            <ToolbarUpdateButton />

            {/* Get / Install Vexora App */}
            <PWAInstallButton compact />

            {/* Settings Modal */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="Vexora Settings (Ctrl+,)"
              className="p-1.5 rounded-lg text-[var(--fg2)] hover:text-[var(--fg)] hover:bg-[var(--hover2)] cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3. Bookmarks Bar */}
        {settings.bmbar && bookmarks.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--panel)] border-t border-[var(--line)] overflow-x-auto no-scrollbar">
            {bookmarks.map((bm) => {
              const dom = extractDomain(bm.url);
              return (
                <button
                  key={bm.id}
                  type="button"
                  onClick={() => navigateTab(activeTab.id, bm.url)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--fg2)] hover:text-[var(--fg)] hover:bg-[var(--hover2)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {dom ? (
                    <img
                      src={`/api/favicon?d=${encodeURIComponent(dom)}`}
                      alt=""
                      className="w-3.5 h-3.5 rounded-xs"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Layers className="w-3 h-3 text-[var(--a1)]" />
                  )}
                  {bm.title}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* 4. Main Workspace Body (Sidebar + Viewport / Split Viewport) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {sidebarOpen && (
          <aside className="w-72 shrink-0 border-r border-[var(--line)] bg-[var(--panel)] flex flex-col min-h-0">
            {/* Sidebar Section Selector */}
            <div className="grid grid-cols-5 border-b border-[var(--line)] p-1.5 gap-1">
              {(
                [
                  ['workspaces', Layers, 'Workspaces'],
                  ['bookmarks', Bookmark, 'Bookmarks'],
                  ['history', History, 'History'],
                  ['reading', BookOpen, 'Reading'],
                  ['notes', NotebookPen, 'Notes'],
                ] as Array<[SidebarSection, React.ElementType, string]>
              ).map(([id, Icon, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSidebarSection(id)}
                  title={label}
                  className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium cursor-pointer ${
                    sidebarSection === id
                      ? 'bg-[var(--hover2)] text-[var(--a1)]'
                      : 'text-[var(--fg3)] hover:text-[var(--fg)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
              {sidebarSection === 'workspaces' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--fg2)]">Tab Workspaces</span>
                    <button
                      type="button"
                      onClick={hibernateIdleTabs}
                      className="rounded-md border border-[var(--line2)] px-2 py-1 text-[11px] text-[var(--fg2)] hover:text-[var(--fg)] hover:bg-[var(--hover2)] cursor-pointer"
                    >
                      Sleep Idle
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setGroupFilter('all')}
                      className={`rounded-md px-2 py-1 text-[11px] cursor-pointer ${
                        groupFilter === 'all'
                          ? 'bg-[var(--hover2)] text-[var(--a1)] font-semibold'
                          : 'text-[var(--fg3)] hover:bg-[var(--hover)]'
                      }`}
                    >
                      All ({tabs.length})
                    </button>
                    {TAB_GROUPS.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setGroupFilter(g.id)}
                        className={`rounded-md px-2 py-1 text-[11px] cursor-pointer ${
                          groupFilter === g.id
                            ? 'bg-[var(--hover2)] text-[var(--a1)] font-semibold'
                            : 'text-[var(--fg3)] hover:bg-[var(--hover)]'
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1 pt-1">
                    {tabs
                      .filter((t) => groupFilter === 'all' || t.groupId === groupFilter)
                      .map((t) => (
                        <div
                          key={t.id}
                          onClick={() => selectTab(t.id)}
                          className={`rounded-lg border px-2.5 py-2 flex items-center justify-between gap-2 cursor-pointer ${
                            t.id === activeTab.id
                              ? 'border-[var(--a1)]/50 bg-[var(--hover2)]'
                              : 'border-[var(--line)] hover:bg-[var(--hover)]'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">{t.title}</div>
                            <div className="text-[10px] font-mono text-[var(--fg3)] truncate">
                              {t.groupId} · {t.isSleeping ? 'Hibernated (4 MB)' : `${t.memoryMb} MB`}
                            </div>
                          </div>
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              t.isSleeping ? 'bg-amber-400' : 'bg-emerald-400'
                            }`}
                          />
                        </div>
                      ))}
                  </div>

                  <div className="pt-2 border-t border-[var(--line)] space-y-1.5">
                    <div className="text-[11px] font-semibold text-[var(--fg3)]">
                      Vexora Engine Routes
                    </div>
                    {[
                      ['vexora://search', 'Encrypted Search Vault'],
                      ['vexora://dashboard', 'Focus & Habits Dashboard'],
                      ['vexora://shield', 'AI Ad & Tracker Shield'],
                      ['vexora://sync', 'Zero-Knowledge Sync'],
                      ['vexora://architecture', 'App & Ad Monetization'],
                    ].map(([route, name]) => (
                      <button
                        key={route}
                        type="button"
                        onClick={() => navigateTab(activeTab.id, route)}
                        className="w-full text-left rounded-lg px-2.5 py-1.5 text-[var(--fg2)] hover:bg-[var(--hover2)] hover:text-[var(--fg)] flex items-center justify-between cursor-pointer"
                      >
                        <span>{name}</span>
                        <SlidersHorizontal className="w-3 h-3 opacity-50" />
                      </button>
                    ))}
                  </div>
                </>
              )}

              {sidebarSection === 'bookmarks' && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={sidebarQuery}
                      onChange={(e) => setSidebarQuery(e.target.value)}
                      placeholder="Filter bookmarks..."
                      className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-2.5 py-1.5 text-xs text-[var(--fg)]"
                    />
                    <button
                      type="button"
                      onClick={toggleBookmarkCurrent}
                      className="rounded-lg border border-[var(--line2)] px-2 py-1.5 text-[11px] hover:bg-[var(--hover2)] cursor-pointer shrink-0"
                    >
                      + Page
                    </button>
                  </div>

                  <div className="space-y-1">
                    {bookmarks
                      .filter(
                        (b) =>
                          !sidebarQuery.trim() ||
                          b.title.toLowerCase().includes(sidebarQuery.toLowerCase()) ||
                          b.url.toLowerCase().includes(sidebarQuery.toLowerCase())
                      )
                      .map((bm) => (
                        <div
                          key={bm.id}
                          className="group rounded-lg px-2.5 py-2 hover:bg-[var(--hover2)] flex items-center justify-between gap-2 cursor-pointer"
                          onClick={() => navigateTab(activeTab.id, bm.url)}
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">{bm.title}</div>
                            <div className="text-[10px] font-mono text-[var(--fg3)] truncate">
                              {bm.url}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setBookmarks((prev) => prev.filter((x) => x.id !== bm.id));
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-[var(--fg3)] hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                  </div>
                </>
              )}

              {sidebarSection === 'history' && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={sidebarQuery}
                      onChange={(e) => setSidebarQuery(e.target.value)}
                      placeholder="Filter history..."
                      className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-2.5 py-1.5 text-xs text-[var(--fg)]"
                    />
                    <button
                      type="button"
                      onClick={() => setHistoryItems([])}
                      className="rounded-lg border border-red-500/30 px-2 py-1.5 text-[11px] text-red-400 cursor-pointer shrink-0"
                    >
                      Clear
                    </button>
                  </div>

                  {historyItems.length === 0 ? (
                    <div className="py-10 text-center text-[var(--fg3)]">
                      No web history recorded yet. Private tabs never log entries.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {historyItems
                        .filter(
                          (h) =>
                            !sidebarQuery.trim() ||
                            h.title.toLowerCase().includes(sidebarQuery.toLowerCase()) ||
                            h.url.toLowerCase().includes(sidebarQuery.toLowerCase())
                        )
                        .map((item, idx) => (
                          <button
                            key={`${item.url}-${idx}`}
                            type="button"
                            onClick={() => navigateTab(activeTab.id, item.url)}
                            className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-[var(--hover2)] cursor-pointer"
                          >
                            <div className="font-medium truncate">{item.title}</div>
                            <div className="text-[10px] font-mono text-[var(--fg3)] truncate">
                              {item.url}
                            </div>
                          </button>
                        ))}
                    </div>
                  )}
                </>
              )}

              {sidebarSection === 'reading' && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--fg2)]">
                      Saved Articles ({readingList.length})
                    </span>
                    <button
                      type="button"
                      disabled={!activeTab.url.startsWith('http')}
                      onClick={() => saveToReadingList(activeTab)}
                      className="rounded-lg border border-[var(--line2)] px-2.5 py-1 text-[11px] disabled:opacity-40 cursor-pointer"
                    >
                      + Save Page
                    </button>
                  </div>

                  {readingList.length === 0 ? (
                    <div className="py-10 text-center text-[var(--fg3)]">
                      Save any live page to open it cleanly in Vexora Reader Mode.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {readingList.map((item) => (
                        <div
                          key={item.id}
                          onClick={() =>
                            openNewTab(item.url, { readerMode: true, groupId: 'reading' })
                          }
                          className="group rounded-lg border border-[var(--line)] p-2.5 hover:bg-[var(--hover2)] cursor-pointer flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">{item.title}</div>
                            <div className="text-[10px] font-mono text-[var(--fg3)] truncate">
                              {extractDomain(item.url)} · Opens in Reader
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReadingList((prev) => prev.filter((r) => r.id !== item.id));
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-[var(--fg3)] hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {sidebarSection === 'notes' && (
                <div className="h-full flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--fg2)]">Local Scratchpad</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const link = `\n- ${activeTab.title}: ${activeTab.url || 'vexora://newtab'}`;
                          setNotes((n) => `${n}${link}`.trimStart());
                        }}
                        title="Insert current page link"
                        className="rounded border border-[var(--line)] px-2 py-1 text-[11px] hover:bg-[var(--hover2)] cursor-pointer inline-flex items-center gap-1"
                      >
                        <FileText className="w-3 h-3" />
                        Link
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(notes);
                          showToast('Notes copied to clipboard.');
                        }}
                        title="Copy notes"
                        className="rounded border border-[var(--line)] px-2 py-1 text-[11px] hover:bg-[var(--hover2)] cursor-pointer inline-flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        Copy
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Jot down research notes — autosaved locally and included in Vexora Zero-Knowledge Sync..."
                    className="flex-1 min-h-[260px] w-full rounded-xl border border-[var(--line)] bg-[var(--bg2)] p-3 text-xs text-[var(--fg)] leading-relaxed resize-none focus:outline-none focus:border-[var(--a1)]"
                  />
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Primary & Split Viewports */}
        <main className="flex-1 flex min-w-0 min-h-0 overflow-hidden">
          <section className="flex-1 min-w-0 h-full overflow-auto">
            {renderTabViewport(activeTab)}
          </section>

          {splitTab && (
            <section className="flex-1 min-w-0 h-full overflow-auto border-l-2 border-[var(--a1)]/40 flex flex-col">
              <div className="flex items-center justify-between bg-[var(--panel)] border-b border-[var(--line)] px-3 py-1 text-[11px]">
                <span className="font-mono text-[var(--fg2)] truncate">
                  Split Pane: {splitTab.title}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <select
                    value={splitTab.id}
                    onChange={(e) => setSplitTabId(e.target.value)}
                    className="rounded border border-[var(--line)] bg-[var(--bg2)] px-1.5 py-0.5 text-[11px] text-[var(--fg)]"
                  >
                    {tabs
                      .filter((t) => t.id !== activeTab.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setSplitTabId(null)}
                    className="p-0.5 text-[var(--fg3)] hover:text-[var(--fg)] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">{renderTabViewport(splitTab)}</div>
            </section>
          )}
        </main>
      </div>

      {/* Modals & Toast */}
      <CommandPalette
        open={paletteOpen}
        tabs={tabs}
        isDark={settings.theme !== 'daylight'}
        onClose={() => setPaletteOpen(false)}
        onSelectTab={selectTab}
        onNavigate={(u) => navigateTab(activeTab.id, u)}
        onSearch={(q) => navigateTab(activeTab.id, 'vexora://search', { searchQuery: q })}
        onToggleTheme={() =>
          updateSettings({
            theme:
              settings.theme === 'midnight'
                ? 'abyss'
                : settings.theme === 'abyss'
                ? 'daylight'
                : 'midnight',
          })
        }
        onHibernateIdle={hibernateIdleTabs}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        statsSummary={{
          bookmarks: bookmarks.length,
          history: historyItems.length,
          reading: readingList.length,
          blocked: stats.totalTrackersBlocked,
          indexedDocs: documents.length,
        }}
        onClose={() => setSettingsOpen(false)}
        onUpdateSettings={updateSettings}
        onClearHistory={() => {
          setHistoryItems([]);
          showToast('Browsing history cleared.');
        }}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onResetAll={handleResetAll}
      />

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-full border border-[var(--line2)] bg-[var(--glass)] backdrop-blur-md px-4 py-2 text-xs font-medium text-[var(--fg)] shadow-xl flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-[var(--a1)]" />
          <span>{toast}</span>
        </div>
      )}

      <OfflineIndicator />
      <BrowserUpdateBanner />
    </div>
  );
}
