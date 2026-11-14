import React from 'react';
import {
  Cpu,
  Database,
  Layers,
  Lock,
  Megaphone,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';

interface ArchitectureViewProps {
  enableContextualSponsors: boolean;
  onToggleContextualSponsors: () => void;
  onNavigate: (url: string) => void;
}

export const ArchitectureView: React.FC<ArchitectureViewProps> = ({
  enableContextualSponsors,
  onToggleContextualSponsors,
  onNavigate,
}) => {
  return (
    <div className="min-h-full bg-[var(--bg)] text-[var(--fg)] px-6 py-8">
      <div className="mx-auto max-w-4xl space-y-10">
        <header className="border-b border-[var(--line)] pb-6">
          <h1 className="text-2xl md:text-3xl font-semibold [text-wrap:balance]">
            Vexora Engine, App Packaging & Ethical Ad Architecture
          </h1>
          <p className="mt-2 text-sm text-[var(--fg2)] leading-relaxed max-w-2xl">
            How Vexora scales from a proxy browser shell into a standalone desktop and mobile app, protects tab processes and encrypted search locally, and runs privacy-safe advertising without tracking users.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-[var(--a1)]" />
            01. Shipping Vexora as a Standalone Desktop & Mobile App
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-2">
              <div className="text-xs font-semibold text-[var(--a1)]">
                Desktop App (macOS / Windows / Linux)
              </div>
              <h3 className="text-sm font-semibold">Tauri + Rust or Chromium Fork</h3>
              <p className="text-xs text-[var(--fg2)] leading-relaxed">
                Package Vexora's UI inside a Rust supervisor using OS WebViews or Chromium Content API so sites load natively without proxy limitations, with custom DNS-over-HTTPS and isolated renderer processes.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-2">
              <div className="text-xs font-semibold text-[var(--a1)]">
                Mobile App (iOS / Android)
              </div>
              <h3 className="text-sm font-semibold">WKWebView / GeckoView</h3>
              <p className="text-xs text-[var(--fg2)] leading-relaxed">
                On iOS compile Vexora's blocklists into native WKContentRuleList; on Android embed Mozilla GeckoView so your own AI ad-shield and encrypted search index run inside a true mobile browser binary.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-2">
              <div className="text-xs font-semibold text-[var(--a1)]">
                Encrypted Core Index
              </div>
              <h3 className="text-sm font-semibold">SQLCipher + OS Keychain</h3>
              <p className="text-xs text-[var(--fg2)] leading-relaxed">
                Store Vexora's inverted search index, history, and productivity stats in AES-256 encrypted SQLCipher with the master key sealed in Apple Secure Enclave or Windows DPAPI.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[var(--a1)]" />
            02. Tab Management & Security Engine
          </h2>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] divide-y divide-[var(--line)]">
            <div className="p-5">
              <h3 className="text-sm font-semibold">Adaptive Tab Hibernation & Workspace Groups</h3>
              <p className="mt-1 text-xs text-[var(--fg2)] leading-relaxed">
                Background tabs are grouped by workspace (`Engineering`, `Research`, `Reading`, `Personal`) and hibernated when idle to drop RAM consumption from ~40 MB to ~4 MB per tab without losing session history.
              </p>
            </div>
            <div className="p-5">
              <h3 className="text-sm font-semibold">Sandboxed Proxy & Origin Isolation</h3>
              <p className="mt-1 text-xs text-[var(--fg2)] leading-relaxed">
                Proxied pages execute inside opaque-origin sandboxed iframes so third-party scripts can never touch Vexora's UI storage, bookmarks, or encrypted search vault.
              </p>
            </div>
            <div className="p-5">
              <h3 className="text-sm font-semibold">Two-Stage AI + Rule Ad Blocking</h3>
              <p className="mt-1 text-xs text-[var(--fg2)] leading-relaxed">
                Stage 1 strips 80+ tracker domains and inline pixels at the proxy edge. Stage 2 sends unknown DOM fragments to Gemini AI to classify dark patterns and add new block rules dynamically.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-[var(--a1)]" />
              03. Putting Advertisements in Your App Without Tracking
            </h2>
            <button
              type="button"
              onClick={onToggleContextualSponsors}
              className={`rounded-lg px-4 py-2 text-xs font-semibold border whitespace-nowrap shrink-0 cursor-pointer ${
                enableContextualSponsors
                  ? 'border-[var(--a1)] text-white'
                  : 'border-[var(--line2)] bg-[var(--panel)] text-[var(--fg)]'
              }`}
              style={enableContextualSponsors ? { background: 'var(--grad-soft)' } : undefined}
            >
              {enableContextualSponsors
                ? 'Contextual Ad Preview: Enabled'
                : 'Enable Contextual Ad Preview'}
            </button>
          </div>

          <p className="text-xs text-[var(--fg2)] leading-relaxed">
            Because Vexora blocks third-party surveillance ad networks, you don't embed Google AdSense or Meta Audience Network SDKs inside your own app. Instead, you monetize with a first-party contextual sponsorship system:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-2">
              <div className="text-xs font-semibold text-emerald-400">
                1. On-Device Contextual Search Sponsors
              </div>
              <p className="text-xs text-[var(--fg2)] leading-relaxed">
                Vexora periodically fetches a signed JSON sponsor catalog. When a user searches locally for "encryption", the match runs strictly on-device against that keyword—zero query logs or user IDs leave the app.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-2">
              <div className="text-xs font-semibold text-emerald-400">
                2. Direct Start Page Sponsor Cards
              </div>
              <p className="text-xs text-[var(--fg2)] leading-relaxed">
                Offer clean, non-intrusive static cards on Vexora's Start Page sold directly to vetted developer/privacy brands on a weekly sponsorship or aggregate-impression basis with local frequency caps.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-2">
              <div className="text-xs font-semibold text-emerald-400">
                3. Mobile App Store Policy Compliance
              </div>
              <p className="text-xs text-[var(--fg2)] leading-relaxed">
                Serving direct first-party contextual JSON sponsors avoids invasive third-party ad SDKs and App Tracking Transparency (ATT) permission popups on iOS and Android.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-2">
              <div className="text-xs font-semibold text-emerald-400">
                4. Hybrid Pro Sync Upgrade
              </div>
              <p className="text-xs text-[var(--fg2)] leading-relaxed">
                Keep Vexora free with opt-in contextual sponsors, and offer Vexora Pro ($4–$8/mo) for unlimited multi-device zero-knowledge cloud sync with zero sponsor cards.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('vexora://search')}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
              style={{ background: 'var(--grad-soft)' }}
            >
              <Lock className="w-3.5 h-3.5" />
              Test Search Sponsor Slot
            </button>
            <button
              type="button"
              onClick={() => onNavigate('')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line2)] bg-[var(--panel)] px-4 py-2 text-xs font-medium text-[var(--fg)] hover:bg-[var(--hover2)] whitespace-nowrap cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              Preview Start Page Slot
            </button>
            <button
              type="button"
              onClick={() => onNavigate('vexora://shield')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line2)] bg-[var(--panel)] px-4 py-2 text-xs font-medium text-[var(--fg)] hover:bg-[var(--hover2)] whitespace-nowrap cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Open AI Ad Shield
            </button>
            <button
              type="button"
              onClick={() => onNavigate('vexora://sync')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line2)] bg-[var(--panel)] px-4 py-2 text-xs font-medium text-[var(--fg)] hover:bg-[var(--hover2)] whitespace-nowrap cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              Open Encrypted Sync
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
