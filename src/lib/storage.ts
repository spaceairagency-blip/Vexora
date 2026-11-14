import type {
  BookmarkItem,
  BrowserStats,
  BrowserTab,
  HistoryItem,
  ReadingItem,
  SpeedTile,
  TabGroupId,
  VexoraSettings,
} from '../types/browser';

export const TAB_GROUPS: Array<{ id: TabGroupId; label: string }> = [
  { id: 'engineering', label: 'Engineering' },
  { id: 'research', label: 'Research' },
  { id: 'reading', label: 'Reading' },
  { id: 'personal', label: 'Personal' },
];

export const DEFAULT_SETTINGS: VexoraSettings = {
  theme: 'midnight',
  accent: 'vexora',
  wallpaper: 'aurora',
  shield: true,
  darkPages: false,
  httpsFirst: true,
  fingerprintDefense: true,
  bmbar: true,
  tiles: true,
  cards: true,
  clock24: false,
  enableContextualSponsors: false,
};

export const DEFAULT_SPEED_TILES: SpeedTile[] = [
  { title: 'YouTube', url: 'https://www.youtube.com/' },
  { title: 'Facebook', url: 'https://www.facebook.com/' },
  { title: 'WhatsApp Web', url: 'https://web.whatsapp.com/' },
  { title: 'Instagram', url: 'https://www.instagram.com/' },
  { title: 'Wikipedia', url: 'https://en.wikipedia.org/' },
  { title: 'Hacker News', url: 'https://news.ycombinator.com/' },
  { title: 'MDN Web Docs', url: 'https://developer.mozilla.org/' },
  { title: 'Internet Archive', url: 'https://archive.org/' },
  { title: 'Private Search', url: 'vexora://search' },
  { title: 'Focus Dashboard', url: 'vexora://dashboard' },
  { title: 'AI Shield', url: 'vexora://shield' },
  { title: 'Encrypted Sync', url: 'vexora://sync' },
];

export const INITIAL_BOOKMARKS: BookmarkItem[] = [
  { id: 'bm-search', title: 'Private Search', url: 'vexora://search', groupId: 'research' },
  { id: 'bm-dashboard', title: 'Focus & Stats', url: 'vexora://dashboard', groupId: 'personal' },
  { id: 'bm-shield', title: 'AI Ad Shield', url: 'vexora://shield', groupId: 'engineering' },
  { id: 'bm-sync', title: 'Encrypted Sync', url: 'vexora://sync', groupId: 'personal' },
  { id: 'bm-arch', title: 'App & Ad Model', url: 'vexora://architecture', groupId: 'research' },
  { id: 'bm-wiki', title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Internet_privacy', groupId: 'reading' },
  { id: 'bm-hn', title: 'Hacker News', url: 'https://news.ycombinator.com/', groupId: 'engineering' },
];

export const INITIAL_TABS: BrowserTab[] = [
  {
    id: 'tab-start',
    url: '',
    title: 'New Tab',
    groupId: 'personal',
    pinned: false,
    priv: false,
    isSleeping: false,
    memoryMb: 26,
    lastActiveAt: Date.now(),
    history: [],
    historyIndex: -1,
    processId: 'pid-1001',
    blockedCount: 0,
    blockedHosts: [],
    zoom: 1,
    dark: false,
    readerMode: false,
    readerData: null,
  },
];

export const INITIAL_STATS: BrowserStats = {
  totalSearches: 14,
  totalPagesVisited: 27,
  totalTrackersBlocked: 152,
  totalRamSavedMb: 418,
  focusSessionsCompleted: 6,
  focusStreakDays: 5,
  domainStats: [
    {
      domain: 'developer.mozilla.org',
      visits: 11,
      minutes: 94,
      trackersBlocked: 18,
      category: 'Focus',
      lastVisitedAt: 'Today, 10:40',
    },
    {
      domain: 'en.wikipedia.org',
      visits: 7,
      minutes: 48,
      trackersBlocked: 4,
      category: 'Research',
      lastVisitedAt: 'Today, 09:15',
    },
    {
      domain: 'news.ycombinator.com',
      visits: 6,
      minutes: 31,
      trackersBlocked: 0,
      category: 'Reference',
      lastVisitedAt: 'Yesterday',
    },
    {
      domain: 'social-feed.example',
      visits: 3,
      minutes: 14,
      trackersBlocked: 130,
      category: 'Social',
      lastVisitedAt: 'Yesterday',
    },
  ],
  dailyLogs: [
    { day: 'Mon', focusMinutes: 145, browsingMinutes: 42, trackersBlocked: 28 },
    { day: 'Tue', focusMinutes: 180, browsingMinutes: 35, trackersBlocked: 34 },
    { day: 'Wed', focusMinutes: 160, browsingMinutes: 50, trackersBlocked: 19 },
    { day: 'Thu', focusMinutes: 210, browsingMinutes: 28, trackersBlocked: 41 },
    { day: 'Fri', focusMinutes: 173, browsingMinutes: 31, trackersBlocked: 30 },
  ],
};

const KEYS = {
  settings: 'vexora_settings_v2',
  stats: 'vexora_stats_v2',
  bookmarks: 'vexora_bookmarks_v2',
  history: 'vexora_history_v2',
  reading: 'vexora_reading_v2',
  notes: 'vexora_notes_v2',
  speed: 'vexora_speed_v2',
};

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export const loadSettings = (): VexoraSettings => ({
  ...DEFAULT_SETTINGS,
  ...loadJson<Partial<VexoraSettings>>(KEYS.settings, {}),
});
export const saveSettings = (s: VexoraSettings) => saveJson(KEYS.settings, s);

export const loadBrowserStats = (): BrowserStats =>
  loadJson<BrowserStats>(KEYS.stats, INITIAL_STATS);
export const saveBrowserStats = (s: BrowserStats) => saveJson(KEYS.stats, s);

export const loadBookmarks = (): BookmarkItem[] =>
  loadJson<BookmarkItem[]>(KEYS.bookmarks, INITIAL_BOOKMARKS);
export const saveBookmarks = (b: BookmarkItem[]) => saveJson(KEYS.bookmarks, b);

export const loadHistory = (): HistoryItem[] =>
  loadJson<HistoryItem[]>(KEYS.history, []);
export const saveHistory = (h: HistoryItem[]) => saveJson(KEYS.history, h);

export const loadReading = (): ReadingItem[] =>
  loadJson<ReadingItem[]>(KEYS.reading, []);
export const saveReading = (r: ReadingItem[]) => saveJson(KEYS.reading, r);

export const loadNotes = (): string =>
  loadJson<string>(KEYS.notes, '');
export const saveNotes = (n: string) => saveJson(KEYS.notes, n);

export const loadSpeedTiles = (): SpeedTile[] =>
  loadJson<SpeedTile[]>(KEYS.speed, DEFAULT_SPEED_TILES);
export const saveSpeedTiles = (t: SpeedTile[]) => saveJson(KEYS.speed, t);
