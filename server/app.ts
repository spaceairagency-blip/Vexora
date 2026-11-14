import express, { Express, Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';
import dns from 'node:dns/promises';
import net from 'node:net';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import {
  buildCookieHeader,
  clearJar,
  getJarKey,
  getPublicCookieString,
  storeSetCookies,
} from './cookieJar.js';

const PORT = Number(process.env.PORT) || 3000;
const SYNC_STORE_PATH = '/tmp/vexora-sync-vaults.json';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// --------------------------------------------------------------------------- //
//  Vexora Shield Tracker Domain Set
// --------------------------------------------------------------------------- //

const TRACKER_DOMAINS = new Set(
  `doubleclick.net googlesyndication.com googletagmanager.com google-analytics.com
googleadservices.com adservice.google.com pagead2.googlesyndication.com
connect.facebook.net facebook.net analytics.twitter.com ads-twitter.com static.ads-twitter.com
scorecardresearch.com quantserve.com quantcount.com hotjar.com static.hotjar.com
mixpanel.com cdn.segment.com segment.io amplitude.com criteo.com criteo.net
taboola.com outbrain.com adnxs.com rubiconproject.com pubmatic.com openx.net
adsrvr.org moatads.com chartbeat.com chartbeat.net bat.bing.com clarity.ms
fullstory.com mouseflow.com crazyegg.com mc.yandex.ru analytics.tiktok.com
tr.snapchat.com sc-static.net ads.pinterest.com px.ads.linkedin.com snap.licdn.com
amazon-adsystem.com adform.net smartadserver.com casalemedia.com 33across.com
bidswitch.net sharethrough.com teads.tv zedo.com media.net mgid.com revcontent.com
adroll.com addthis.com sharethis.com hs-analytics.net hsadspixel.net
bluekai.com demdex.net omtrdc.net everesttech.net krxd.net rlcdn.com
ads.yahoo.com advertising.com adtechus.com serving-sys.com yieldmo.com
2mdn.net ad.doubleclick.net track.adform.net optimizely.com cdn.heapanalytics.com
heap.io`
    .trim()
    .split(/\s+/)
);

const META_OWNED_HOSTS = [
  'facebook.com',
  'fb.com',
  'fbcdn.net',
  'fbsbx.com',
  'messenger.com',
  'instagram.com',
  'cdninstagram.com',
  'whatsapp.com',
  'whatsapp.net',
];

const customBlockedPatterns = new Set<string>();

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith('.' + domain);
}

function isMetaOwnedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return META_OWNED_HOSTS.some((d) => hostMatches(h, d));
}

function isTrackerHost(hostname: string | null | undefined, pageHostname = ''): boolean {
  if (!hostname) return false;
  const host = hostname.toLowerCase();
  if (
    pageHostname &&
    isMetaOwnedHost(pageHostname) &&
    (hostMatches(host, 'facebook.net') || hostMatches(host, 'facebook.com'))
  ) {
    return false;
  }
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const sub = parts.slice(i).join('.');
    if (TRACKER_DOMAINS.has(sub) || customBlockedPatterns.has(sub)) return true;
  }
  for (const pat of customBlockedPatterns) {
    if (pat && host.includes(pat.toLowerCase())) return true;
  }
  return false;
}

const AD_CSS =
  "ins.adsbygoogle,.adsbygoogle,[id^='google_ads'],[id^='div-gpt-ad'],iframe[src*='doubleclick.net'],iframe[src*='googlesyndication.com'],[data-ad-slot]{display:none!important}";
const BLANK_GIF =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// --------------------------------------------------------------------------- //
//  Zero-Knowledge Encrypted Sync Relay Store
// --------------------------------------------------------------------------- //

interface SyncVaultRecord {
  vaultId: string;
  salt: string;
  iv: string;
  ciphertext: string;
  algorithm: string;
  updatedAt: string;
  deviceLabel: string;
  byteLength: number;
}

const syncVaults = new Map<string, SyncVaultRecord>();
const faviconCache = new Map<string, { buf: Buffer; contentType: string }>();

async function loadSyncStore() {
  try {
    const raw = await fs.readFile(SYNC_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, SyncVaultRecord>;
    for (const [k, v] of Object.entries(parsed)) {
      syncVaults.set(k, v);
    }
  } catch {
    // Store not created yet
  }
}

async function persistSyncStore() {
  try {
    await fs.writeFile(
      SYNC_STORE_PATH,
      JSON.stringify(Object.fromEntries(syncVaults.entries())),
      'utf8'
    );
  } catch {
    // Non-fatal
  }
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// --------------------------------------------------------------------------- //
//  SSRF Protection
// --------------------------------------------------------------------------- //

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    return false;
  }
  const n = ip.toLowerCase();
  if (n.startsWith('::ffff:')) {
    return isPrivateIp(n.slice(7));
  }
  return n === '::1' || n === '::' || n.startsWith('fc') || n.startsWith('fd') || n.startsWith('fe80');
}

export async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Vexora can only open http:// and https:// addresses.');
  }
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error("Vexora's proxy blocks local or internal network addresses.");
  }
  if (net.isIP(host) && isPrivateIp(host)) {
    throw new Error("Vexora's proxy blocks private-network IP ranges.");
  }
  try {
    const records = await dns.lookup(host, { all: true });
    for (const r of records) {
      if (isPrivateIp(r.address)) {
        throw new Error('Target resolves to a restricted private network.');
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('restricted')) throw err;
  }
  return parsed;
}

// --------------------------------------------------------------------------- //
//  Tokenizing JS Location & Frame-Check Rewriter
// --------------------------------------------------------------------------- //

const LOC_PROPS = new Set([
  'href',
  'origin',
  'protocol',
  'host',
  'hostname',
  'port',
  'pathname',
  'search',
  'hash',
  'assign',
  'replace',
  'reload',
  'toString',
  'valueOf',
  'ancestorOrigins',
]);
const REGEX_PREV_KW = new Set([
  'return',
  'throw',
  'case',
  'delete',
  'void',
  'typeof',
  'in',
  'instanceof',
  'new',
  'of',
  'await',
  'yield',
  'else',
  'do',
]);
const STOP_WORDS = new Set([
  'return',
  'throw',
  'case',
  'delete',
  'void',
  'typeof',
  'in',
  'instanceof',
  'of',
  'await',
  'yield',
  'else',
  'do',
  'var',
  'let',
  'const',
  'export',
  'default',
]);
const STMT_PARENS = new Set(['if', 'while', 'for', 'with', 'catch']);

function isIdentStart(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36;
}
function isIdentPart(c: number): boolean {
  return isIdentStart(c) || (c >= 48 && c <= 57);
}
function isWs(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 13;
}

function scanExprStartInCode(code: string, endIdx: number, minBound: number): number {
  let i = endIdx - 1;
  while (i >= minBound && isWs(code.charCodeAt(i))) i--;
  if (i < minBound) return -1;

  while (i >= minBound) {
    const ch = code[i];
    if (ch === ')' || ch === ']') {
      const open = ch === ')' ? '(' : '[';
      let depth = 1;
      i--;
      while (i >= minBound && depth > 0) {
        const c = code[i];
        if (c === ch) depth++;
        else if (c === open) depth--;
        else if (c === '"' || c === "'" || c === '`') {
          const q = c;
          i--;
          while (i >= minBound) {
            if (code[i] === q) {
              let bs = 0;
              let j = i - 1;
              while (j >= minBound && code[j] === '\\') {
                bs++;
                j--;
              }
              if (bs % 2 === 0) break;
            }
            i--;
          }
        }
        i--;
      }
      if (depth !== 0) return -1;
      const exprStart = i + 1;
      let j = exprStart - 1;
      while (j >= minBound && isWs(code.charCodeAt(j))) j--;
      if (j >= minBound && code[j] === '.') {
        i = j - 1 >= minBound && code[j - 1] === '?' ? j - 2 : j - 1;
        while (i >= minBound && isWs(code.charCodeAt(i))) i--;
        continue;
      }
      if (j >= minBound && isIdentPart(code.charCodeAt(j))) {
        let k = j;
        while (k >= minBound && isIdentPart(code.charCodeAt(k))) k--;
        const word = code.slice(k + 1, j + 1);
        if (STMT_PARENS.has(word) || STOP_WORDS.has(word)) {
          return exprStart;
        }
        i = j;
        continue;
      }
      return exprStart;
    } else if (isIdentPart(code.charCodeAt(i))) {
      let k = i;
      while (k >= minBound && isIdentPart(code.charCodeAt(k))) k--;
      const word = code.slice(k + 1, i + 1);
      if (STOP_WORDS.has(word)) return -1;
      let j = k;
      while (j >= minBound && isWs(code.charCodeAt(j))) j--;
      if (j >= minBound && code[j] === '.') {
        i = j - 1 >= minBound && code[j - 1] === '?' ? j - 2 : j - 1;
        while (i >= minBound && isWs(code.charCodeAt(i))) i--;
        continue;
      }
      if (
        j >= minBound + 2 &&
        code.slice(j - 2, j + 1) === 'new' &&
        (j - 3 < minBound || !isIdentPart(code.charCodeAt(j - 3)))
      ) {
        return j - 2;
      }
      return k + 1;
    } else {
      return -1;
    }
  }
  return -1;
}

