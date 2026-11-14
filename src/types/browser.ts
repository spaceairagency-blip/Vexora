export type TabGroupId = 'engineering' | 'research' | 'reading' | 'personal';

export type VexoraTheme = 'midnight' | 'abyss' | 'daylight';
export type VexoraAccent = 'vexora' | 'sunset' | 'mint' | 'rose' | 'mono';
export type VexoraWallpaper = 'aurora' | 'ocean' | 'grid' | 'none';

export interface VexoraSettings {
  theme: VexoraTheme;
  accent: VexoraAccent;
  wallpaper: VexoraWallpaper;
  shield: boolean;
  darkPages: boolean;
  httpsFirst: boolean;
  fingerprintDefense: boolean;
  bmbar: boolean;
  tiles: boolean;
  cards: boolean;
  clock24: boolean;
  enableContextualSponsors: boolean;
}

export interface ReaderArticle {
  title: string;
  byline: string;
  site: string;
  html: string;
  textPreview?: string;
  words: number;
  minutes: number;
  url: string;
}

export interface BrowserTab {
  id: string;
  url: string; // '' or 'vexora://newtab' = Start Page; 'vexora://...' = internal engine; 'https://...' = displayed omnibox URL
  frameUrl?: string; // Explicit navigation URL driving the ProxyViewport iframe without reloading on redirects/pushState
  reloadNonce?: number; // Incremented on explicit manual reload
  title: string;
  groupId: TabGroupId;
  pinned: boolean;
  priv: boolean;
  isSleeping: boolean;
  memoryMb: number;
  lastActiveAt: number;
  history: Array<{ url: string; title: string }>;
  historyIndex: number;
  processId: string;
  blockedCount: number;
  blockedHosts: string[];
  zoom: number;
  dark: boolean;
  readerMode: boolean;
  readerData: ReaderArticle | null;
  loading?: boolean;
  error?: boolean;
  searchQuery?: string;
}

export interface IndexedDocument {
  id: string;
  url: string;
  title: string;
  snippet: string;
  keywords: string[];
  category: string;
  indexedAt: string;
  source: 'seed' | 'crawled' | 'note';
}

export interface SearchResult {
  doc: IndexedDocument;
  score: number;
  matchedTerms: string[];
}

export interface EncryptedBundle {
  salt: string;
  iv: string;
  ciphertext: string;
  algorithm: 'AES-256-GCM';
  createdAt: string;
}

export interface DomainStat {
  domain: string;
  visits: number;
  minutes: number;
  trackersBlocked: number;
  category: 'Focus' | 'Research' | 'Reference' | 'Social';
  lastVisitedAt: string;
}

export interface ProductivityLog {
  day: string;
  focusMinutes: number;
  browsingMinutes: number;
  trackersBlocked: number;
}

export interface BrowserStats {
  totalSearches: number;
  totalPagesVisited: number;
  totalTrackersBlocked: number;
  totalRamSavedMb: number;
  focusSessionsCompleted: number;
  focusStreakDays: number;
  domainStats: DomainStat[];
  dailyLogs: ProductivityLog[];
}

export interface AdRule {
  id: string;
  pattern: string;
  category: 'Ad Network' | 'Tracker' | 'Dark Pattern' | 'Fingerprinter' | 'AI Rule';
  enabled: boolean;
  hits: number;
  source: 'Built-in' | 'AI Shield';
}

export interface OriginPermission {
  origin: string;
  camera: 'deny' | 'ask' | 'allow';
  microphone: 'deny' | 'ask' | 'allow';
  location: 'deny' | 'ask' | 'allow';
  cookies: 'partitioned' | 'block_all';
  fingerprintNoise: boolean;
}

export interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  groupId: TabGroupId;
}

export interface HistoryItem {
  url: string;
  title: string;
  t: number;
}

export interface ReadingItem {
  id: string;
  url: string;
  title: string;
  added: number;
  read?: boolean;
}

export interface SpeedTile {
  title: string;
  url: string;
}

export interface ContextualSponsor {
  id: string;
  title: string;
  domain: string;
  url: string;
  summary: string;
  keywords: string[];
  placement: 'search' | 'newtab';
  cpmNote: string;
}
