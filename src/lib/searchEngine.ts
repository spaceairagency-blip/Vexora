import { decryptJson, encryptJson } from './crypto';
import type {
  ContextualSponsor,
  EncryptedBundle,
  IndexedDocument,
  SearchResult,
} from '../types/browser';

export const ENCRYPTED_INDEX_STORAGE_KEY = 'vexora_encrypted_index_v1';
export const DEFAULT_LOCAL_PASSPHRASE = 'vexora-local-device-key';

const SEED_DOCUMENTS: IndexedDocument[] = [
  {
    id: 'doc-webcrypto',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API',
    title: 'Web Crypto API — Client-Side AES-GCM & Key Derivation',
    snippet:
      'Perform cryptographic operations including PBKDF2 key derivation and AES-256-GCM authenticated encryption directly on-device without exposing keys.',
    keywords: ['crypto', 'aes', 'encryption', 'pbkdf2', 'privacy', 'security', 'mdn'],
    category: 'Cryptography',
    indexedAt: '2026-11-10T09:15:00Z',
    source: 'seed',
  },
  {
    id: 'doc-site-isolation',
    url: 'https://chromium.org/Home/chromium-security/site-isolation',
    title: 'Site Isolation — Sandboxed Origin Containers in Vexora',
    snippet:
      'Isolates each proxied origin inside a restricted sandbox iframe with neutralised tracking scripts and strict cookie partitioning.',
    keywords: ['vexora', 'browser', 'security', 'sandbox', 'isolation', 'process', 'tabs'],
    category: 'Vexora Engine',
    indexedAt: '2026-11-10T10:30:00Z',
    source: 'seed',
  },
  {
    id: 'doc-tab-hibernation',
    url: 'vexora://dashboard',
    title: 'Adaptive Tab Hibernation & Memory Reclamation',
    snippet:
      'Suspends background tabs after configurable idle windows while preserving history, scroll offset, and session state to save hundreds of MB of RAM.',
    keywords: ['tabs', 'memory', 'ram', 'hibernation', 'performance', 'battery', 'vexora'],
    category: 'Vexora Engine',
    indexedAt: '2026-11-11T08:00:00Z',
    source: 'seed',
  },
  {
    id: 'doc-local-search',
    url: 'vexora://search',
    title: 'Vexora Private Search — Zero-Leakage Local Encrypted Index',
    snippet:
      'First-party inverted index with BM25 ranking encrypted locally using AES-256-GCM. Zero query strings or click telemetry ever reach third-party search providers.',
    keywords: ['search', 'index', 'private', 'encrypted', 'bm25', 'local', 'vexora'],
    category: 'Search Engine',
    indexedAt: '2026-11-11T12:20:00Z',
    source: 'seed',
  },
  {
    id: 'doc-ai-shield',
    url: 'vexora://shield',
    title: 'Vexora AI Shield — Semantic Ad & CNAME Tracker Defense',
    snippet:
      'Neutralizes 80+ tracker domains and inline analytics pixels at proxy edge, paired with Gemini AI inspection for dark-pattern cookie banners and native ad slots.',
    keywords: ['adblock', 'shield', 'ai', 'tracker', 'privacy', 'cname', 'filter', 'ads'],
    category: 'Privacy',
    indexedAt: '2026-11-11T14:40:00Z',
    source: 'seed',
  },
  {
    id: 'doc-contextual-ads',
    url: 'vexora://architecture',
    title: 'Privacy-Preserving Contextual Ads Without User Tracking',
    snippet:
      'Monetize your browser app via on-device keyword-matched search sponsors and static Start Page sponsor cards—zero behavioral profiles or ad-network SDKs.',
    keywords: ['advertising', 'monetization', 'contextual', 'privacy', 'revenue', 'sponsors', 'app'],
    category: 'Monetization',
    indexedAt: '2026-11-12T07:50:00Z',
    source: 'seed',
  },
  {
    id: 'doc-e2ee-sync',
    url: 'vexora://sync',
    title: 'Zero-Knowledge Cross-Device Sync via PBKDF2 + AES-GCM',
    snippet:
      'Sync bookmarks, tabs, notes, reading list, and encrypted search documents across desktop and mobile devices while the relay only ever sees opaque ciphertext.',
    keywords: ['sync', 'cross-device', 'encryption', 'zero-knowledge', 'passphrase', 'vault'],
    category: 'Cryptography',
    indexedAt: '2026-11-12T16:00:00Z',
    source: 'seed',
  },
  {
    id: 'doc-wikipedia-privacy',
    url: 'https://en.wikipedia.org/wiki/Internet_privacy',
    title: 'Internet Privacy — Wikipedia Reference',
    snippet:
      'Overview of online tracking, browser fingerprinting, HTTPS encryption, and techniques users employ to control personal data exposure on the web.',
    keywords: ['privacy', 'wikipedia', 'internet', 'tracking', 'https'],
    category: 'Reference',
    indexedAt: '2026-11-13T09:00:00Z',
    source: 'seed',
  },
  {
    id: 'doc-rust-tauri',
    url: 'https://v2.tauri.app/concept/architecture/',
    title: 'Shipping Vexora as a Native Desktop & Mobile App (Tauri / GeckoView)',
    snippet:
      'Package Vexora as a standalone desktop or mobile binary with SQLCipher encrypted storage, OS Keychain key sealing, and native network interception.',
    keywords: ['app', 'desktop', 'mobile', 'tauri', 'rust', 'architecture', 'geckoview'],
    category: 'App Architecture',
    indexedAt: '2026-11-12T11:10:00Z',
    source: 'seed',
  },
  {
    id: 'doc-focus-habits',
    url: 'https://en.wikipedia.org/wiki/Attention_economy',
    title: 'Deep Work & Focus Tracking in Vexora Dashboard',
    snippet:
      'Combine Pomodoro focus blocks, distraction-domain pausing, and domain time ledgers to track productive browsing habits.',
    keywords: ['productivity', 'focus', 'habits', 'dashboard', 'pomodoro', 'deep work'],
    category: 'Productivity',
    indexedAt: '2026-11-13T10:30:00Z',
    source: 'seed',
  },
];