function rewriteJsLocations(code: string): string {
  if (!code.includes('location') && !code.includes('top') && !code.includes('parent')) {
    return code;
  }
  const n = code.length;
  const edits: Array<{ start: number; end: number; text: string }> = [];
  let minBound = 0;
  let i = 0;
  let regexAllowed = true;
  const tmplBraces: number[] = [];

  while (i < n) {
    const cc = code.charCodeAt(i);
    if (isWs(cc)) {
      i++;
      continue;
    }

    if (cc === 47 /* / */) {
      const next = code.charCodeAt(i + 1);
      if (next === 47) {
        const end = code.indexOf('\n', i + 2);
        i = end === -1 ? n : end + 1;
        continue;
      }
      if (next === 42) {
        const end = code.indexOf('*/', i + 2);
        i = end === -1 ? n : end + 2;
        continue;
      }
      if (regexAllowed) {
        let j = i + 1;
        let inClass = false;
        while (j < n) {
          const c = code.charCodeAt(j);
          if (c === 92) {
            j += 2;
            continue;
          }
          if (c === 91) inClass = true;
          else if (c === 93) inClass = false;
          else if (c === 47 && !inClass) {
            j++;
            break;
          } else if (c === 10 || c === 13) break;
          j++;
        }
        while (j < n && isIdentPart(code.charCodeAt(j))) j++;
        i = j;
        regexAllowed = false;
        continue;
      }
    }

    if (cc === 34 || cc === 39) {
      let j = i + 1;
      while (j < n) {
        const c = code.charCodeAt(j);
        if (c === 92) {
          j += 2;
          continue;
        }
        if (c === cc) {
          j++;
          break;
        }
        j++;
      }
      i = j;
      regexAllowed = false;
      continue;
    }

    if (cc === 96 /* ` */) {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        const c = code.charCodeAt(j);
        if (c === 92) {
          j += 2;
          continue;
        }
        if (c === 36 && code.charCodeAt(j + 1) === 123) {
          i = j + 2;
          tmplBraces.push(1);
          regexAllowed = true;
          closed = true;
          break;
        }
        if (c === 96) {
          j++;
          break;
        }
        j++;
      }
      if (!closed) {
        i = j;
        regexAllowed = false;
      }
      continue;
    }

    if (cc === 123 && tmplBraces.length) {
      tmplBraces[tmplBraces.length - 1]++;
      i++;
      regexAllowed = true;
      continue;
    }
    if (cc === 125 && tmplBraces.length) {
      tmplBraces[tmplBraces.length - 1]--;
      if (tmplBraces[tmplBraces.length - 1] === 0) {
        tmplBraces.pop();
        let j = i + 1;
        let closed = false;
        while (j < n) {
          const c = code.charCodeAt(j);
          if (c === 92) {
            j += 2;
            continue;
          }
          if (c === 36 && code.charCodeAt(j + 1) === 123) {
            i = j + 2;
            tmplBraces.push(1);
            regexAllowed = true;
            closed = true;
            break;
          }
          if (c === 96) {
            j++;
            break;
          }
          j++;
        }
        if (!closed) {
          i = j;
          regexAllowed = false;
        }
        continue;
      }
      i++;
      regexAllowed = true;
      continue;
    }

    if (isIdentStart(cc)) {
      let j = i + 1;
      while (j < n && isIdentPart(code.charCodeAt(j))) j++;
      const word = code.slice(i, j);

      if (word === 'location' || word === 'top' || word === 'parent') {
        let p = i - 1;
        while (p >= minBound && isWs(code.charCodeAt(p))) p--;
        const hasDot = p >= minBound && code[p] === '.' && (p === 0 || code[p - 1] !== '.');
        const hasOptDot = hasDot && p - 1 >= minBound && code[p - 1] === '?';

        let q = j;
        while (q < n && isWs(code.charCodeAt(q))) q++;
        const nextCh = code[q] || '';
        const next2 = code.slice(q, q + 2);
        const isAssign =
          (nextCh === '=' && next2 !== '==' && next2 !== '=>') ||
          next2 === '+=' ||
          next2 === '-=' ||
          next2 === '++' ||
          next2 === '--';

        if (hasDot && (word === 'top' || word === 'parent') && !isAssign && nextCh !== ':') {
          const dotIdx = hasOptDot ? p - 1 : p;
          let b = dotIdx - 1;
          while (b >= minBound && isWs(code.charCodeAt(b))) b--;
          let bStart = b;
          while (bStart >= minBound && isIdentPart(code.charCodeAt(bStart))) bStart--;
          const baseIdent = code.slice(bStart + 1, b + 1);
          let beforeBase = bStart;
          while (beforeBase >= 0 && isWs(code.charCodeAt(beforeBase))) beforeBase--;
          const baseNotMember = beforeBase < 0 || code[beforeBase] !== '.';
          if (
            baseNotMember &&
            (baseIdent === 'window' || baseIdent === 'self' || baseIdent === 'globalThis')
          ) {
            if (nextCh === '.' || next2 === '?.') {
              let lk = next2 === '?.' ? q + 2 : q + 1;
              while (lk < n && isWs(code.charCodeAt(lk))) lk++;
              let le = lk;
              while (le < n && isIdentPart(code.charCodeAt(le))) le++;
              if (code.slice(lk, le) === 'location') {
                edits.push({ start: bStart + 1, end: le, text: 'globalThis.__vxLoc' });
                minBound = le;
                i = le;
                regexAllowed = false;
                continue;
              }
            }
            edits.push({ start: bStart + 1, end: j, text: 'globalThis' });
            minBound = j;
            i = j;
            regexAllowed = false;
            continue;
          }
        }

        if (hasDot && word === 'location') {
          const dotIdx = hasOptDot ? p - 1 : p;
          const exprStart = scanExprStartInCode(code, dotIdx, minBound);
          if (exprStart !== -1) {
            const expr = code.slice(exprStart, dotIdx).trim();
            let beforeExpr = exprStart - 1;
            while (beforeExpr >= 0 && isWs(code.charCodeAt(beforeExpr))) beforeExpr--;
            const prevSlice = code.slice(Math.max(0, beforeExpr - 10), beforeExpr + 1);
            if (!/(?:^|[^\w$])delete$/.test(prevSlice)) {
              if (isAssign) {
                if (
                  expr === 'window' ||
                  expr === 'self' ||
                  expr === 'document' ||
                  expr === 'top' ||
                  expr === 'parent' ||
                  expr === 'globalThis'
                ) {
                  edits.push({ start: exprStart, end: j, text: 'globalThis.__vxLoc' });
                  minBound = j;
                  i = j;
                  regexAllowed = false;
                  continue;
                }
              } else {
                edits.push({ start: exprStart, end: j, text: `globalThis.__vxL(${expr})` });
                minBound = j;
                i = j;
                regexAllowed = false;
                continue;
              }
            }
          }
        }

        if (!hasDot && word === 'location' && nextCh !== ':') {
          const prevSlice = code.slice(Math.max(0, p - 12), p + 1);
          const isDecl = /(?:^|[^\w$])(?:var|let|const|function|class)$/.test(prevSlice);
          if (!isDecl) {
            let propOk = false;
            if (nextCh === '.' || next2 === '?.') {
              let pk = next2 === '?.' ? q + 2 : q + 1;
              while (pk < n && isWs(code.charCodeAt(pk))) pk++;
              let pe = pk;
              while (pe < n && isIdentPart(code.charCodeAt(pe))) pe++;
              if (LOC_PROPS.has(code.slice(pk, pe))) propOk = true;
            } else if (nextCh === '=' && next2 !== '==' && next2 !== '=>') {
              if (code[p] !== '{' && code[p] !== ',') propOk = true;
            }
            if (propOk) {
              edits.push({ start: i, end: j, text: 'globalThis.__vxLoc' });
              minBound = j;
              i = j;
              regexAllowed = false;
              continue;
            }
          }
        }
      }

      i = j;
      regexAllowed = REGEX_PREV_KW.has(word);
      continue;
    }

    if (cc >= 48 && cc <= 57) {
      let j = i + 1;
      while (j < n && (isIdentPart(code.charCodeAt(j)) || code[j] === '.')) j++;
      i = j;
      regexAllowed = false;
      continue;
    }

    if (cc === 41 || cc === 93) regexAllowed = false;
    else if (cc === 43 && code.charCodeAt(i + 1) === 43) {
      i += 2;
      regexAllowed = false;
      continue;
    } else if (cc === 45 && code.charCodeAt(i + 1) === 45) {
      i += 2;
      regexAllowed = false;
      continue;
    } else regexAllowed = true;
    i++;
  }

  if (!edits.length) return code;
  const parts: string[] = [];
  let pos = 0;
  for (const e of edits) {
    if (e.start < pos) continue;
    if (e.start > pos) parts.push(code.slice(pos, e.start));
    parts.push(e.text);
    pos = e.end;
  }
  if (pos < n) parts.push(code.slice(pos));
  return parts.join('');
}

// --------------------------------------------------------------------------- //
//  Vexora 2.0 Page Bridge
// --------------------------------------------------------------------------- //

