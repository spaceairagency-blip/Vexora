import React, { useState } from 'react';
import { Cpu, Lock, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import type { AdRule, BrowserTab, OriginPermission } from '../types/browser';

interface ShieldAnalysisResult {
  verdict: string;
  riskScore: number;
  blockedSelectors: string[];
  findings: Array<{ category: string; reason: string; severity: string }>;
  summary: string;
}

interface ShieldViewProps {
  rules: AdRule[];
  permissions: OriginPermission[];
  tabs: BrowserTab[];
  httpsFirst: boolean;
  fingerprintDefense: boolean;
  initialInspectUrl?: string;
  initialInspectSnippet?: string;
  onTogglehttpsFirst: () => void;
  onToggleFingerprintDefense: () => void;
  onToggleRule: (id: string) => void;
  onAddAiRules: (selectors: string[]) => void;
  onUpdatePermission: (
    origin: string,
    field: 'camera' | 'microphone' | 'location',
    val: 'deny' | 'ask' | 'allow'
  ) => void;
}

const SAMPLE_AD_SNIPPET = `<div id="sponsored-carousel" data-ad-slot="top-banner">
  <script src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"></script>
  <script src="https://metrics.partner-cname.example.com/collect?uid=94812"></script>
  <button class="consent-accept-all">Accept All Tracking Cookies</button>
  <span class="tiny-optout">Manage preferences (142 partners)</span>
</div>`;

export const ShieldView: React.FC<ShieldViewProps> = ({
  rules,
  permissions,
  tabs,
  httpsFirst,
  fingerprintDefense,
  initialInspectUrl = 'https://news-portal.example/article',
  initialInspectSnippet = SAMPLE_AD_SNIPPET,
  onTogglehttpsFirst,
  onToggleFingerprintDefense,
  onToggleRule,
  onAddAiRules,
  onUpdatePermission,
}) => {
  const [inspectUrl, setInspectUrl] = useState(initialInspectUrl);
  const [inspectSnippet, setInspectSnippet] = useState(initialInspectSnippet);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ShieldAnalysisResult | null>(null);
  const [rulesApplied, setRulesApplied] = useState(false);

  const runAiInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    setAnalyzing(true);
    setAnalysisError(null);
    setRulesApplied(false);
    try {
      const res = await fetch('/api/shield/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: inspectUrl,
          contentSnippet: inspectSnippet,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'AI inspection failed.');
      setAnalysis(json as ShieldAnalysisResult);
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : 'Unable to reach Vexora AI Shield endpoint.'
      );
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-full bg-[var(--bg)] text-[var(--fg)] px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
          <div>
            <h1 className="text-2xl font-semibold">Vexora AI Ad & Site Isolation Shield</h1>
            <p className="mt-1 text-xs text-[var(--fg2)]">
              Proxy-edge tracker neutralisation + Gemini AI semantic DOM & dark-pattern classification
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onTogglehttpsFirst}
              className={`rounded-lg px-3 py-2 text-xs font-medium border whitespace-nowrap cursor-pointer ${
                httpsFirst
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-[var(--line2)] bg-[var(--panel)] text-[var(--fg2)]'
              }`}
            >
              HTTPS-First: {httpsFirst ? 'Active' : 'Off'}
            </button>
            <button
              type="button"
              onClick={onToggleFingerprintDefense}
              className={`rounded-lg px-3 py-2 text-xs font-medium border whitespace-nowrap cursor-pointer ${
                fingerprintDefense
                  ? 'border-[var(--a1)]/50 bg-[var(--hover2)] text-[var(--a1)]'
                  : 'border-[var(--line2)] bg-[var(--panel)] text-[var(--fg2)]'
              }`}
            >
              Fingerprint Noise: {fingerprintDefense ? 'Active' : 'Off'}
            </button>
          </div>
        </div>

        {/* Gemini AI Ad & Dark Pattern Analyzer */}
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--a1)]" />
              AI Semantic Ad & Dark-Pattern Classifier
            </h2>
            <p className="text-xs text-[var(--fg2)] mt-0.5">
              Analyze DOM blocks, CNAME-cloaked scripts, or cookie walls to synthesize block rules for Vexora Proxy.
            </p>
          </div>

          <form onSubmit={runAiInspection} className="space-y-3">
            <input
              type="text"
              value={inspectUrl}
              onChange={(e) => setInspectUrl(e.target.value)}
              placeholder="Target page or script URL..."
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-3 py-2 text-xs font-mono text-[var(--fg)]"
            />
            <textarea
              rows={4}
              value={inspectSnippet}
              onChange={(e) => setInspectSnippet(e.target.value)}
              placeholder="Paste HTML, DOM fragment, or script references..."
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-3 py-2 text-xs font-mono text-[var(--fg)]"
            />
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setInspectUrl('https://news-portal.example/article');
                  setInspectSnippet(SAMPLE_AD_SNIPPET);
                }}
                className="text-xs text-[var(--fg3)] hover:text-[var(--fg)] underline cursor-pointer"
              >
                Load sample ad + CNAME snippet
              </button>
              <button
                type="submit"
                disabled={analyzing}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 whitespace-nowrap cursor-pointer"
                style={{ background: 'var(--grad-soft)' }}
              >
                <ShieldCheck className="w-4 h-4" />
                {analyzing ? 'Analyzing Payload...' : 'Inspect with AI Shield'}
              </button>
            </div>
          </form>

          {analysisError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-400">
              {analysisError}
            </div>
          )}

          {analysis && (
            <div className="border-t border-[var(--line)] pt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold">
                    Classification: {analysis.verdict.replace('_', ' ')}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-amber-400">
                    Risk Rating {analysis.riskScore}/100
                  </span>
                </div>
                {analysis.blockedSelectors?.length > 0 && (
                  <button
                    type="button"
                    disabled={rulesApplied}
                    onClick={() => {
                      onAddAiRules(analysis.blockedSelectors);
                      setRulesApplied(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {rulesApplied
                      ? 'Rules Added to Vexora Shield'
                      : `Apply ${analysis.blockedSelectors.length} AI Filter Rules`}
                  </button>
                )}
              </div>

              <p className="text-xs text-[var(--fg2)] leading-relaxed">{analysis.summary}</p>

              {analysis.findings?.length > 0 && (
                <div className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
                  {analysis.findings.map((f, i) => (
                    <div key={i} className="px-4 py-2.5 flex items-start justify-between gap-4 text-xs">
                      <div>
                        <span className="font-medium">{f.category}</span>
                        <span className="mx-2 text-[var(--fg3)]">·</span>
                        <span className="text-[var(--fg2)]">{f.reason}</span>
                      </div>
                      <span className="font-mono text-amber-400 shrink-0">{f.severity}</span>
                    </div>
                  ))}
                </div>
              )}

              {analysis.blockedSelectors?.length > 0 && (
                <div className="rounded-lg bg-black/60 text-emerald-300 p-3 font-mono text-xs space-y-1">
                  {analysis.blockedSelectors.map((sel, idx) => (
                    <div key={idx}>{sel}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--line)] flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Active Filter Rules ({rules.filter((r) => r.enabled).length})
              </h2>
              <span className="text-xs text-[var(--fg3)]">Zero-latency match</span>
            </div>
            <div className="divide-y divide-[var(--line)] max-h-80 overflow-y-auto">
              {rules.map((rule) => (
                <div key={rule.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-xs truncate">{rule.pattern}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--fg3)]">
                      {rule.category} · {rule.source} ·{' '}
                      <span className="tabular-nums font-mono">{rule.hits} hits</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleRule(rule.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium shrink-0 cursor-pointer ${
                      rule.enabled
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-[var(--hover2)] text-[var(--fg3)] border border-[var(--line)]'
                    }`}
                  >
                    {rule.enabled ? 'Enabled' : 'Paused'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--line)] flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[var(--fg3)]" />
                Site Isolation Sandbox Containers
              </h2>
              <span className="text-xs text-[var(--fg3)]">Opaque origin per tab</span>
            </div>
            <div className="divide-y divide-[var(--line)] max-h-80 overflow-y-auto">
              {tabs.map((t) => (
                <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.title}</div>
                    <div className="font-mono text-[11px] text-[var(--fg3)] truncate">
                      {t.processId} · {t.url || 'Start Page'}
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-mono tabular-nums">
                    <div className={t.isSleeping ? 'text-amber-400' : 'text-emerald-400'}>
                      {t.isSleeping ? 'Hibernated' : 'Isolated'}
                    </div>
                    <div className="text-[11px] text-[var(--fg3)]">{t.memoryMb} MB</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--line)] flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Lock className="w-4 h-4 text-[var(--fg3)]" />
              Origin Permission Guard (Default-Deny)
            </h2>
            <span className="text-xs text-[var(--fg3)]">First-Party Cookie Partitioning</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--line)] text-[var(--fg3)]">
                  <th className="py-3 px-6 font-medium">Origin</th>
                  <th className="py-3 px-4 font-medium">Camera</th>
                  <th className="py-3 px-4 font-medium">Microphone</th>
                  <th className="py-3 px-4 font-medium">Location</th>
                  <th className="py-3 px-6 font-medium text-right">Cookie Jar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {permissions.map((perm) => (
                  <tr key={perm.origin}>
                    <td className="py-3 px-6 font-mono">{perm.origin}</td>
                    {(['camera', 'microphone', 'location'] as const).map((field) => (
                      <td key={field} className="py-3 px-4">
                        <select
                          value={perm[field]}
                          onChange={(e) =>
                            onUpdatePermission(
                              perm.origin,
                              field,
                              e.target.value as 'deny' | 'ask' | 'allow'
                            )
                          }
                          className="rounded border border-[var(--line2)] bg-[var(--bg2)] px-2 py-1 text-xs text-[var(--fg)]"
                        >
                          <option value="deny">Deny</option>
                          <option value="ask">Ask</option>
                          <option value="allow">Allow</option>
                        </select>
                      </td>
                    ))}
                    <td className="py-3 px-6 text-right font-mono text-emerald-400">
                      Partitioned
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
