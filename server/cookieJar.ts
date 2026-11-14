import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Request, Response } from 'express';

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
}

const SESSION_COOKIE_NAME = 'vexora_sid';
const MAX_SESSIONS = 600;
const jars = new Map<string, StoredCookie[]>();

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

export function getJarKey(req: Request | IncomingMessage, res?: Response, isPrivate = false): string {
  const cookies = parseCookieHeader(req.headers.cookie);
  let sid = cookies[SESSION_COOKIE_NAME];
  if (!sid || !/^[a-f0-9]{32}$/.test(sid)) {
    sid = crypto.randomBytes(16).toString('hex');
    if (res && !res.headersSent) {
      const fwdProto = req.headers['x-forwarded-proto'];
      const proto = (Array.isArray(fwdProto) ? fwdProto[0] : fwdProto)
        ?.split(',')[0]
        ?.trim()
        .toLowerCase();
      const isHttps =
        proto === 'https' || ('secure' in req && Boolean((req as Request).secure));
      const sameSite = isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax';
      res.append(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=${sid}; Path=/; HttpOnly; ${sameSite}; Max-Age=604800`
      );
    }
  }
  const key = isPrivate ? `${sid}:priv` : sid;
  if (!jars.has(key)) {
    if (jars.size >= MAX_SESSIONS) {
      const oldest = jars.keys().next().value;
      if (oldest) jars.delete(oldest);
    }
    jars.set(key, []);
  }
  return key;
}

export function getJarKeyFromUpgrade(req: IncomingMessage, isPrivate = false): string | null {
  const cookies = parseCookieHeader(req.headers.cookie);
  const sid = cookies[SESSION_COOKIE_NAME];
  if (!sid || !/^[a-f0-9]{32}$/.test(sid)) return null;
  return isPrivate ? `${sid}:priv` : sid;
}

export function clearJar(key: string): void {
  jars.set(key, []);
}

function domainMatches(cookieDomain: string, targetHost: string): boolean {
  const cleanCookieDomain = cookieDomain.replace(/^\./, '').toLowerCase();
  const host = targetHost.toLowerCase();
  return host === cleanCookieDomain || host.endsWith('.' + cleanCookieDomain);
}

export function storeSetCookies(jarKey: string, targetUrl: URL, setCookies: string[]): void {
  if (!setCookies.length) return;
  let jar = jars.get(jarKey) || [];
  const now = Date.now();
  jar = jar.filter((c) => !c.expires || c.expires > now);

  for (const raw of setCookies) {
    const segments = raw.split(';').map((s) => s.trim());
    const first = segments[0];
    if (!first) continue;
    const eqIdx = first.indexOf('=');
    if (eqIdx === -1) continue;

    const name = first.slice(0, eqIdx).trim();
    const value = first.slice(eqIdx + 1).trim();
    if (!name) continue;

    let domain = targetUrl.hostname.toLowerCase();
    let path = '/';
    let expires: number | undefined;
    let httpOnly = false;
    let secure = false;

    for (const attr of segments.slice(1)) {
      const [ak, ...avParts] = attr.split('=');
      const key = ak.trim().toLowerCase();
      const val = avParts.join('=').trim();
      if (key === 'domain' && val) {
        const cleanVal = val.replace(/^\./, '').toLowerCase();
        if (domainMatches(cleanVal, targetUrl.hostname)) {
          domain = cleanVal;
        }
      } else if (key === 'path' && val) {
        path = val;
      } else if (key === 'max-age' && val) {
        const secs = Number(val);
        if (!Number.isNaN(secs)) {
          expires = now + secs * 1000;
        }
      } else if (key === 'expires' && val && !expires) {
        const parsed = Date.parse(val);
        if (!Number.isNaN(parsed)) {
          expires = parsed;
        }
      } else if (key === 'httponly') {
        httpOnly = true;
      } else if (key === 'secure') {
        secure = true;
      }
    }

    jar = jar.filter(
      (c) => !(c.name === name && c.domain === domain && c.path === path)
    );

    if (value !== '' && (!expires || expires > now) && value !== 'deleted') {
      jar.push({ name, value, domain, path, expires, httpOnly, secure });
    }
  }

  jars.set(jarKey, jar);
}

export function buildCookieHeader(jarKey: string, targetUrl: URL): string {
  const jar = jars.get(jarKey);
  if (!jar || jar.length === 0) return '';
  const now = Date.now();
  const matching = jar.filter((c) => {
    if (c.expires && c.expires <= now) return false;
    if (!domainMatches(c.domain, targetUrl.hostname)) return false;
    if (!targetUrl.pathname.startsWith(c.path)) return false;
    return true;
  });
  return matching.map((c) => `${c.name}=${c.value}`).join('; ');
}

export function getPublicCookieString(jarKey: string, targetUrl: URL): string {
  const jar = jars.get(jarKey);
  if (!jar || jar.length === 0) return '';
  const now = Date.now();
  return jar
    .filter((c) => {
      if (c.httpOnly) return false;
      if (c.expires && c.expires <= now) return false;
      if (!domainMatches(c.domain, targetUrl.hostname)) return false;
      if (!targetUrl.pathname.startsWith(c.path)) return false;
      return true;
    })
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}