const INJECT_JS = `/* Vexora 2.0 page bridge */
(function () {
  'use strict';
  var C = window.__VX;
  if (!C || window.__vxInit) return;
  window.__vxInit = 1;
  var _realWin = window;
  var _realDoc = document;
  var _realTop = null;
  var _realParent = null;
  try { _realTop = window.top; } catch (e) {}
  try { _realParent = window.parent; } catch (e) {}
  var P = (window.location && window.location.origin && window.location.origin !== 'null')
    ? window.location.origin
    : C.proxyOrigin;
  var _parentPost = null;
  try { _parentPost = _realParent && _realParent.postMessage ? _realParent.postMessage.bind(_realParent) : null; } catch (e) {}

  function send(m) {
    m.vx = 1;
    try { if (_parentPost) _parentPost(m, '*'); } catch (e) {}
  }

  function isOurs(a) {
    return a.indexOf(P + '/proxy') === 0 ||
      a.indexOf(P + '/__vx') === 0 ||
      a.indexOf(P + '/api/') === 0 ||
      a.indexOf('/proxy?') === 0 ||
      a.indexOf('/proxy-ws?') === 0;
  }

  function unwrapProxy(u) {
    try {
      var parsed = new URL(String(u || ''), P);
      if (parsed.origin === P && parsed.pathname === '/proxy') {
        var inner = parsed.searchParams.get('url');
        if (inner) return inner;
      }
    } catch (e) {}
    return u;
  }

  function abs(u) {
    try {
      var raw = unwrapProxy(String(u || ''));
      if (/^(data|blob|javascript|mailto|tel|sms|about|whatsapp):/i.test(raw)) return raw;
      return new URL(raw, C.base).href;
    } catch (e) { return String(u || ''); }
  }

  function prox(u) {
    if (u == null) return u;
    var s = String(u);
    if (!s || s.charAt(0) === '#' || /^(data|blob|javascript|mailto|tel|sms|about|whatsapp):/i.test(s)) return s;
    if (isOurs(s)) return s;
    var a = abs(s);
    if (/^https?:/i.test(a) && !isOurs(a)) {
      if (a === P || a.indexOf(P + '/') === 0 || a.indexOf(P + '?') === 0) {
        try { a = new URL(C.page).origin + a.slice(P.length); } catch (e) {}
      }
      return P + '/proxy?url=' + encodeURIComponent(a) + '&s=' + (C.shield ? 1 : 0) + '&p=' + (C.priv ? 1 : 0) + '&ref=' + encodeURIComponent(C.page);
    }
    return s;
  }

  function proxWs(u) {
    var s = String(u || '');
    if (s.indexOf('/proxy-ws?') !== -1) return s;
    var absTarget = s;
    if (s.indexOf('ws://') !== 0 && s.indexOf('wss://') !== 0) {
      var httpAbs = abs(s);
      absTarget = httpAbs.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
    }
    var wsProto = P.indexOf('https:') === 0 ? 'wss:' : 'ws:';
    var hostPort = P.replace(/^https?:\\/\\//i, '');
    return wsProto + '//' + hostPort + '/proxy-ws?target=' + encodeURIComponent(absTarget) + '&p=' + (C.priv ? 1 : 0);
  }

  function go(url) {
    var next = abs(url);
    if (/^https?:/i.test(next)) send({ t: 'nav', url: next });
  }

  function getU() {
    try { return new URL(C.page); } catch (e) { return new URL('https://example.com/'); }
  }

  var vxLoc = {
    get href() { return C.page; },
    set href(v) { go(v); },
    get origin() { return getU().origin; },
    get protocol() { return getU().protocol; },
    get host() { return getU().host; },
    get hostname() { return getU().hostname; },
    get port() { return getU().port; },
    get pathname() { return getU().pathname; },
    set pathname(v) {
      var u = getU();
      u.pathname = v;
      go(u.href);
    },
    get search() { return getU().search; },
    set search(v) {
      var u = getU();
      u.search = v;
      go(u.href);
    },
    get hash() { return getU().hash; },
    set hash(v) {
      var u = getU();
      u.hash = v;
      C.page = u.href;
      try { send({ t: 'push', url: C.page, title: document.title, replace: true }); } catch (e) {}
    },
    assign: function (v) { go(v); },
    replace: function (v) { go(v); },
    reload: function () { send({ t: 'reload' }); },
    toString: function () { return C.page; },
    valueOf: function () { return C.page; },
    ancestorOrigins: { length: 0, item: function () { return null; }, contains: function () { return false; } }
  };

  try {
    Object.defineProperty(globalThis, '__vxLoc', {
      configurable: true,
      get: function () { return vxLoc; },
      set: function (v) { go(v); }
    });
  } catch (e) {}

  globalThis.__vxL = function (obj) {
    if (
      obj === globalThis ||
      obj === self ||
      obj === _realWin ||
      obj === _realDoc ||
      (_realTop && obj === _realTop) ||
      (_realParent && obj === _realParent)
    ) {
      return vxLoc;
    }
    return obj == null ? undefined : obj.location;
  };

  try {
    Object.defineProperty(window, 'origin', {
      configurable: true,
      get: function () { return getU().origin; }
    });
  } catch (e) {}

  try {
    Object.defineProperty(window, 'frameElement', {
      configurable: true,
      get: function () { return null; }
    });
  } catch (e) {}

  // Align document URL properties without clobbering iframe /proxy URL
  try {
    Object.defineProperty(document, 'URL', { configurable: true, get: function () { return C.page; } });
    Object.defineProperty(document, 'documentURI', { configurable: true, get: function () { return C.page; } });
    Object.defineProperty(document, 'baseURI', { configurable: true, get: function () { return C.base; } });
  } catch (e) {}

  // Isolate proxied site storage in-memory
  try {
    var makeMemStorage = function () {
      var map = Object.create(null);
      return {
        get length() { return Object.keys(map).length; },
        clear: function () { map = Object.create(null); },
        getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
        key: function (i) { return Object.keys(map)[i] || null; },
        removeItem: function (k) { delete map[String(k)]; },
        setItem: function (k, v) { map[String(k)] = String(v); }
      };
    };
    Object.defineProperty(window, 'localStorage', { value: makeMemStorage(), configurable: true });
    Object.defineProperty(window, 'sessionStorage', { value: makeMemStorage(), configurable: true });
  } catch (e) {}

  // Virtual document.cookie per proxied origin + server CookieJar sync
  var _rawFetch = window.fetch ? window.fetch.bind(window) : null;
  try {
    var _cookieMap = Object.create(null);
    if (C.cookies) {
      String(C.cookies).split(';').forEach(function (part) {
        var idx = part.indexOf('=');
        if (idx > -1) {
          var k = part.slice(0, idx).trim();
          var v = part.slice(idx + 1).trim();
          if (k) _cookieMap[k] = v;
        }
      });
    }
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: function () {
        return Object.keys(_cookieMap).map(function (k) { return k + '=' + _cookieMap[k]; }).join('; ');
      },
      set: function (val) {
        var str = String(val || '');
        var first = str.split(';')[0] || '';
        var idx = first.indexOf('=');
        if (idx === -1) return;
        var k = first.slice(0, idx).trim();
        var v = first.slice(idx + 1).trim();
        if (!k) return;
        if (/max-age\\s*=\\s*0/i.test(str) || v === 'deleted') {
          delete _cookieMap[k];
        } else {
          _cookieMap[k] = v;
        }
        try {
          if (_rawFetch) {
            _rawFetch(P + '/api/proxy/cookie?p=' + (C.priv ? 1 : 0), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: C.page, setCookie: str }),
              keepalive: true
            }).catch(function () {});
          }
        } catch (e) {}
      }
    });
  } catch (e) {}

  // Safe document.domain & document.referrer
  try {
    Object.defineProperty(document, 'domain', {
      configurable: true,
      get: function () { return getU().hostname; },
      set: function () {}
    });
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      get: function () { return C.page; }
    });
  } catch (e) {}

  // Bridge postMessage targetOrigin & MessageEvent.origin cleanly inside proxied frames
  try {
    var origPostMsg = Window.prototype.postMessage;
    var wrapPostMsg = function (origFn, winTarget, args) {
      var msg = args[0];
      var targetOriginOrOpts = args[1];
      var transfer = args[2];
      if (typeof targetOriginOrOpts === 'string' && targetOriginOrOpts !== '*' && targetOriginOrOpts !== '/' && targetOriginOrOpts !== P) {
        try {
          var uo = new URL(targetOriginOrOpts);
          if (uo.protocol === 'http:' || uo.protocol === 'https:') {
            targetOriginOrOpts = P;
          }
        } catch (e) {}
      } else if (targetOriginOrOpts && typeof targetOriginOrOpts === 'object' && targetOriginOrOpts.targetOrigin && targetOriginOrOpts.targetOrigin !== '*' && targetOriginOrOpts.targetOrigin !== P) {
        targetOriginOrOpts = Object.assign({}, targetOriginOrOpts, { targetOrigin: P });
      }
      return transfer !== undefined
        ? origFn.call(winTarget, msg, targetOriginOrOpts, transfer)
        : origFn.call(winTarget, msg, targetOriginOrOpts);
    };
    Window.prototype.postMessage = function () {
      return wrapPostMsg(origPostMsg, this, arguments);
    };
    window.postMessage = function () {
      return wrapPostMsg(origPostMsg, window, arguments);
    };
    var msgOriginDesc = Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'origin');
    if (msgOriginDesc && msgOriginDesc.get) {
      Object.defineProperty(MessageEvent.prototype, 'origin', {
        configurable: true,
        get: function () {
          var realOrigin = msgOriginDesc.get.call(this);
          if (realOrigin === P) {
            try {
              if (this.source && this.source !== _realParent && this.source.__vxLoc) {
                return this.source.__vxLoc.origin;
              }
            } catch (e) {}
            if (!this.data || !this.data.vx) return getU().origin;
          }
          return realOrigin;
        }
      });
    }
  } catch (e) {}

  // Stub navigator.serviceWorker
  try {
    var swStub = {
      register: function () {
        return Promise.resolve({
          scope: '/',
          active: null,
          installing: null,
          waiting: null,
          unregister: function () { return Promise.resolve(false); },
          update: function () { return Promise.resolve(); },
          addEventListener: function () {},
          removeEventListener: function () {}
        });
      },
      getRegistration: function () { return Promise.resolve(undefined); },
      getRegistrations: function () { return Promise.resolve([]); },
      addEventListener: function () {},
      removeEventListener: function () {},
      ready: new Promise(function () {}),
      controller: null
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      get: function () { return swStub; }
    });
  } catch (e) {}

  // Track JS text Blobs so Blob Workers also get proxied fetch/XHR/WS shims
  var _jsBlobBodies = new Map();
  try {
    var OrigBlob = window.Blob;
    var OrigCreateObjUrl = URL.createObjectURL.bind(URL);
    var _blobMeta = new WeakMap();
    window.Blob = function (parts, opts) {
      var b = opts !== undefined ? new OrigBlob(parts, opts) : new OrigBlob(parts);
      try {
        if (opts && /javascript/i.test(String(opts.type || '')) && Array.isArray(parts) && parts.every(function (x) { return typeof x === 'string'; })) {
          _blobMeta.set(b, parts.join(''));
        }
      } catch (e) {}
      return b;
    };
    window.Blob.prototype = OrigBlob.prototype;
    URL.createObjectURL = function (obj) {
      var u = OrigCreateObjUrl(obj);
      try {
        if (_blobMeta.has(obj)) _jsBlobBodies.set(u, _blobMeta.get(obj));
      } catch (e) {}
      return u;
    };
  } catch (e) {}

  function buildClientWorkerShim() {
    return '(function(){var B=' + JSON.stringify(C.base) + ',P=' + JSON.stringify(P) + ',S=' + (C.shield ? 1 : 0) + ',PV=' + (C.priv ? 1 : 0) + ';' +
      'var _u;try{_u=new URL(B)}catch(e){_u=new URL("https://example.com/")}' +
      'globalThis.__vxLoc={get href(){return B},get origin(){return _u.origin},get protocol(){return _u.protocol},get host(){return _u.host},get hostname(){return _u.hostname},get port(){return _u.port},get pathname(){return _u.pathname},get search(){return _u.search},get hash(){return _u.hash},toString:function(){return B},valueOf:function(){return B}};' +
      'globalThis.__vxL=function(o){return(o===globalThis||o===self)?globalThis.__vxLoc:(o==null?undefined:o.location)};' +
      'function px(u){try{var s=String(u||"");if(!s||/^(data|blob):/i.test(s)||s.indexOf("/proxy?")!==-1)return s;var a=new URL(s,B).href;if(/^https?:/i.test(a))return P+"/proxy?url="+encodeURIComponent(a)+"&s="+S+"&p="+PV+"&ref="+encodeURIComponent(B)}catch(e){}return u}' +
      'if(self.fetch){var f=self.fetch;self.fetch=function(i,init){if(typeof i==="string"||i instanceof URL)i=px(i);else if(i&&i.url)i=new Request(px(i.url),i);return f.call(self,i,init)};}' +
      'if(self.XMLHttpRequest){var o=self.XMLHttpRequest.prototype.open;self.XMLHttpRequest.prototype.open=function(){var a=Array.prototype.slice.call(arguments);a[1]=px(a[1]);return o.apply(this,a)};}' +
      'if(self.importScripts){var is=self.importScripts;self.importScripts=function(){var a=Array.prototype.slice.call(arguments).map(px);return is.apply(self,a)};}' +
      'if(self.WebSocket){var WS=self.WebSocket;self.WebSocket=function(u,p){var wp=P.indexOf("https:")===0?"wss:":"ws:";var t=wp+"//"+P.replace(/^https?:\\/\\//i,"")+"/proxy-ws?target="+encodeURIComponent(u)+"&p="+PV;return p!==undefined?new WS(t,p):new WS(t)};self.WebSocket.prototype=WS.prototype;}' +
      '})();\\n';
  }

  try {
    if (window.fetch) {
      var of = window.fetch;
      window.fetch = function (i, init) {
        try {
          if (typeof i === 'string' || i instanceof URL) {
            i = prox(i);
          } else if (i && i.url) {
            var n = prox(i.url);
            if (n !== i.url) {
              if (init) {
                i = new Request(n, init);
              } else {
                var clonedOpts = {
                  method: i.method,
                  headers: i.headers,
                  credentials: i.credentials,
                  redirect: i.redirect,
                  mode: i.mode === 'navigate' ? 'same-origin' : i.mode
                };
                if (i.method !== 'GET' && i.method !== 'HEAD' && i.body) {
                  clonedOpts.body = i.clone().body;
                  clonedOpts.duplex = 'half';
                }
                i = new Request(n, clonedOpts);
              }
            }
          }
        } catch (e) {}
        return of.call(window, i, init);
      };
    }

    var ox = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function () {
      var a = Array.prototype.slice.call(arguments);
      a[1] = prox(a[1]);
      return ox.apply(this, a);
    };

    if (navigator.sendBeacon) {
      var ob = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function (u, d) { return ob(prox(u), d); };
    }

    if (window.WebSocket) {
      var OWS = window.WebSocket;
      window.WebSocket = function (url, protocols) {
        var target = proxWs(url);
        return protocols !== undefined ? new OWS(target, protocols) : new OWS(target);
      };
      window.WebSocket.prototype = OWS.prototype;
      window.WebSocket.CONNECTING = OWS.CONNECTING;
      window.WebSocket.OPEN = OWS.OPEN;
      window.WebSocket.CLOSING = OWS.CLOSING;
      window.WebSocket.CLOSED = OWS.CLOSED;
    }

    if (window.Worker) {
      var OWorker = window.Worker;
      window.Worker = function (scriptUrl, options) {
        var su = String(scriptUrl || '');
        if (su.indexOf('blob:') === 0 && _jsBlobBodies.has(su)) {
          var shimmed = buildClientWorkerShim() + _jsBlobBodies.get(su);
          su = URL.createObjectURL(new Blob([shimmed], { type: 'application/javascript' }));
        } else {
          su = prox(su);
          if (su.indexOf('/proxy?') !== -1 && su.indexOf('&wk=1') === -1) su += '&wk=1';
        }
        return options !== undefined ? new OWorker(su, options) : new OWorker(su);
      };
      window.Worker.prototype = OWorker.prototype;
    }

    if (window.SharedWorker) {
      var OSWorker = window.SharedWorker;
      window.SharedWorker = function (scriptUrl, options) {
        var su = prox(String(scriptUrl || ''));
        if (su.indexOf('/proxy?') !== -1 && su.indexOf('&wk=1') === -1) su += '&wk=1';
        return options !== undefined ? new OSWorker(su, options) : new OSWorker(su);
      };
      window.SharedWorker.prototype = OSWorker.prototype;
    }

    if (window.EventSource) {
      var OES = window.EventSource;
      window.EventSource = function (url, init) {
        return new OES(prox(url), init);
      };
      window.EventSource.prototype = OES.prototype;
    }
  } catch (e) {}

  // Intercept dynamic DOM resource loading (including TrustedScriptURL objects)
  var origSetAttr = Element.prototype.setAttribute;
  try {
    Element.prototype.setAttribute = function (name, value) {
      var lower = String(name).toLowerCase();
      if (lower === 'integrity' || lower === 'crossorigin') return;
      if ((lower === 'src' || lower === 'poster' || lower === 'data-src') && value != null) {
        value = prox(String(value));
      } else if (lower === 'href' && value != null && this.tagName !== 'A') {
        value = prox(String(value));
      } else if (lower === 'action' && value != null && this.tagName === 'FORM') {
        var m = (this.getAttribute('method') || 'get').toLowerCase();
        if (m === 'post') value = prox(String(value));
      }
      return origSetAttr.call(this, name, value);
    };

    var patchProp = function (proto, prop) {
      if (!proto) return;
      var desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (!desc || !desc.set || !desc.get) return;
      Object.defineProperty(proto, prop, {
        configurable: true,
        enumerable: desc.enumerable,
        get: function () { return unwrapProxy(desc.get.call(this)); },
        set: function (v) { return desc.set.call(this, prox(v)); }
      });
    };
    patchProp(HTMLScriptElement.prototype, 'src');
    patchProp(HTMLImageElement.prototype, 'src');
    patchProp(HTMLLinkElement.prototype, 'href');
    patchProp(HTMLIFrameElement.prototype, 'src');
    patchProp(HTMLSourceElement.prototype, 'src');
    patchProp(HTMLMediaElement.prototype, 'src');

    // Expose __vxLoc / __vxL into dynamically created about:blank iframes
    var cwDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    if (cwDesc && cwDesc.get) {
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
        configurable: true,
        get: function () {
          var cw = cwDesc.get.call(this);
          try {
            if (cw && !cw.__vxL && cw.location && cw.location.href === 'about:blank') {
              cw.__vxLoc = vxLoc;
              cw.__vxL = globalThis.__vxL;
            }
          } catch (e) {}
          return cw;
        }
      });
    }
  } catch (e) {}

  // Ensure innerHTML-injected elements rewrite src/href/target before fetching
  try {
    var fixInsertedNode = function (node) {
      if (!node || node.nodeType !== 1) return;
      var fixOne = function (el) {
        var tag = el.tagName;
        if (!tag) return;
        if (tag === 'A') {
          var tgt = el.getAttribute('target');
          if (tgt === '_top' || tgt === '_parent') origSetAttr.call(el, 'target', '_self');
          return;
        }
        if (tag === 'SCRIPT' || tag === 'IMG' || tag === 'IFRAME' || tag === 'VIDEO' || tag === 'AUDIO' || tag === 'SOURCE' || tag === 'EMBED') {
          var s = el.getAttribute('src');
          if (s && !isOurs(s) && !/^(data|blob|javascript|about):/i.test(s)) {
            origSetAttr.call(el, 'src', prox(s));
          }
          if (el.hasAttribute('integrity')) el.removeAttribute('integrity');
          if (el.hasAttribute('crossorigin')) el.removeAttribute('crossorigin');
        }
        if (tag === 'LINK') {
          var h = el.getAttribute('href');
          if (h && !isOurs(h) && !/^(data|blob|javascript):/i.test(h)) {
            origSetAttr.call(el, 'href', prox(h));
          }
          if (el.hasAttribute('integrity')) el.removeAttribute('integrity');
          if (el.hasAttribute('crossorigin')) el.removeAttribute('crossorigin');
        }
      };
      fixOne(node);
      if (node.querySelectorAll) {
        var list = node.querySelectorAll('script[src],img[src],iframe[src],video[src],audio[src],source[src],link[href],a[target]');
        for (var k = 0; k < list.length; k++) fixOne(list[k]);
      }
    };
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) fixInsertedNode(added[j]);
      }
    });
    if (document.documentElement) {
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  } catch (e) {}

  window.open = function (u) {
    if (u) send({ t: 'open', url: abs(u) });
    return null;
  };

  ['pushState', 'replaceState'].forEach(function (k) {
    var o = History.prototype[k];
    var patched = function (s, t, u) {
      if (u == null) {
        try { return o.call(history, s, t); } catch (e) { return; }
      }
      try {
        var cur = new URL(String(u), P);
        if (cur.origin === P && cur.pathname === '/proxy') {
          var inner = cur.searchParams.get('url');
          if (inner) u = inner;
        }
      } catch (e) {}
      var a = abs(String(u));
      C.page = a;
      C.base = a;
      try {
        var proxNav = P + '/proxy?url=' + encodeURIComponent(a) + '&s=' + (C.shield ? 1 : 0) + '&p=' + (C.priv ? 1 : 0);
        o.call(history, s, t, proxNav);
      } catch (e) {}
      send({ t: 'push', url: a, title: document.title, replace: k === 'replaceState' });
    };
    try { History.prototype[k] = patched; } catch (e) {}
    try { Object.defineProperty(history, k, { value: patched, configurable: true, writable: true }); } catch (e) {}
  });

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var raw = a.getAttribute('href') || '';
    if (!raw || /^(javascript|mailto|tel|data|blob|sms|whatsapp):/i.test(raw)) return;
    if (raw.charAt(0) === '#') {
      e.preventDefault();
      var id = decodeURIComponent(raw.slice(1));
      var el = id ? (document.getElementById(id) || document.getElementsByName(id)[0]) : null;
      if (el) el.scrollIntoView(); else if (!id) scrollTo(0, 0);
      return;
    }
    var url = abs(raw);
    if (!/^https?:/i.test(url)) return;
    var newTab = e.ctrlKey || e.metaKey || e.button === 1 || (a.target && a.target !== '_self' && a.target !== '_top' && a.target !== '_parent');
    e.preventDefault();
    if (newTab) send({ t: 'open', url: url, bg: !!(e.ctrlKey || e.metaKey || e.button === 1) });
    else go(url);
  }, true);

  try {
    var origAClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      var raw = this.getAttribute('href') || '';
      if (raw && raw.charAt(0) !== '#' && !/^(data|blob|javascript|mailto|tel|sms|about|whatsapp):/i.test(raw)) {
        var url = abs(raw);
        if (/^https?:/i.test(url)) {
          if (this.target && this.target !== '_self' && this.target !== '_top' && this.target !== '_parent') {
            send({ t: 'open', url: url, bg: false });
          } else {
            go(url);
          }
          return;
        }
      }
      return origAClick.apply(this, arguments);
    };
  } catch (e) {}

  document.addEventListener('submit', function (e) {
    if (e.defaultPrevented || !e.target || e.target.tagName !== 'FORM') return;
    var f = e.target;
    var m = (f.getAttribute('method') || 'get').toLowerCase();
    var act = f.getAttribute('action') ? abs(f.getAttribute('action')) : C.page;
    if (m === 'get') {
      e.preventDefault();
      try {
        var u = new URL(act);
        var fd = new FormData(f);
        u.search = new URLSearchParams(fd).toString();
        go(u.href);
      } catch (x) { go(act); }
    } else {
      origSetAttr.call(f, 'action', P + '/proxy?url=' + encodeURIComponent(act) + '&s=' + (C.shield ? 1 : 0) + '&p=' + (C.priv ? 1 : 0));
    }
  }, true);

  try {
    var origFormSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () {
      var m = (this.getAttribute('method') || this.method || 'get').toLowerCase();
      var rawAct = this.getAttribute('action') || '';
      var act = rawAct ? abs(rawAct) : C.page;
      if (m === 'get') {
        try {
          var u = new URL(act);
          var fd = new FormData(this);
          u.search = new URLSearchParams(fd).toString();
          go(u.href);
          return;
        } catch (x) { go(act); return; }
      } else {
        origSetAttr.call(this, 'action', P + '/proxy?url=' + encodeURIComponent(act) + '&s=' + (C.shield ? 1 : 0) + '&p=' + (C.priv ? 1 : 0));
      }
      return origFormSubmit.apply(this, arguments);
    };
  } catch (e) {}

  var lastTitle = null;
  function loaded() {
    lastTitle = document.title;
    send({ t: 'loaded', url: C.page, title: document.title || '', blocked: C.blocked || 0, blockedHosts: C.blockedHosts || [] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loaded);
  else loaded();

  setInterval(function () {
    if (document.title !== lastTitle) {
      lastTitle = document.title;
      send({ t: 'title', title: lastTitle });
    }
  }, 800);

  addEventListener('focus', function () { send({ t: 'focus' }); });
  addEventListener('mousedown', function () { send({ t: 'focus' }); }, true);

  addEventListener('keydown', function (e) {
    var k = e.key, m = e.ctrlKey || e.metaKey, a = e.altKey, c = e.code || '';
    var block = (m && !a && /^[kldfbhr=\\-+0,]$/i.test(k)) || (m && e.shiftKey && /^[sdpn]$/i.test(k)) || k === 'F5' || k === 'F6';
    if (block) e.preventDefault();
    if (block || k === 'Escape') send({ t: 'key', key: k, code: c, ctrl: m, alt: a, shift: e.shiftKey });
  }, true);

  var DARK = 'html{filter:invert(1) hue-rotate(180deg)!important;background:#fff!important}' +
             'img,video,picture,canvas,iframe,svg image,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important}';

  addEventListener('message', function (e) {
    if (!e.data || e.data.vx !== 1) return;
    var d = e.data;
    if (d.c === 'zoom') document.documentElement.style.zoom = d.v === 1 ? '' : d.v;
    else if (d.c === 'dark') {
      var s = document.getElementById('vx-dark');
      if (d.on && !s) {
        s = document.createElement('style');
        s.id = 'vx-dark';
        s.textContent = DARK;
        (document.head || document.documentElement).appendChild(s);
      } else if (!d.on && s) s.remove();
    } else if (d.c === 'find') {
      var q = d.q || '', sel = window.getSelection();
      if (!q) { sel.removeAllRanges(); send({ t: 'find', count: 0 }); return; }
      var count = 0;
      try {
        var re = new RegExp(q.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'), 'gi');
        var mat = (document.body.innerText || '').match(re);
        count = mat ? mat.length : 0;
      } catch (x) {}
      var ok = false;
      try { ok = window.find(q, false, !!d.back, true, false, false, false); } catch (x) {}
      send({ t: 'find', count: count, ok: ok });
    } else if (d.c === 'print') window.print();
    else if (d.c === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
    else if (d.c === 'stop') window.stop();
  });
})();`;

