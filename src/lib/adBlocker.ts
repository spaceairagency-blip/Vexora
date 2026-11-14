import type { AdRule, OriginPermission } from '../types/browser';

export const DEFAULT_AD_RULES: AdRule[] = [
  {
    id: 'rule-doubleclick',
    pattern: '||doubleclick.net^',
    category: 'Ad Network',
    enabled: true,
    hits: 42,
    source: 'Built-in',
  },
  {
    id: 'rule-gtm',
    pattern: '||googletagmanager.com^$third-party',
    category: 'Tracker',
    enabled: true,
    hits: 31,
    source: 'Built-in',
  },
  {
    id: 'rule-fbevents',
    pattern: '||connect.facebook.net/*/fbevents.js',
    category: 'Tracker',
    enabled: true,
    hits: 19,
    source: 'Built-in',
  },
  {
    id: 'rule-taboola',
    pattern: '##.taboola-widget, ||taboola.com^',
    category: 'Ad Network',
    enabled: true,
    hits: 15,
    source: 'Built-in',
  },
  {
    id: 'rule-criteo',
    pattern: '||criteo.com^$script,xhr',
    category: 'Ad Network',
    enabled: true,
    hits: 12,
    source: 'Built-in',
  },
  {
    id: 'rule-canvas-fp',
    pattern: 'canvas.toDataURL() + AudioContext noise injection',
    category: 'Fingerprinter',
    enabled: true,
    hits: 24,
    source: 'Built-in',
  },
  {
    id: 'rule-cookie-banner',
    pattern: '##.dark-pattern-consent-wall, [data-ad-slot]',
    category: 'Dark Pattern',
    enabled: true,
    hits: 9,
    source: 'Built-in',
  },
];

export const DEFAULT_PERMISSIONS: OriginPermission[] = [
  {
    origin: 'https://developer.mozilla.org',
    camera: 'deny',
    microphone: 'deny',
    location: 'deny',
    cookies: 'partitioned',
    fingerprintNoise: true,
  },
  {
    origin: 'https://en.wikipedia.org',
    camera: 'deny',
    microphone: 'deny',
    location: 'deny',
    cookies: 'partitioned',
    fingerprintNoise: true,
  },
  {
    origin: 'https://news.ycombinator.com',
    camera: 'deny',
    microphone: 'deny',
    location: 'deny',
    cookies: 'partitioned',
    fingerprintNoise: true,
  },
];

export function evaluateUrlPhishingRisk(url: string): {
  safe: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('xn--')) {
      warnings.push('Punycode / internationalized homograph domain detected.');
    }
    if (parsed.protocol === 'http:') {
      warnings.push('Unencrypted HTTP connection — HTTPS-First upgrade active.');
    }
    if (parsed.username || parsed.password) {
      warnings.push('Embedded credentials in URL (common phishing obfuscation).');
    }
    if (parsed.hostname.split('.').length > 4) {
      warnings.push('Deeply nested subdomain chain flagged for inspection.');
    }
  } catch {
    // Internal kestrel:// route
  }
  return {
    safe: warnings.length === 0,
    warnings,
  };
}
