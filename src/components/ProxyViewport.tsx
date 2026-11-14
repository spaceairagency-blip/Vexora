import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookmarkPlus,
  ExternalLink,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import type { BrowserTab, ReaderArticle, VexoraSettings } from '../types/browser';

interface ProxyViewportProps {
  tab: BrowserTab;
  settings: VexoraSettings;
  alreadyIndexed: boolean;
  findOpen: boolean;
  onCloseFind: () => void;
  onFrameMessage: (tabId: string, msg: Record<string, unknown>) => void;
  onCloseReader: (tabId: string) => void;
  onSaveReadingList: (tab: BrowserTab) => void;
  onIndexArticle: (article: ReaderArticle) => void;
  onInspectWithAiShield: (tab: BrowserTab) => void;
  onOpenExternal: (url: string) => void;
}

export const ProxyViewport: React.FC<ProxyViewportProps> = ({
  tab,
  settings,
  alreadyIndexed,
  findOpen,
  onCloseFind,
  onFrameMessage,
  onCloseReader,
  onSaveReadingList,
  onIndexArticle,
  onInspectWithAiShield,
  onOpenExternal,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [readerSize, setReaderSize] = useState(18);
  const [readerSerif, setReaderSerif] = useState(true);
  const [readerTheme, setReaderTheme] = useState<'dark' | 'sepia' | 'light'>('dark');
  const [findQuery, setFindQuery] = useState('');
  const [findCount, setFindCount] = useState<string>('');
  const findQueryRef = useRef(findQuery);
  findQueryRef.current = findQuery;

  const postToFrame = (payload: Record<string, unknown>) => {
    try {
      iframeRef.current?.contentWindow?.postMessage({ vx: 1, ...payload }, '*');
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.vx !== 1) return;
      if (iframeRef.current && e.source === iframeRef.current.contentWindow) {
        if (e.data.t === 'find') {
          const c = Number(e.data.count || 0);
          setFindCount(c ? `${c} found` : findQueryRef.current ? 'No results' : '');
        }
        onFrameMessage(tab.id, e.data);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [tab.id, onFrameMessage]);

  useEffect(() => {
    postToFrame({ c: 'zoom', v: tab.zoom });
  }, [tab.zoom]);

  useEffect(() => {
    postToFrame({ c: 'dark', on: tab.dark || settings.darkPages });
  }, [tab.dark, settings.darkPages]);

  const runFind = (q: string, back = false) => {
    setFindQuery(q);
    postToFrame({ c: 'find', q, back });
    if (!q) setFindCount('');
  };

  const targetFrameUrl = tab.frameUrl || tab.url;
  const proxySrc = `/proxy?url=${encodeURIComponent(targetFrameUrl)}&s=${
    settings.shield ? 1 : 0
  }&p=${tab.priv ? 1 : 0}${tab.reloadNonce ? `&r=${tab.reloadNonce}` : ''}`;

  const readerThemeStyle =
    readerTheme === 'light'
      ? { background: '#fbfbfd', color: '#1c2030' }
      : readerTheme === 'sepia'
      ? { background: '#f4ecd8', color: '#43382a' }
      : { background: '#0c1020', color: '#dfe6ff' };

  return (
    <div className="relative h-full w-full flex flex-col bg-white dark:bg-[#080b14]">
      {/* Page Isolation & Quick Action Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-1.5 text-xs text-[var(--fg2)]">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            Sandboxed Proxy
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {tab.blockedCount} blocked
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-[11px] text-[var(--fg3)]">{tab.processId}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onInspectWithAiShield(tab)}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] px-2.5 py-1 text-[11px] font-medium text-[var(--fg)] hover:bg-[var(--hover2)] whitespace-nowrap cursor-pointer"
          >
            <ShieldCheck className="w-3 h-3 text-[var(--a1)]" />
            AI Audit
          </button>
          <button
            type="button"
            onClick={() => onOpenExternal(tab.url)}
            title="Open original site in new browser window"
            className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] px-2.5 py-1 text-[11px] font-medium text-[var(--fg)] hover:bg-[var(--hover2)] whitespace-nowrap cursor-pointer"
          >
            <ExternalLink className="w-3 h-3" />
            Original
          </button>
        </div>
      </div>

      {/* Find-in-Page Floating Bar */}
      {findOpen && !tab.readerMode && (
        <div className="absolute top-12 right-4 z-20 flex items-center gap-2 rounded-xl border border-[var(--line2)] bg-[var(--glass)] backdrop-blur-md px-3 py-1.5 shadow-xl">
          <Search className="w-3.5 h-3.5 text-[var(--fg3)]" />
          <input
            type="text"
            autoFocus
            value={findQuery}
            onChange={(e) => runFind(e.target.value, false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runFind(findQuery, e.shiftKey);
              if (e.key === 'Escape') {
                runFind('');
                onCloseFind();
              }
            }}
            placeholder="Find in page..."
            className="w-40 bg-transparent text-xs text-[var(--fg)] focus:outline-none"
          />
          <span className="text-[11px] text-[var(--fg3)] font-mono tabular-nums min-w-[54px] text-right">
            {findCount}
          </span>
          <button
            type="button"
            onClick={() => {
              runFind('');
              onCloseFind();
            }}
            className="p-1 text-[var(--fg3)] hover:text-[var(--fg)] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Reader Mode Overlay OR Live Sandboxed Proxy Iframe */}
      {tab.readerMode ? (
        <div className="flex-1 overflow-y-auto" style={readerThemeStyle}>
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-current/10 px-5 py-2.5 backdrop-blur-md">
            <button
              type="button"
              onClick={() => onCloseReader(tab.id)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-current/10 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Exit Reader
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setReaderSize((s) => Math.max(14, s - 1))}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold hover:bg-current/10 cursor-pointer"
              >
                A-
              </button>
              <button
                type="button"
                onClick={() => setReaderSize((s) => Math.min(26, s + 1))}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold hover:bg-current/10 cursor-pointer"
              >
                A+
              </button>
              <button
                type="button"
                onClick={() => setReaderSerif((v) => !v)}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold hover:bg-current/10 cursor-pointer"
              >
                Aa
              </button>
              <button
                type="button"
                onClick={() =>
                  setReaderTheme((t) =>
                    t === 'dark' ? 'sepia' : t === 'sepia' ? 'light' : 'dark'
                  )
                }
                title="Cycle Reader Theme"
                className="rounded-lg p-1.5 hover:bg-current/10 cursor-pointer"
              >
                {readerTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => onSaveReadingList(tab)}
                title="Save to Reading List"
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold hover:bg-current/10 cursor-pointer"
              >
                <Bookmark className="w-3.5 h-3.5" />
                Save
              </button>
              {tab.readerData && (
                <button
                  type="button"
                  disabled={alreadyIndexed}
                  onClick={() => tab.readerData && onIndexArticle(tab.readerData)}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  {alreadyIndexed ? 'Indexed Locally' : 'Index to Vault'}
                </button>
              )}
            </div>
          </div>

          <article
            className="mx-auto max-w-[700px] px-6 py-10 space-y-4"
            style={{
              fontSize: `${readerSize}px`,
              lineHeight: 1.75,
              fontFamily: readerSerif
                ? 'Georgia, "Times New Roman", serif'
                : 'var(--vx-body)',
            }}
          >
            {!tab.readerData ? (
              <div className="py-20 text-center text-sm opacity-70">
                Distilling article...
              </div>
            ) : (
              <>
                <h1 className="text-3xl font-bold leading-tight">
                  {tab.readerData.title}
                </h1>
                <div className="text-xs opacity-70 pb-4 border-b border-current/10">
                  {tab.readerData.site}
                  {tab.readerData.byline ? ` · ${tab.readerData.byline}` : ''}
                  {` · ${tab.readerData.minutes} min read`}
                </div>
                <div
                  className="space-y-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_blockquote]:italic [&_blockquote]:opacity-80"
                  dangerouslySetInnerHTML={{
                    __html:
                      tab.readerData.html ||
                      '<p>No readable article blocks were extracted from this origin.</p>',
                  }}
                />
              </>
            )}
          </article>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          key={proxySrc}
          data-vx-viewport="1"
          src={proxySrc}
          title={tab.title}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock allow-presentation"
          allow="fullscreen; clipboard-write; autoplay; encrypted-media; picture-in-picture"
          className="flex-1 w-full h-full border-0 bg-white"
          onLoad={() => {
            postToFrame({ c: 'zoom', v: tab.zoom });
            postToFrame({ c: 'dark', on: tab.dark || settings.darkPages });
          }}
        />
      )}
    </div>
  );
};