function buildWorkerShim(baseUrl: string, proxyOrigin: string, shield: boolean, priv: boolean): string {
  return `(function(){
  var B=${JSON.stringify(baseUrl)},P=${JSON.stringify(proxyOrigin)},S=${shield ? 1 : 0},PV=${priv ? 1 : 0};
  var _u;try{_u=new URL(B);}catch(e){_u=new URL("https://example.com/");}
  globalThis.__vxLoc={
    get href(){return B;},get origin(){return _u.origin;},get protocol(){return _u.protocol;},
    get host(){return _u.host;},get hostname(){return _u.hostname;},get port(){return _u.port;},
    get pathname(){return _u.pathname;},get search(){return _u.search;},get hash(){return _u.hash;},
    toString:function(){return B;},valueOf:function(){return B;}
  };
  globalThis.__vxL=function(o){return(o===globalThis||o===self)?globalThis.__vxLoc:(o==null?undefined:o.location);};
  function px(u){
    try{
      var s=String(u||'');
      if(!s||/^(data|blob):/i.test(s)||s.indexOf('/proxy?')!==-1)return s;
      var a=new URL(s,B).href;
      if(/^https?:/i.test(a))return P+'/proxy?url='+encodeURIComponent(a)+'&s='+S+'&p='+PV+'&ref='+encodeURIComponent(B);
    }catch(e){}
    return u;
  }
  if(self.fetch){var f=self.fetch;self.fetch=function(i,init){if(typeof i==='string'||i instanceof URL)i=px(i);else if(i&&i.url)i=new Request(px(i.url),i);return f.call(self,i,init);};}
  if(self.XMLHttpRequest){var o=self.XMLHttpRequest.prototype.open;self.XMLHttpRequest.prototype.open=function(){var a=Array.prototype.slice.call(arguments);a[1]=px(a[1]);return o.apply(this,a);};}
  if(self.importScripts){var is=self.importScripts;self.importScripts=function(){var a=Array.prototype.slice.call(arguments).map(px);return is.apply(self,a);};}
  if(self.WebSocket){var WS=self.WebSocket;self.WebSocket=function(u,p){var wp=P.indexOf('https:')===0?'wss:':'ws:';var t=wp+'//'+P.replace(/^https?:\\/\\//i,'')+'/proxy-ws?target='+encodeURIComponent(u)+'&p='+PV;return p!==undefined?new WS(t,p):new WS(t);};self.WebSocket.prototype=WS.prototype;}
})();\n`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderProxyErrorPage(status: number, title: string, message: string, targetUrl = ''): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080b14;color:#e8eeff;font:15px/1.55 system-ui,-apple-system,sans-serif}.card{max-width:520px;margin:24px;padding:34px;border:1px solid #8aa6ff22;border-radius:20px;background:#0e1424ee;box-shadow:0 20px 60px #0008}.code{display:inline-block;font:600 12px ui-monospace,monospace;color:#19e3ff;background:#19e3ff14;border:1px solid #19e3ff33;padding:3px 10px;border-radius:99px}h1{margin:16px 0 8px;font-size:24px}p{margin:0 0 8px;color:#9aa7cc}code{color:#cfd9ff;word-break:break-all;font-size:12px}button{margin-top:16px;border:0;border-radius:10px;padding:10px 18px;font:600 13px inherit;color:#fff;cursor:pointer;background:linear-gradient(90deg,#2a5bff,#8a3dff)}</style></head><body><div class="card"><span class="code">ERROR ${status}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><code>${escapeHtml(targetUrl)}</code></p><button onclick="location.reload()">Try again</button></div><script>try{parent.postMessage({vx:1,t:"loaded",url:${JSON.stringify(targetUrl)},title:${JSON.stringify(title)},blocked:0,error:true},"*")}catch(e){}</script></body></html>`;
}

