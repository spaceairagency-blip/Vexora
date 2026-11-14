import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Globe, Lock, Moon, Search, ShieldCheck, Sun, X } from 'lucide-react';
import type { BrowserTab } from '../types/browser';

interface CommandPaletteProps {
  open: boolean;
  tabs: BrowserTab[];
  isDark: boolean;
  onClose: () => void;
  onSelectTab: (tabId: string) => void;
  onNavigate: (url: string) => void;
  onSearch: (query: string) => void;
  onToggleTheme: () => void;
  onHibernateIdle: () => void;
  onOpenSettings: () => void;
}

const INTERNAL_ROUTES = [
  { label: 'Vexora Start Page', url: 'vexora://newtab' },
  { label: 'Vexora Private Encrypted Search', url: 'vexora://search' },
  { label: 'Productivity & Focus Dashboard', url: 'vexora://dashboard' },
  { label: 'Vexora AI Ad & Security Shield', url: 'vexora://shield' },
  { label: 'Zero-Knowledge Cross-Device Sync', url: 'vexora://sync' },
  { label: 'App & Ethical Ad Architecture', url: 'vexora://architecture' },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  tabs,
  isDark,
  onClose,
  onSelectTab,
  onNavigate,
  onSearch,
  onToggleTheme,
  onHibernateIdle,
  onOpenSettings,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const tabMode = query.trim().startsWith('@');
  const cleanQ = (tabMode ? query.trim().slice(1) : query.trim()).toLowerCase();

  const filteredTabs = useMemo(() => {
    if (!cleanQ) return tabs;
    return tabs.filter(
      (t) =>
        t.title.toLowerCase().includes(cleanQ) ||
        t.url.toLowerCase().includes(cleanQ) ||
        t.groupId.toLowerCase().includes(cleanQ)
    );
  }, [tabs, cleanQ]);

  const filteredRoutes = useMemo(() => {
    if (tabMode) return [];
    if (!cleanQ) return INTERNAL_ROUTES;
    return INTERNAL_ROUTES.filter(
      (r) => r.label.toLowerCase().includes(cleanQ) || r.url.toLowerCase().includes(cleanQ)
    );
  }, [cleanQ, tabMode]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 backdrop-blur-xs pt-20 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-[var(--line2)] bg-[var(--panel)] text-[var(--fg)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--line)] px-4 py-3">
          <Search className="w-4 h-4 text-[var(--a1)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && cleanQ) {
                onSearch(cleanQ);
                onClose();
              }
            }}
            placeholder="Type a command, @ to filter tabs, or search private index..."
            className="w-full bg-transparent text-sm text-[var(--fg)] placeholder:text-[var(--fg3)] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--fg3)] hover:text-[var(--fg)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-[var(--line)]">
          {filteredTabs.length > 0 && (
            <div className="p-2">
              <div className="px-2 py-1 text-[11px] font-medium text-[var(--fg3)]">
                Open Tabs
              </div>
              {filteredTabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(t.id);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--hover2)] cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Globe className="w-3.5 h-3.5 text-[var(--fg3)] shrink-0" />
                    <span className="font-medium truncate">{t.title}</span>
                    <span className="font-mono text-[11px] text-[var(--fg3)] truncate">
                      {t.url || 'Start Page'}
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--fg3)] shrink-0 font-mono">
                    {t.isSleeping ? 'Hibernated' : `${t.memoryMb} MB`}
                  </span>
                </button>
              ))}
            </div>
          )}

          {!tabMode && (
            <div className="p-2">
              <div className="px-2 py-1 text-[11px] font-medium text-[var(--fg3)]">
                Vexora Tools & Commands
              </div>
              {filteredRoutes.map((route) => (
                <button
                  key={route.url}
                  type="button"
                  onClick={() => {
                    onNavigate(route.url === 'vexora://newtab' ? '' : route.url);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--hover2)] cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-[var(--a1)]" />
                    {route.label}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--fg3)]">{route.url}</span>
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  onOpenSettings();
                  onClose();
                }}
                className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--hover2)] cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-[var(--a1)]" />
                  Open Vexora Settings (Themes & Accents)
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onToggleTheme();
                  onClose();
                }}
                className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--hover2)] cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                  Cycle Theme (Midnight / Abyss / Daylight)
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onHibernateIdle();
                  onClose();
                }}
                className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--hover2)] cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Hibernate All Idle Background Tabs
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
