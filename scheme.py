"""vexora:// internal pages and the data API they use.

Safety model: web pages can never read the API. The scheme is LocalScheme (only vexora:// pages can load it)
and every /api, /icon and /wallpaper request must name a vexora://app initiator or it is refused.
There is no web channel and no script bridge, so nothing is exposed to the sites you browse.
"""
import json, os, re, sys, traceback
from pathlib import Path

from PySide6.QtCore import QBuffer, QByteArray, QIODevice, QTimer, QUrl
from PySide6.QtWebEngineCore import QWebEngineUrlRequestJob, QWebEngineUrlScheme, QWebEngineUrlSchemeHandler

from store import DEFAULT_SHORTCUTS, ENGINES, WIDGETS, data_dir, host_key, icon_dir
from version import VERSION

SCHEME = b"vexora"
NEWTAB = "vexora://app/newtab"
BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))
WEB = BASE / "assets" / "web"
STATIC = {"/newtab": ("newtab.html", b"text/html"), "/newtab.css": ("newtab.css", b"text/css"),
          "/newtab.js": ("newtab.js", b"text/javascript"), "/logo.png": ("../logo.png", b"image/png")}
MAX_BODY = 200_000


def register():
    """Must run before QApplication is created."""
    s = QWebEngineUrlScheme(SCHEME)
    s.setSyntax(QWebEngineUrlScheme.Syntax.Host)
    s.setFlags(QWebEngineUrlScheme.Flag.SecureScheme | QWebEngineUrlScheme.Flag.LocalScheme | QWebEngineUrlScheme.Flag.FetchApiAllowed)
    QWebEngineUrlScheme.registerScheme(s)


def wallpaper_dir():
    d = data_dir() / "wallpapers"
    d.mkdir(exist_ok=True)
    return d


def own_page(init):
    return init.scheme() == "vexora" and init.host() == "app"


def reply(job, data, mime):
    buf = QBuffer(job)
    buf.setData(QByteArray(data))
    buf.open(QIODevice.OpenModeFlag.ReadOnly)
    job.reply(mime, buf)


class Handler(QWebEngineUrlSchemeHandler):
    def __init__(self, browser, private=False):
        super().__init__(browser)
        self.br, self.private = browser, private

    def requestStarted(self, job):
        E = QWebEngineUrlRequestJob.Error
        url, path = job.requestUrl(), job.requestUrl().path()
        try:
            if url.host() != "app":
                return job.fail(E.UrlNotFound)
            if path in STATIC:                                   # pages and scripts hold no secrets
                name, mime = STATIC[path]
                return reply(job, (WEB / name).read_bytes(), mime)
            if not own_page(job.initiator()):                    # everything else: only from vexora://app pages
                return job.fail(E.RequestDenied)
            if path.startswith("/icon/"):
                f = icon_dir() / Path(path).name
                return reply(job, f.read_bytes(), b"image/png") if re.fullmatch(r"[A-Za-z0-9._-]+\.png", f.name) and f.exists() else job.fail(E.UrlNotFound)
            if path == "/wallpaper":
                name = self.br.store.settings["wallpaper"]
                f = wallpaper_dir() / name
                return reply(job, f.read_bytes(), b"image/jpeg" if name.endswith("jpg") else b"image/png") if name and f.exists() else job.fail(E.UrlNotFound)
            if path.startswith("/api/"):
                body = b""
                if job.requestMethod() == b"POST" and job.requestBody():
                    dev = job.requestBody()
                    if dev.open(QIODevice.OpenModeFlag.ReadOnly):
                        body = bytes(dev.readAll())[:MAX_BODY]
                        dev.close()
                out = self.api(path[5:], json.loads(body or b"{}"))
                return reply(job, json.dumps(out).encode(), b"application/json")
            job.fail(E.UrlNotFound)
        except Exception:
            if os.environ.get("VEXORA_DEBUG"):
                traceback.print_exc()
            job.fail(E.RequestFailed)

    # ---- data API ----
    def api(self, name, d):
        br, st = self.br, self.br.store
        if name == "home":
            return self.home()
        if not isinstance(d, dict):
            raise ValueError
        if name == "set":
            for k, v in d.items():
                if k in ("name", "city") and isinstance(v, str):
                    st.set(k, v.strip()[:80 if k == "city" else 40])
                elif k == "units" and v in ("C", "F"):
                    st.set(k, v)
                elif k == "engine" and v in ENGINES:
                    br.apply_setting("engine", v)
                elif k == "widgets" and isinstance(v, dict):
                    st.set("widgets", {w: bool(v.get(w, True)) for w in WIDGETS})
            return {"ok": True}
        if name == "notes":
            st.set_notes(d.get("text", ""))
            return {"ok": True}
        if name == "shortcuts":
            if d.get("reset"):
                st.set_shortcuts([{"title": t, "url": u} for t, u in DEFAULT_SHORTCUTS])
            else:
                st.set_shortcuts(d.get("items"))
            return {"ok": True}
        if name == "panel" and d.get("name") in ("bookmarks", "history", "downloads"):
            QTimer.singleShot(0, lambda: br.toggle_sidebar(("bookmarks", "history", "downloads").index(d["name"])))
            return {"ok": True}
        if name == "settings":
            QTimer.singleShot(0, lambda: br.open_settings(d.get("page") if isinstance(d.get("page"), str) else None))
            return {"ok": True}
        if name == "wallpaper":
            if d.get("action") == "pick":
                QTimer.singleShot(0, br.pick_wallpaper)
            elif d.get("action") == "reset":
                br.reset_wallpaper()
            return {"ok": True}
        raise ValueError

    def home(self):
        br, st = self.br, self.br.store
        s = st.settings
        has = lambda u: (icon_dir() / f"{host_key(u)}.png").exists()
        recents, seen = [], set()
        if not self.private:
            for h in reversed(st.history):
                if h["url"] not in seen and len(recents) < 4:
                    seen.add(h["url"]); recents.append({"title": h["title"], "url": h["url"], "t": h["t"]})
        web = lambda u: u.startswith(("http://", "https://"))
        t = br.t
        return {
            "name": s["name"], "engine": s["engine"], "engines": ENGINES, "widgets": s["widgets"], "wallpaper": bool(s["wallpaper"]),
            "wallver": s["wallpaper"], "city": s["city"], "units": s["units"], "private": self.private, "notes": st.notes, "version": VERSION,
            "shortcuts": st.shortcuts, "recents": recents,
            "folders": [{"name": n, "items": [{"title": b["title"], "url": b["url"]} for b in items if web(b["url"])]} for n, items in st.folders()],
            "theme": {k: t[k] for k in ("bg", "surface", "line", "hover", "text", "muted", "accent", "accent2")},
        }