export const CONTEXTUAL_SPONSORS: ContextualSponsor[] = [
  {
    id: 'sp-yubico',
    title: 'Hardware Security Keys for Zero-Trust Auth',
    domain: 'hardware-auth.example',
    url: 'https://en.wikipedia.org/wiki/FIDO2_Project',
    summary:
      'FIDO2 / WebAuthn phishing-resistant hardware keys. Matched locally to your query keyword with zero behavioral tracking.',
    keywords: ['security', 'crypto', 'encryption', 'privacy', 'passphrase', 'auth', 'https', 'tls'],
    placement: 'search',
    cpmNote: 'Keyword-only local match · Zero cookies · Direct Sponsor',
  },
  {
    id: 'sp-vault',
    title: 'End-to-End Encrypted Cloud Vault for Teams',
    domain: 'private-vault.example',
    url: 'https://en.wikipedia.org/wiki/End-to-end_encryption',
    summary:
      'Zero-knowledge document storage with local frequency capping and zero cross-site telemetry.',
    keywords: ['sync', 'vault', 'encrypted', 'search', 'index', 'backup', 'vexora'],
    placement: 'newtab',
    cpmNote: 'Static Start Page Sponsor · 1 impression cap/day · Zero telemetry',
  },
  {
    id: 'sp-focus',
    title: 'Keyboard-First Issue & Deep Work Planner',
    domain: 'focus-craft.example',
    url: 'https://en.wikipedia.org/wiki/Timeblocking',
    summary:
      'Plan engineering sprints without notification noise. Contextual match triggered only by productivity keywords.',
    keywords: ['productivity', 'focus', 'habits', 'dashboard', 'tabs', 'work', 'app'],
    placement: 'search',
    cpmNote: 'Keyword-only local match · Zero profile built',
  },
];

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\-_.]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

