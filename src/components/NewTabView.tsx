import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Globe,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { matchContextualSponsor } from '../lib/searchEngine';
import type {
  BrowserStats,
  SpeedTile,
  VexoraSettings,
} from '../types/browser';

interface NewTabViewProps {
  stats: BrowserStats;
  settings: VexoraSettings;
  indexedCount: number;
  isVaultUnlocked: boolean;
  speedTiles: SpeedTile[];
  bookmarksCount: number;
  onNavigate: (url: string) => void;
  onSearch: (query: string) => void;
  onAddSpeedTile: (tile: SpeedTile) => void;
  onRemoveSpeedTile: (index: number) => void;
}

export const NewTabView: React.FC<NewTabViewProps> = ({
  stats,
  settings,
  indexedCount,
  isVaultUnlocked,
  speedTiles,
  bookmarksCount,
  onNavigate,
  onSearch,
  onAddSpeedTile,
  onRemoveSpeedTile,
}) => {
  const [query, setQuery] = useState('');
  const [nowDate, setNowDate] = useState(() => new Date());
  const [addingTile, setAddingTile] = useState(false);
  const [tileTitle, setTileTitle] = useState('');
  const [tileUrl, setTileUrl] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNowDate(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hour = nowDate.getHours();
  const greeting =
    hour < 5
      ? 'Still up'
      : hour < 12
      ? 'Good morning'
      : hour < 18
      ? 'Good afternoon'
      : 'Good evening';

  const rawHour = settings.clock24 ? hour : hour % 12 || 12;
  const hourStr = String(rawHour).padStart(2, '0');
  const minStr = String(nowDate.getMinutes()).padStart(2, '0');
  const secStr = String(nowDate.getSeconds()).padStart(2, '0');
  const periodStr = settings.clock24 ? '' : hour >= 12 ? 'PM' : 'AM';

  const dateStr = nowDate.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const sponsor = settings.enableContextualSponsors
    ? matchContextualSponsor('', 'newtab')
    : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    if (
      /^https?:\/\//i.test(trimmed) ||
      /^vexora:\/\//i.test(trimmed) ||
      (!trimmed.includes(' ') && /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#:].*)?$/i.test(trimmed))
    ) {
      onNavigate(trimmed);
    } else {
      onSearch(trimmed);
    }
  };

  const handleSaveTile = (e: React.FormEvent) => {
    e.preventDefault();
    const url = tileUrl.trim();
    if (!url) return;
    const normalized =
      /^https?:\/\//i.test(url) || /^vexora:\/\//i.test(url) ? url : `https://${url}`;
    let fallbackName = normalized;
    try {
      fallbackName = new URL(normalized).hostname.replace(/^www\./, '');
    } catch {
      // ignore
    }
    onAddSpeedTile({
      title: tileTitle.trim() || fallbackName,
      url: normalized,
    });
    setTileTitle('');
    setTileUrl('');
    setAddingTile(false);
  };

  return (
    <div className="relative min-h-full overflow-y-auto bg-[var(--bg)] text-[var(--fg)]">
      {/* Vexora Animated Wallpaper */}
      <div className="vx-wp" data-wp={settings.wallpaper}>
        <i />
        <i />
        <i />
      </div>

      <div className="relative mx-auto max-w-4xl px-6 py-10 md:py-14 flex flex-col items-center text-center">
        <img
          src="/assets/logo-full.png"
          alt="Vexora"
          className="vx-logo-bob w-44 md:w-52 h-auto object-contain"
        />
        <h1 className="mt-1 font-display text-3xl md:text-4xl font-extrabold tracking-[0.34em] pl-[0.34em] vx-grad-text">
          VEXORA
        </h1>

        <div className="mt-4 inline-flex items-baseline gap-1 font-display tabular-nums tracking-tight">
          <span className="text-4xl md:text-5xl font-light">
            {hourStr}:{minStr}
          </span>
          <span className="text-2xl md:text-3xl font-mono font-normal text-[var(--a1)] opacity-85">
            :{secStr}
          </span>
          {periodStr && (
            <span className="ml-1.5 text-sm md:text-base font-medium tracking-wider text-[var(--fg3)]">
              {periodStr}
            </span>
          )}
        </div>
        <div className="mt-1.5 text-sm text-[var(--fg2)]">
          {greeting} · {dateStr}
        </div>

        {/* Private Encrypted Search Form */}
        <form onSubmit={handleSubmit} className="mt-7 w-full max-w-2xl">
          <div className="flex items-center gap-2 rounded-full border border-[var(--line2)] bg-[var(--glass)] backdrop-blur-md px-4 py-2 shadow-lg focus-within:ring-2 focus-within:ring-[var(--a1)]">
            <Search className="w-4 h-4 text-[var(--fg3)] shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your encrypted Vexora index or enter a URL..."
              className="flex-1 min-w-0 bg-transparent py-1.5 text-sm text-[var(--fg)] placeholder:text-[var(--fg3)] focus:outline-none"
            />
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-[var(--fg3)] font-mono shrink-0">
              <Lock className="w-3 h-3 text-emerald-400" />
              {isVaultUnlocked ? `${indexedCount} docs` : 'Locked'}
            </span>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-white shrink-0 whitespace-nowrap cursor-pointer"
              style={{ background: 'var(--grad-soft)' }}
            >
              Go
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        {/* Speed Dial Tiles */}
        {settings.tiles && (
          <div className="mt-8 w-full">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {speedTiles.map((tile, idx) => {
                let domain = '';
                try {
                  if (tile.url.startsWith('http')) {
                    domain = new URL(tile.url).hostname;
                  }
                } catch {
                  // internal route
                }
                return (
                  <div
                    key={`${tile.url}-${idx}`}
                    onClick={() => onNavigate(tile.url)}
                    className="group relative flex flex-col items-center gap-2.5 rounded-2xl border border-[var(--line)] bg-[var(--glass)] backdrop-blur-md p-4 hover:border-[var(--line2)] hover:-translate-y-0.5 transition-all cursor-pointer"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveSpeedTile(idx);
                      }}
                      title="Remove shortcut"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded-md text-[var(--fg3)] hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--hover2)] border border-[var(--line)] overflow-hidden">
                      {domain ? (
                        <img
                          src={`/api/favicon?d=${encodeURIComponent(domain)}`}
                          alt=""
                          className="w-5 h-5 object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <Layers className="w-4 h-4 text-[var(--a1)]" />
                      )}
                    </div>
                    <span className="text-xs font-medium text-[var(--fg2)] truncate max-w-full">
                      {tile.title}
                    </span>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => setAddingTile((v) => !v)}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--line2)] p-4 text-[var(--fg3)] hover:text-[var(--a1)] hover:border-[var(--a1)] transition-colors cursor-pointer min-h-[100px]"
              >
                <Plus className="w-5 h-5" />
                <span className="text-xs font-medium">Add Shortcut</span>
              </button>
            </div>

            {addingTile && (
              <form
                onSubmit={handleSaveTile}
                className="mt-3 rounded-2xl border border-[var(--line2)] bg-[var(--panel)] p-4 flex flex-col sm:flex-row gap-2 text-left"
              >
                <input
                  type="text"
                  value={tileTitle}
                  onChange={(e) => setTileTitle(e.target.value)}
                  placeholder="Shortcut name"
                  className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-3 py-2 text-xs text-[var(--fg)]"
                />
                <input
                  type="text"
                  required
                  value={tileUrl}
                  onChange={(e) => setTileUrl(e.target.value)}
                  placeholder="URL (e.g. developer.mozilla.org)"
                  className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-3 py-2 text-xs text-[var(--fg)]"
                />
                <button
                  type="submit"
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                  style={{ background: 'var(--grad-soft)' }}
                >
                  Save
                </button>
              </form>
            )}
          </div>
        )}

        {/* Stats Cards */}
        {settings.cards && (
          <div className="mt-7 w-full grid grid-cols-2 md:grid-cols-4 gap-3 text-left">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--glass)] backdrop-blur-md p-4">
              <div className="text-2xl font-bold font-mono tabular-nums vx-grad-text">
                {stats.totalTrackersBlocked.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-[var(--fg3)]">Trackers blocked</div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--glass)] backdrop-blur-md p-4">
              <div className="text-2xl font-bold font-mono tabular-nums vx-grad-text">
                {stats.totalPagesVisited.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-[var(--fg3)]">Pages visited</div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--glass)] backdrop-blur-md p-4">
              <div className="text-2xl font-bold font-mono tabular-nums vx-grad-text">
                {stats.totalRamSavedMb} MB
              </div>
              <div className="mt-1 text-xs text-[var(--fg3)]">RAM reclaimed</div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--glass)] backdrop-blur-md p-4">
              <div className="text-2xl font-bold font-mono tabular-nums vx-grad-text">
                {bookmarksCount}
              </div>
              <div className="mt-1 text-xs text-[var(--fg3)]">Bookmarks saved</div>
            </div>
          </div>
        )}

        {/* Vexora Engine Suite Links */}
        <div className="mt-7 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-left">
          {[
            {
              title: 'Encrypted Search',
              desc: 'Local AES-256-GCM index',
              url: 'vexora://search',
              icon: Search,
            },
            {
              title: 'Focus Dashboard',
              desc: 'Habits, stats & Pomodoro',
              url: 'vexora://dashboard',
              icon: BarChart3,
            },
            {
              title: 'AI Ad Shield',
              desc: 'Gemini filter synthesis',
              url: 'vexora://shield',
              icon: ShieldCheck,
            },
            {
              title: 'Zero-Knowledge Sync',
              desc: 'Cross-device vault relay',
              url: 'vexora://sync',
              icon: RefreshCw,
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.url}
                type="button"
                onClick={() => onNavigate(card.url)}
                className="rounded-2xl border border-[var(--line)] bg-[var(--glass)] p-4 hover:border-[var(--a1)] transition-colors text-left cursor-pointer"
              >
                <Icon className="w-4 h-4 text-[var(--a1)]" />
                <div className="mt-2 text-xs font-semibold text-[var(--fg)]">
                  {card.title}
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--fg3)]">{card.desc}</div>
              </button>
            );
          })}
        </div>

        {/* Opt-In Privacy-First Contextual Sponsor Slot */}
        {sponsor && (
          <div className="mt-6 w-full rounded-2xl border border-[var(--line2)] bg-[var(--panel)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left">
            <div>
              <div className="text-[11px] text-[var(--fg3)]">
                <span className="font-semibold text-[var(--a1)]">Contextual Sponsor Preview</span>
                {' · '}
                {sponsor.cpmNote}
              </div>
              <div className="mt-0.5 text-sm font-semibold text-[var(--fg)]">
                {sponsor.title}
              </div>
              <div className="text-xs text-[var(--fg2)]">{sponsor.summary}</div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate(sponsor.url)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line2)] px-3.5 py-2 text-xs font-medium text-[var(--fg)] hover:bg-[var(--hover2)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              Open
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