function toProxiedResourceUrl(
  raw: string,
  base: string,
  proxyOrigin: string,
  shield: boolean,
  priv: boolean
): string {
  const s = raw.trim();
  if (
    !s ||
    s.startsWith('#') ||
    s.startsWith('/proxy?') ||
    s.startsWith(`${proxyOrigin}/proxy?`) ||
    /^(?:data|blob|javascript|mailto|tel|sms|about|whatsapp):/i.test(s)
  ) {
    return raw;
  }
  try {
    const abs = new URL(s, base);
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return raw;
    return `/proxy?url=${encodeURIComponent(abs.href)}&s=${shield ? 1 : 0}&p=${priv ? 1 : 0}&ref=${encodeURIComponent(base)}`;
  } catch {
    return raw;
  }
}

function rewriteCssUrls(
  css: string,
  base: string,
  proxyOrigin: string,
  shield: boolean,
  priv: boolean
): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_m, q: string, u: string) => {
    const next = toProxiedResourceUrl(u, base, proxyOrigin, shield, priv);
    return `url(${q}${next}${q})`;
  });
}

function rewriteSrcset(
  srcset: string,
  base: string,
  proxyOrigin: string,
  shield: boolean,
  priv: boolean
): string {
  return srcset
    .split(',')
    .map((entry) => {
      const parts = entry.trim().split(/\s+/);
      if (!parts[0]) return entry;
      parts[0] = toProxiedResourceUrl(parts[0], base, proxyOrigin, shield, priv);
      return parts.join(' ');
    })
    .join(', ');
}