export function searchDocuments(
  docs: IndexedDocument[],
  rawQuery: string
): SearchResult[] {
  const trimmed = rawQuery.trim();
  if (!trimmed) return [];

  let siteFilter = '';
  const queryParts: string[] = [];
  for (const part of trimmed.split(/\s+/)) {
    if (part.toLowerCase().startsWith('site:')) {
      siteFilter = part.slice(5).toLowerCase();
    } else {
      queryParts.push(part);
    }
  }

  const terms = tokenize(queryParts.join(' '));
  const results: SearchResult[] = [];

  for (const doc of docs) {
    if (siteFilter && !doc.url.toLowerCase().includes(siteFilter)) {
      continue;
    }

    if (terms.length === 0 && siteFilter) {
      results.push({ doc, score: 1, matchedTerms: [siteFilter] });
      continue;
    }

    const titleTokens = tokenize(doc.title);
    const urlTokens = tokenize(doc.url);
    const keywordTokens = doc.keywords.map((k) => k.toLowerCase());
    const snippetTokens = tokenize(doc.snippet);

    let score = 0;
    const matched = new Set<string>();

    for (const term of terms) {
      let termScore = 0;
      for (const tok of titleTokens) {
        if (tok === term) termScore += 4.0;
        else if (tok.startsWith(term)) termScore += 2.2;
      }
      for (const tok of keywordTokens) {
        if (tok === term) termScore += 3.2;
        else if (tok.includes(term)) termScore += 1.6;
      }
      for (const tok of urlTokens) {
        if (tok.includes(term)) termScore += 2.0;
      }
      for (const tok of snippetTokens) {
        if (tok === term) termScore += 1.1;
        else if (tok.startsWith(term)) termScore += 0.5;
      }

      if (termScore > 0) {
        matched.add(term);
        score += termScore;
      }
    }

    if (matched.size > 0) {
      const coverageBonus = matched.size === terms.length ? 1.35 : 1;
      results.push({
        doc,
        score: Number((score * coverageBonus).toFixed(2)),
        matchedTerms: Array.from(matched),
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export function matchContextualSponsor(
  query: string,
  placement: 'search' | 'newtab'
): ContextualSponsor | null {
  if (placement === 'newtab') {
    return CONTEXTUAL_SPONSORS.find((s) => s.placement === 'newtab') ?? null;
  }
  const terms = tokenize(query);
  if (terms.length === 0) return null;
  for (const sponsor of CONTEXTUAL_SPONSORS) {
    if (sponsor.keywords.some((kw) => terms.some((t) => kw.includes(t) || t.includes(kw)))) {
      return sponsor;
    }
  }
  return CONTEXTUAL_SPONSORS[0];
}

export async function loadEncryptedIndex(
  passphrase: string
): Promise<{ docs: IndexedDocument[]; bundle: EncryptedBundle }> {
  const raw = localStorage.getItem(ENCRYPTED_INDEX_STORAGE_KEY);
  if (!raw) {
    const bundle = await encryptJson(SEED_DOCUMENTS, passphrase);
    localStorage.setItem(ENCRYPTED_INDEX_STORAGE_KEY, JSON.stringify(bundle));
    return { docs: SEED_DOCUMENTS, bundle };
  }
  const bundle = JSON.parse(raw) as EncryptedBundle;
  const docs = await decryptJson<IndexedDocument[]>(bundle, passphrase);
  return { docs, bundle };
}

export async function saveEncryptedIndex(
  docs: IndexedDocument[],
  passphrase: string
): Promise<EncryptedBundle> {
  const bundle = await encryptJson(docs, passphrase);
  localStorage.setItem(ENCRYPTED_INDEX_STORAGE_KEY, JSON.stringify(bundle));
  return bundle;
}

export function getRawEncryptedIndexPreview(): EncryptedBundle | null {
  const raw = localStorage.getItem(ENCRYPTED_INDEX_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EncryptedBundle;
  } catch {
    return null;
  }
}

export function getSeedDocuments(): IndexedDocument[] {
  return SEED_DOCUMENTS;
}
