"""All user data: settings, bookmarks, history. One JSON file in %APPDATA%\\Vexora."""
import json, re, time
from pathlib import Path
from urllib.parse import urlsplit
from PySide6.QtCore import QStandardPaths, QTimer
from PySide6.QtGui import QIcon

ENGINES = {
    "Google": "https://www.google.com/search?q=%s",
    "DuckDuckGo": "https://duckduckgo.com/?q=%s",
    "Bing": "https://www.bing.com/search?q=%s",
    "Brave": "https://search.brave.com/search?q=%s",
}
DEFAULTS = {
    "engine": "Google", "theme": "Dark", "accent": "#8a6df5",
    "bookmarks_bar": True, "restore_tabs": True, "ask_save": False,
    "shield": True, "force_dark": False, "blocked_total": 0,
}


def data_dir():
    d = Path(QStandardPaths.writableLocation(QStandardPaths.StandardLocation.AppDataLocation))
    d.mkdir(parents=True, exist_ok=True)
    return d


def cache_dir():
    d = data_dir() / "cache"
    d.mkdir(exist_ok=True)
    return d


def icon_dir():
    d = data_dir() / "icons"
    d.mkdir(exist_ok=True)
    return d


def host_key(url):
    host = urlsplit(url).hostname or ""
    return re.sub(r"[^A-Za-z0-9._-]", "_", host)


def _entries(items):
    return [{"url": i["url"], "title": str(i.get("title") or i["url"]), **({"t": float(i["t"])} if "t" in i else {})}
            for i in items if isinstance(i, dict) and isinstance(i.get("url"), str)]


class Store:
    def __init__(self):
        self.path = data_dir() / "data.json"
        self.settings, self.bookmarks, self.history = dict(DEFAULTS), [], []
        try:
            d = json.loads(self.path.read_text("utf-8"))
            self.import_data(d, save=False)
        except (OSError, ValueError):
            pass
        self._icons = {}
        self._timer = QTimer()
        self._timer.setSingleShot(True)
        self._timer.setInterval(3000)
        self._timer.timeout.connect(self.flush)

    def touch(self):
        self._timer.start()

    def flush(self):
        tmp = self.path.with_suffix(".tmp")
        try:
            tmp.write_text(json.dumps(self.export_data()), "utf-8")
            tmp.replace(self.path)
        except OSError:
            pass

    def set(self, key, val):
        self.settings[key] = val
        self.flush()

    # site icons (only saved from normal tabs, never private ones)
    def icon(self, url):
        key = host_key(url)
        if key not in self._icons:
            p = icon_dir() / f"{key}.png"
            self._icons[key] = QIcon(str(p)) if key and p.exists() else QIcon()
        return self._icons[key]

    def save_icon(self, url, icon):
        key, p = host_key(url), None
        if not key or icon.isNull():
            return False
        p = icon_dir() / f"{key}.png"
        new = not p.exists()
        pm = icon.pixmap(32, 32)
        if pm.isNull() or not pm.save(str(p), "PNG"):
            return False
        self._icons.pop(key, None)
        return new

    # bookmarks
    def is_bookmarked(self, url):
        return any(b["url"] == url for b in self.bookmarks)

    def toggle_bookmark(self, url, title):
        if self.is_bookmarked(url):
            self.bookmarks = [b for b in self.bookmarks if b["url"] != url]
            now = False
        else:
            self.bookmarks.append({"url": url, "title": title or url})
            now = True
        self.flush()
        return now

    def remove_bookmark(self, url):
        self.bookmarks = [b for b in self.bookmarks if b["url"] != url]
        self.flush()

    # history
    def add_history(self, url, title):
        now = time.time()
        if self.history and self.history[-1]["url"] == url:
            self.history[-1].update(title=title or url, t=now)
        else:
            self.history.append({"url": url, "title": title or url, "t": now})
        del self.history[:-5000]
        self.touch()

    def remove_history(self, url):
        self.history = [h for h in self.history if h["url"] != url]
        self.flush()

    def clear_history(self):
        self.history = []
        self.flush()

    # backup
    def export_data(self):
        return {"vexora_backup": 1, "settings": self.settings, "bookmarks": self.bookmarks, "history": self.history}

    def import_data(self, d, save=True):
        if not isinstance(d, dict):
            raise ValueError("not a Vexora backup")
        for k, v in (d.get("settings") or {}).items():
            if k in DEFAULTS and type(v) is type(DEFAULTS[k]):
                self.settings[k] = v
        if isinstance(d.get("bookmarks"), list):
            self.bookmarks = _entries(d["bookmarks"])
        if isinstance(d.get("history"), list):
            self.history = [h for h in _entries(d["history"]) if "t" in h][-5000:]
        if save:
            self.flush()