function inferRefererOrigin(target: URL, refParam: string): string {
  if (refParam) {
    try {
      return new URL(refParam).origin;
    } catch {
      // fall through
    }
  }
  const host = target.hostname.toLowerCase();
  if (hostMatches(host, 'googlevideo.com') || hostMatches(host, 'ytimg.com') || hostMatches(host, 'ggpht.com')) {
    return 'https://www.youtube.com';
  }
  if (hostMatches(host, 'fbcdn.net') || hostMatches(host, 'fbsbx.com')) {
    return 'https://www.facebook.com';
  }
  if (hostMatches(host, 'whatsapp.net')) {
    return 'https://web.whatsapp.com';
  }
  if (hostMatches(host, 'cdninstagram.com')) {
    return 'https://www.instagram.com';
  }
  return target.origin;
}

function processProxyHtml(
  rawHtml: string,
  finalUrl: string,
  proxyOrigin: string,
  shield: boolean,
  priv: boolean,
  cookiesString: string
): { html: string; blocked: number; blockedHosts: string[] } {
  const $ = cheerio.load(rawHtml);

  let base = finalUrl;
  const baseHref = $('base[href]').first().attr('href');
  if (baseHref) {
    try {
      base = new URL(baseHref, finalUrl).toString();
    } catch {
      base = finalUrl;
    }
  }

  $('base, link[rel="manifest"]').remove();
  $('meta[http-equiv="Content-Security-Policy"], meta[http-equiv="X-Frame-Options"]').remove();
  $('[integrity]').removeAttr('integrity');
  $('[crossorigin]').removeAttr('crossorigin');

  $('meta[http-equiv="refresh"]').each((_i, el) => {
    const content = $(el).attr('content') || '';
    const delayNum = Number.parseFloat(content.split(';')[0].trim() || '0');
    const urlPart = content.match(/url\s*=\s*['"]?([^'";\s]+)/i);
    if (!urlPart) {
      if (Number.isFinite(delayNum) && delayNum <= 5) $(el).remove();
      return;
    }
    try {
      const target = new URL(urlPart[1], base).toString();
      if (target === finalUrl && Number.isFinite(delayNum) && delayNum <= 5) {
        $(el).remove();
        return;
      }
      const proxied = `/proxy?url=${encodeURIComponent(target)}&s=${shield ? 1 : 0}&p=${priv ? 1 : 0}`;
      const delay = content.split(';')[0].trim() || '0';
      $(el).attr('content', `${delay};url=${proxied}`);
    } catch {
      $(el).remove();
    }
  });

  $('a[target="_top"], a[target="_parent"]').attr('target', '_self');

  let blocked = 0;
  const blockedHosts = new Set<string>();
  const pageHost = (() => {
    try {
      return new URL(finalUrl).hostname;
    } catch {
      return '';
    }
  })();

  if (shield) {
    $('script[src], iframe[src], img[src], img[data-src]').each((_i, el) => {
      const tag = (el.tagName || '').toLowerCase();
      const src = $(el).attr('src') || $(el).attr('data-src') || '';
      if (!src) return;
      try {
        const host = new URL(src, base).hostname;
        if (!isTrackerHost(host, pageHost)) return;
        blocked += 1;
        blockedHosts.add(host);
        if (tag === 'script') {
          $(el).attr('type', 'vexora/blocked').removeAttr('src');
        } else if (tag === 'iframe') {
          $(el).attr('src', 'about:blank').attr('hidden', '');
        } else {
          $(el).attr('src', BLANK_GIF).attr('width', '1').attr('height', '1');
        }
      } catch {
        // ignore invalid URL
      }
    });

    $('script:not([src])').each((_i, el) => {
      const body = $(el).html() || '';
      if (/\b(?:gtag|fbq|_gaq|adsbygoogle|__tcfapi)\s*\(/i.test(body)) {
        blocked += 1;
        blockedHosts.add('inline-tracker');
        $(el).attr('type', 'vexora/blocked').html('');
      }
    });
  }

  // Rewrite inline executable JS location accesses AND data:application/x-javascript;base64 scripts
  $('script:not([src])').each((_i, el) => {
    const type = ($(el).attr('type') || '').trim().toLowerCase();
    if (type && type !== 'text/javascript' && type !== 'application/javascript' && type !== 'module') {
      return;
    }
    const body = $(el).html();
    if (body) {
      const rewritten = rewriteJsLocations(body);
      if (rewritten !== body) $(el).html(rewritten);
    }
  });

  $('script[src^="data:"]').each((_i, el) => {
    const src = $(el).attr('src') || '';
    const m = src.match(/^data:([^,;]+(?:;[^,;]+)*)?;base64,([A-Za-z0-9+/=]+)$/i);
    if (!m) return;
    const mime = (m[1] || '').toLowerCase();
    if (!mime.includes('javascript')) return;
    try {
      const decoded = Buffer.from(m[2], 'base64').toString('utf8');
      const rewritten = rewriteJsLocations(decoded);
      if (rewritten !== decoded) {
        $(el).attr('src', `data:${m[1]};base64,${Buffer.from(rewritten, 'utf8').toString('base64')}`);
      }
    } catch {
      // ignore malformed base64
    }
  });

  // Rewrite all resource attributes
  $('script[src], img[src], iframe[src], video[src], audio[src], source[src], track[src], embed[src]').each(
    (_i, el) => {
      const val = $(el).attr('src');
      if (val) {
        $(el).attr('src', toProxiedResourceUrl(val, base, proxyOrigin, shield, priv));
      }
    }
  );

  $('img[data-src]').each((_i, el) => {
    const val = $(el).attr('data-src');
    if (val) $(el).attr('data-src', toProxiedResourceUrl(val, base, proxyOrigin, shield, priv));
  });

  $('video[poster]').each((_i, el) => {
    const val = $(el).attr('poster');
    if (val) $(el).attr('poster', toProxiedResourceUrl(val, base, proxyOrigin, shield, priv));
  });

  $('link[href], area[href]').each((_i, el) => {
    const val = $(el).attr('href');
    if (val) $(el).attr('href', toProxiedResourceUrl(val, base, proxyOrigin, shield, priv));
  });

  $('[srcset]').each((_i, el) => {
    const val = $(el).attr('srcset');
    if (val) $(el).attr('srcset', rewriteSrcset(val, base, proxyOrigin, shield, priv));
  });

  $('form[action]').each((_i, el) => {
    const method = ($(el).attr('method') || 'get').toLowerCase();
    if (method === 'post') {
      const act = $(el).attr('action');
      if (act) $(el).attr('action', toProxiedResourceUrl(act, base, proxyOrigin, shield, priv));
    }
  });

  $('style').each((_i, el) => {
    const css = $(el).html();
    if (css && css.includes('url(')) {
      $(el).html(rewriteCssUrls(css, base, proxyOrigin, shield, priv));
    }
  });

  $('[style]').each((_i, el) => {
    const css = $(el).attr('style');
    if (css && css.includes('url(')) {
      $(el).attr('style', rewriteCssUrls(css, base, proxyOrigin, shield, priv));
    }
  });

  const cfg = JSON.stringify({
    base,
    page: finalUrl,
    proxyOrigin,
    shield,
    priv,
    cookies: cookiesString,
    blocked,
    blockedHosts: Array.from(blockedHosts),
  }).replace(/</g, '\\u003c');

  const safeInlineBridge = INJECT_JS.replace(/<\/script>/gi, '<\\/script>');
  const injectBlock =
    `<script>window.__VX=${cfg};</script>` +
    `<script>${safeInlineBridge}</script>` +
    (shield ? `<style>${AD_CSS}</style>` : '');

  const head = $('head');
  if (head.length) {
    head.prepend(injectBlock);
  } else if ($('html').length) {
    $('html').prepend(`<head>${injectBlock}</head>`);
  } else {
    $.root().prepend(`<head>${injectBlock}</head>`);
  }

  return { html: $.html(), blocked, blockedHosts: Array.from(blockedHosts) };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function buildReaderPayload(html: string, url: string) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const authorMatch = html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i);
  const siteMatch = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);

  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

  const blocks: string[] = [];
  const plainParts: string[] = [];
  const blockRe = /<(h1|h2|h3|p|blockquote|pre|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(cleaned)) !== null && blocks.length < 120) {
    const tag = m[1].toLowerCase();
    const txt = stripTags(m[2]);
    if (!txt) continue;
    if (tag === 'p' && txt.length < 40) continue;
    plainParts.push(txt);
    blocks.push(`<${tag}>${escapeHtml(txt)}</${tag}>`);
  }

  const words = plainParts.join(' ').split(/\s+/).filter(Boolean).length;
  const host = new URL(url).hostname;
  return {
    title: decodeEntities((ogTitle?.[1] || (titleMatch ? stripTags(titleMatch[1]) : '') || host).trim()),
    byline: authorMatch ? decodeEntities(authorMatch[1].trim()) : '',
    site: siteMatch ? decodeEntities(siteMatch[1].trim()) : host,
    html: blocks.join(''),
    textPreview: plainParts.slice(0, 4).join(' ').slice(0, 320),
    words,
    minutes: Math.max(1, Math.round(words / 220)),
    url,
  };
}

function getProxyRequestBody(req: Request): Buffer | undefined {
  const body: unknown = req.body;
  if (body === undefined || body === null) return undefined;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (typeof body === 'object') {
    if (Object.keys(body as object).length === 0) return undefined;
    const ct = String(req.headers['content-type'] || '');
    if (ct.includes('application/x-www-form-urlencoded')) {
      return Buffer.from(new URLSearchParams(body as Record<string, string>).toString());
    }
    return Buffer.from(JSON.stringify(body));
  }
  return undefined;
}

let appPromise: Promise<Express> | null = null;

export async function getVexoraApp(): Promise<Express> {
  if (appPromise) return appPromise;

  appPromise = (async () => {
    await loadSyncStore();
    const app = express();

    app.use((req, _res, next) => {
      if (req.body !== undefined) {
        (req as Request & { _body?: boolean })._body = true;
      }
      next();
    });
    app.use('/proxy', express.raw({ type: () => true, limit: '20mb' }));
    app.use(express.json({ limit: '4mb' }));

    app.get('/api/health', (_req: Request, res: Response) => {
      res.json({ ok: true, app: 'Vexora', version: '2.2.0', build: 'real-proxy-streaming' });
    });

    app.post('/api/proxy/session/reset', (req: Request, res: Response) => {
      const priv = req.query.p === '1';
      const key = getJarKey(req, res, priv);
      clearJar(key);
      res.json({ ok: true });
    });

    app.post('/api/proxy/cookie', (req: Request, res: Response) => {
      try {
        const priv = req.query.p === '1';
        const { url, setCookie } = (req.body || {}) as { url?: string; setCookie?: string };
        if (!url || !setCookie) {
          res.status(400).json({ ok: false });
          return;
        }
        const parsed = new URL(url);
        const key = getJarKey(req, res, priv);
        storeSetCookies(key, parsed, [setCookie]);
        res.json({ ok: true });
      } catch {
        res.status(400).json({ ok: false });
      }
    });

    app.get('/__vx/inject.js', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.send(INJECT_JS);
    });

    // First-Party Vexora Private Search Endpoint
    app.get('/api/search', async (req: Request, res: Response) => {
      const q = String(req.query.q || '').trim();
      if (!q) {
        res.status(400).json({ error: 'Missing query parameter q' });
        return;
      }

      const started = Date.now();
      const results: Array<{
        id: string;
        title: string;
        url: string;
        snippet: string;
        domain: string;
        category: string;
      }> = [];
      const seenUrls = new Set<string>();

      const addResult = (item: {
        title: string;
        url: string;
        snippet: string;
        category: string;
      }) => {
        try {
          const parsed = new URL(item.url);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
          const cleanUrl = parsed.toString();
          if (seenUrls.has(cleanUrl)) return;
          seenUrls.add(cleanUrl);
          results.push({
            id: `web-${seenUrls.size}-${Date.now()}`,
            title: item.title.trim() || parsed.hostname,
            url: cleanUrl,
            snippet: item.snippet.trim() || cleanUrl,
            domain: parsed.hostname.replace(/^www\./, ''),
            category: item.category,
          });
        } catch {
          // ignore
        }
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);

      try {
        const [ddgRes, wikiRes, hnRes] = await Promise.allSettled([
          fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
            signal: controller.signal,
            headers: { 'User-Agent': UA, Accept: 'text/html' },
          }).then((r) => (r.ok ? r.text() : '')),
          fetch(
            `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&utf8=&format=json&srlimit=5`,
            {
              signal: controller.signal,
              headers: { 'User-Agent': 'VexoraSearchBot/2.0' },
            }
          ).then((r) => (r.ok ? r.json() : null)),
          fetch(
            `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&hitsPerPage=4`,
            { signal: controller.signal }
          ).then((r) => (r.ok ? r.json() : null)),
        ]);

        if (ddgRes.status === 'fulfilled' && ddgRes.value) {
          const html = ddgRes.value;
          const blockRe =
            /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>)?/gi;
          let m: RegExpExecArray | null;
          while ((m = blockRe.exec(html)) !== null && results.length < 10) {
            let rawHref = decodeEntities(m[1]);
            if (rawHref.includes('uddg=')) {
              try {
                const u = new URL(rawHref, 'https://duckduckgo.com');
                const uddg = u.searchParams.get('uddg');
                if (uddg) rawHref = uddg;
              } catch {
                // ignore
              }
            } else if (rawHref.startsWith('//')) {
              rawHref = `https:${rawHref}`;
            }
            if (rawHref.includes('duckduckgo.com/y.js') || rawHref.includes('ad_provider=')) {
              continue;
            }
            addResult({
              title: stripTags(m[2]),
              url: rawHref,
              snippet: stripTags(m[3] || m[4] || ''),
              category: 'Web Index',
            });
          }
        }

        if (wikiRes.status === 'fulfilled' && wikiRes.value?.query?.search) {
          const hits = wikiRes.value.query.search as Array<{
            title: string;
            snippet: string;
          }>;
          for (const h of hits.slice(0, 4)) {
            addResult({
              title: `${h.title} — Wikipedia`,
              url: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`,
              snippet: stripTags(h.snippet),
              category: 'Encyclopedia',
            });
          }
        }

        if (hnRes.status === 'fulfilled' && hnRes.value?.hits) {
          const hits = hnRes.value.hits as Array<{
            title?: string;
            url?: string;
            objectID?: string;
            points?: number;
          }>;
          for (const h of hits.slice(0, 3)) {
            const targetUrl =
              h.url || `https://news.ycombinator.com/item?id=${encodeURIComponent(h.objectID || '')}`;
            if (h.title) {
              addResult({
                title: h.title,
                url: targetUrl,
                snippet: `Community discussion (${h.points || 0} points) indexed via Vexora Crawler.`,
                category: 'Tech & Discussions',
              });
            }
          }
        }
      } finally {
        clearTimeout(timeout);
      }

      res.json({
        query: q,
        results,
        elapsedMs: Date.now() - started,
        privacy: 'Zero client IP/cookies forwarded · Server-stripped',
      });
    });

    // Vexora Real Web Proxy (/proxy?url=...&s=1&p=0)
    app.all('/proxy', async (req: Request, res: Response) => {
      const rawUrl = String(req.query.url || '');
      const shield = req.query.s !== '0';
      const fallback = req.query.f === '1';
      const isPriv = req.query.p === '1';
      const refParam = String(req.query.ref || '');

      if (!rawUrl) {
        res.status(400).send(renderProxyErrorPage(400, 'No address', 'Nothing to load.'));
        return;
      }

      const fwdProto = req.headers['x-forwarded-proto'];
      const proto =
        (Array.isArray(fwdProto) ? fwdProto[0] : fwdProto)?.split(',')[0]?.trim() ||
        req.protocol ||
        'https';
      const fwdHost = req.headers['x-forwarded-host'];
      const host =
        (Array.isArray(fwdHost) ? fwdHost[0] : fwdHost)?.split(',')[0]?.trim() ||
        req.headers.host ||
        `localhost:${PORT}`;
      const proxyOrigin = `${proto}://${host}`;

      try {
        let currentUrl = await assertSafePublicUrl(rawUrl);
        const jarKey = getJarKey(req, res, isPriv);
        const navDest = String(req.headers['sec-fetch-dest'] || '');
        const isPageNavigation = !navDest || ['document', 'iframe', 'frame'].includes(navDest);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        let method = req.method.toUpperCase();
        let hasBody = method !== 'GET' && method !== 'HEAD';
        let bodyBytes = hasBody ? getProxyRequestBody(req) : undefined;

        const buildHeaders = (target: URL): Record<string, string> => {
          const spoofOrigin = inferRefererOrigin(target, refParam);
          const sendOriginHeader = hasBody || (!isPageNavigation && String(req.headers['sec-fetch-mode'] || '') === 'cors');
          const secFetchSite = isPageNavigation
            ? (refParam ? (spoofOrigin === target.origin ? 'same-origin' : 'cross-site') : 'none')
            : (spoofOrigin === target.origin ? 'same-origin' : 'cross-site');

          const headers: Record<string, string> = {
            'User-Agent': UA,
            Accept: String(
              req.headers.accept ||
                'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
            ),
            'Accept-Language': String(req.headers['accept-language'] || 'en-US,en;q=0.9'),
            'Sec-Fetch-Dest': navDest || 'document',
            'Sec-Fetch-Mode': String(req.headers['sec-fetch-mode'] || (isPageNavigation ? 'navigate' : 'cors')),
            'Sec-Fetch-Site': secFetchSite,
          };
          if (sendOriginHeader) {
            headers['Origin'] = spoofOrigin;
          }
          if (refParam) {
            headers['Referer'] = refParam;
          } else if (!isPageNavigation) {
            headers['Referer'] = `${spoofOrigin}/`;
          }
          if (isPageNavigation) {
            headers['Upgrade-Insecure-Requests'] = '1';
          }
          if (req.headers.range) {
            headers['Range'] = String(req.headers.range);
          }
          if (hasBody && req.headers['content-type']) {
            headers['Content-Type'] = String(req.headers['content-type']);
          }
          const cookieHeader = buildCookieHeader(jarKey, target);
          if (cookieHeader) {
            headers['Cookie'] = cookieHeader;
          }
          for (const [k, v] of Object.entries(req.headers)) {
            if (
              v &&
              /^(x-youtube-|x-goog-|x-fb-|x-ig-|x-whatsapp-|x-wa-|x-csrftoken|x-asbd-id|x-requested-with$|authorization$)/i.test(
                k
              )
            ) {
              headers[k] = Array.isArray(v) ? v.join(', ') : String(v);
            }
          }
          return headers;
        };

        let upstream!: globalThis.Response;
        try {
          for (let hop = 0; hop < 10; hop++) {
            const init: RequestInit = {
              method,
              redirect: 'manual',
              signal: controller.signal,
              headers: buildHeaders(currentUrl),
              ...(hasBody && bodyBytes && bodyBytes.length ? { body: new Uint8Array(bodyBytes) } : {}),
            };
            try {
              upstream = await fetch(currentUrl.toString(), init);
            } catch (err) {
              if (hop === 0 && fallback && currentUrl.protocol === 'https:') {
                const httpFallback = 'http://' + currentUrl.toString().slice('https://'.length);
                currentUrl = await assertSafePublicUrl(httpFallback);
                upstream = await fetch(currentUrl.toString(), {
                  ...init,
                  headers: buildHeaders(currentUrl),
                });
              } else {
                throw err;
              }
            }

            const setCookies =
              typeof upstream.headers.getSetCookie === 'function'
                ? upstream.headers.getSetCookie()
                : [];
            if (setCookies.length) {
              storeSetCookies(jarKey, currentUrl, setCookies);
            }

            if (upstream.status >= 300 && upstream.status < 400) {
              const loc = upstream.headers.get('location');
              if (loc) {
                const nextUrl = new URL(loc, currentUrl);
                currentUrl = await assertSafePublicUrl(nextUrl.toString());
                if (upstream.status === 301 || upstream.status === 302 || upstream.status === 303) {
                  method = 'GET';
                  hasBody = false;
                  bodyBytes = undefined;
                }
                continue;
              }
            }
            break;
          }
        } catch (err) {
          clearTimeout(timeout);
          throw err;
        }
        clearTimeout(timeout);

        const finalUrl = currentUrl.toString();
        const ctype = upstream.headers.get('content-type') || 'application/octet-stream';
        const lowerType = ctype.toLowerCase();
        const status = upstream.status === 304 ? 200 : upstream.status;

        if (status === 204) {
          res.status(204).setHeader('Access-Control-Allow-Origin', '*').end();
          return;
        }

        if (isPageNavigation && (lowerType.includes('text/html') || lowerType.includes('application/xhtml'))) {
          const text = await upstream.text();
          const isChallenge =
            (status === 403 || status === 429 || status === 503) &&
            (upstream.headers.get('cf-mitigated') === 'challenge' ||
              /just a moment|enable javascript and cookies|cf-browser-verification/i.test(text) ||
              !text.trim());
          if (isChallenge) {
            res
              .status(status)
              .setHeader('Content-Type', 'text/html; charset=utf-8')
              .send(
                renderProxyErrorPage(
                  status,
                  'Site Bot Protection Triggered',
                  `${currentUrl.hostname} blocked the cloud proxy request (HTTP ${status}). Try Reader Mode or click "Original" above to open directly.`,
                  finalUrl
                )
              );
            return;
          }

          const publicCookies = getPublicCookieString(jarKey, currentUrl);
          const processed = processProxyHtml(
            text,
            finalUrl,
            proxyOrigin,
            shield,
            isPriv,
            publicCookies
          );
          res.status(status);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'no-store');
          res.send(processed.html);
          return;
        }

        if (lowerType.includes('text/css')) {
          const css = await upstream.text();
          const rewrittenCss = rewriteCssUrls(css, finalUrl, proxyOrigin, shield, isPriv);
          res.status(status);
          res.setHeader('Content-Type', 'text/css; charset=utf-8');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'private, max-age=300');
          res.send(rewrittenCss);
          return;
        }

        if (
          lowerType.includes('javascript') ||
          lowerType.includes('application/x-javascript') ||
          lowerType.includes('text/ecmascript')
        ) {
          let js = await upstream.text();
          js = rewriteJsLocations(js);
          if (req.query.wk === '1' || navDest === 'worker' || navDest === 'sharedworker') {
            js = buildWorkerShim(finalUrl, proxyOrigin, shield, isPriv) + js;
          }
          res.status(status);
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'private, max-age=300');
          res.send(js);
          return;
        }

        // Stream binary/video/audio/media/JSON directly (do NOT forward compressed Content-Length when fetch decompressed body)
        res.status(status);
        res.setHeader('Content-Type', ctype);
        res.setHeader('Access-Control-Allow-Origin', '*');
        const contentEncoding = upstream.headers.get('content-encoding');
        const contentRange = upstream.headers.get('content-range');
        const acceptRanges = upstream.headers.get('accept-ranges');
        const contentLength = upstream.headers.get('content-length');
        if (contentRange) res.setHeader('Content-Range', contentRange);
        if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
        if (contentLength && !contentEncoding) res.setHeader('Content-Length', contentLength);
        res.setHeader('Cache-Control', hasBody ? 'no-store' : 'private, max-age=300');

        if (upstream.body) {
          const nodeStream = Readable.fromWeb(
            upstream.body as unknown as NodeWebReadableStream<Uint8Array>
          );
          nodeStream.on('error', () => {
            if (!res.headersSent) res.status(502);
            res.end();
          });
          nodeStream.pipe(res);
          return;
        }

        const arrayBuf = await upstream.arrayBuffer();
        res.send(Buffer.from(arrayBuf));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not reach upstream site.';
        res
          .status(502)
          .setHeader('Content-Type', 'text/html; charset=utf-8')
          .send(renderProxyErrorPage(502, "Couldn't connect", msg, rawUrl));
      }
    });

    // Vexora Reader Mode extractor
    app.get('/api/reader', async (req: Request, res: Response) => {
      try {
        const rawUrl = String(req.query.url || '');
        const safeUrl = await assertSafePublicUrl(rawUrl);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        let upstream: globalThis.Response;
        try {
          upstream = await fetch(safeUrl.toString(), {
            signal: controller.signal,
            headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
          });
        } finally {
          clearTimeout(timeout);
        }
        const ctype = upstream.headers.get('content-type') || '';
        if (!ctype.includes('html')) {
          res.status(415).json({ error: 'Reader mode only works on HTML articles.' });
          return;
        }
        const html = await upstream.text();
        res.json(buildReaderPayload(html, upstream.url || safeUrl.toString()));
      } catch (err) {
        res.status(502).json({
          error: err instanceof Error ? err.message : 'Unable to extract article.',
        });
      }
    });

    // Favicon proxy
    app.get('/api/favicon', async (req: Request, res: Response) => {
      const domain = String(req.query.d || '').toLowerCase();
      if (!/^[a-z0-9]([a-z0-9\-.]{0,251}[a-z0-9])?$/i.test(domain)) {
        res.status(400).send('bad domain');
        return;
      }
      const cached = faviconCache.get(domain);
      if (cached) {
        if (!cached.buf.length) {
          res.status(204).end();
          return;
        }
        res.setHeader('Content-Type', cached.contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(cached.buf);
        return;
      }
      try {
        const r = await fetch(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`, {
          headers: { 'User-Agent': UA },
        });
        if (!r.ok) throw new Error('no icon');
        const buf = Buffer.from(await r.arrayBuffer());
        const contentType = r.headers.get('content-type') || 'image/x-icon';
        if (faviconCache.size > 400) faviconCache.clear();
        faviconCache.set(domain, { buf, contentType });
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(buf);
      } catch {
        faviconCache.set(domain, { buf: Buffer.alloc(0), contentType: '' });
        res.status(204).end();
      }
    });

    // Gemini AI-Powered Ad, Tracker & Dark-Pattern Analyzer
    app.post('/api/shield/analyze', async (req: Request, res: Response) => {
      try {
        const { url, contentSnippet, scriptUrls = [] } = req.body as {
          url?: string;
          contentSnippet?: string;
          scriptUrls?: string[];
        };
        if (!url && !contentSnippet) {
          res.status(400).json({ error: 'Provide a URL or DOM snippet to inspect.' });
          return;
        }

        const ai = getAiClient();
        const prompt = [
          'Inspect this target URL, DOM/HTML snippet, and script references for ad networks, CNAME-cloaked trackers, dark patterns, or phishing indicators.',
          `Target URL: ${url || 'inline-snippet'}`,
          `Scripts: ${scriptUrls.slice(0, 20).join(', ') || 'none'}`,
          `Snippet:\n${(contentSnippet || '').slice(0, 4000)}`,
        ].join('\n\n');

        const result = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            systemInstruction:
              'You are Vexora AI Shield, a browser security and ad-blocking classifier. Return concise findings, riskScore (0-100), and deterministic CSS selectors or domain patterns.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                verdict: {
                  type: Type.STRING,
                  description: 'clean, ad_network, tracker, dark_pattern, or phishing_risk',
                },
                riskScore: { type: Type.INTEGER },
                blockedSelectors: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                blockedDomains: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                findings: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      category: { type: Type.STRING },
                      reason: { type: Type.STRING },
                      severity: { type: Type.STRING },
                    },
                  },
                },
                summary: { type: Type.STRING },
              },
            },
          },
        });

        const parsed = JSON.parse((result.text ?? '{}').trim()) as {
          blockedDomains?: string[];
        };
        for (const dom of parsed.blockedDomains || []) {
          if (dom && dom.includes('.')) {
            customBlockedPatterns.add(dom.trim().toLowerCase());
          }
        }
        res.json(parsed);
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'AI Shield analysis failed.',
        });
      }
    });

    // Zero-Knowledge Cross-Device Encrypted Sync Relay
    app.post('/api/sync/:vaultId', async (req: Request, res: Response) => {
      try {
        const vaultId = String(req.params.vaultId || '').trim();
        if (!/^[a-zA-Z0-9_-]{6,64}$/.test(vaultId)) {
          res.status(400).json({ error: 'Invalid Sync Vault ID.' });
          return;
        }
        const { salt, iv, ciphertext, algorithm, deviceLabel } = req.body as {
          salt?: string;
          iv?: string;
          ciphertext?: string;
          algorithm?: string;
          deviceLabel?: string;
        };
        if (!salt || !iv || !ciphertext) {
          res.status(400).json({ error: 'Encrypted payload must include salt, iv, and ciphertext.' });
          return;
        }
        const record: SyncVaultRecord = {
          vaultId,
          salt,
          iv,
          ciphertext,
          algorithm: algorithm || 'AES-256-GCM',
          updatedAt: new Date().toISOString(),
          deviceLabel: (deviceLabel || 'Vexora Desktop').slice(0, 48),
          byteLength: ciphertext.length,
        };
        syncVaults.set(vaultId, record);
        await persistSyncStore();
        res.json({
          ok: true,
          vaultId: record.vaultId,
          updatedAt: record.updatedAt,
          byteLength: record.byteLength,
        });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Sync push failed.' });
      }
    });

    app.get('/api/sync/:vaultId', (req: Request, res: Response) => {
      const vaultId = String(req.params.vaultId || '').trim();
      const record = syncVaults.get(vaultId);
      if (!record) {
        res.status(404).json({ error: 'No encrypted sync snapshot found for this Vault ID.' });
        return;
      }
      res.json(record);
    });

    app.get('/api/index', (_req: Request, res: Response) => {
      res.json({ ok: true, app: 'Vexora', version: '2.2.0', build: 'real-proxy-streaming' });
    });

    // Referer-recovery fallback: if dynamic import() or relative subresource slips past client hooks
    app.use((req: Request, res: Response, next) => {
      const refHeader = req.headers.referer;
      if (
        !refHeader ||
        !refHeader.includes('/proxy?url=') ||
        /^\/(?:$|index\.html$|src\/|@vite|@react-refresh|@fs\/|@id\/|node_modules\/|manifest\.webmanifest$|dev-sw\.js$|sw\.js$|workbox-|assets\/(?:icon-|logo-|favicon|index-|workbox-|registerSW))/.test(
          req.path
        )
      ) {
        next();
        return;
      }
      try {
        const refUrl = new URL(refHeader);
        const outerPage = refUrl.searchParams.get('url');
        if (!outerPage) {
          next();
          return;
        }
        const resolved = new URL(req.originalUrl, outerPage).href;
        const s = refUrl.searchParams.get('s') ?? '1';
        const p = refUrl.searchParams.get('p') ?? '0';
        res.redirect(
          307,
          `/proxy?url=${encodeURIComponent(resolved)}&s=${s}&p=${p}&ref=${encodeURIComponent(outerPage)}`
        );
      } catch {
        next();
      }
    });

    return app;
  })();

  return appPromise;
}
