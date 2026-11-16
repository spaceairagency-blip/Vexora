import json, re, sys
from pathlib import Path
from urllib.parse import quote

from PySide6.QtCore import Qt, QTimer, QUrl, QStandardPaths
from PySide6.QtGui import QIcon, QKeySequence, QPainter, QPixmap, QShortcut
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtWebEngineCore import (QWebEnginePage, QWebEngineProfile, QWebEngineSettings,
                                     QWebEngineUrlRequestInterceptor)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import (QApplication, QFileDialog, QHBoxLayout, QLabel, QLineEdit, QMainWindow,
                               QPushButton, QStackedWidget, QTabBar, QToolButton, QVBoxLayout, QWidget)

from updater import Updater
from version import VERSION

BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))
NEWTAB = QUrl.fromLocalFile(str(BASE / "newtab.html")).toString()
QSS = """
QWidget { background:#141416; color:#e6e6ea; font:13px "Segoe UI"; }
#bar, #banner { background:#1e1e22; }
#bar { border-bottom:1px solid #2b2b31; }
QToolButton { border:0; border-radius:6px; padding:6px; background:transparent; }
QToolButton:hover { background:#2a2a30; }
QLineEdit { background:#141416; border:1px solid transparent; border-radius:8px; padding:6px 12px;
            selection-background-color:#8a6df5; }
QLineEdit:focus { border-color:#8a6df5; }
QTabBar::tab { background:transparent; color:#8d8d96; padding:8px 10px; min-width:90px; max-width:200px;
               border-top-left-radius:8px; border-top-right-radius:8px; margin-right:2px; }
QTabBar::tab:selected { background:#1e1e22; color:#e6e6ea; }
QTabBar::tab:hover:!selected { background:#1a1a1d; }
QPushButton { background:#8a6df5; color:#fff; border:0; border-radius:6px; padding:5px 12px; }
QPushButton#ghost { background:transparent; color:#8d8d96; }
QPushButton#ghost:hover { color:#e6e6ea; }
"""
ICONS = {"back": "M10 3 5 8l5 5", "forward": "M6 3l5 5-5 5", "plus": "M8 3v10M3 8h10",
         "reload": "M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3", "stop": "M4 4l8 8M12 4l-8 8"}


def icon(name):
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#b4b4bb" '
           f'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="{ICONS[name]}"/></svg>')
    pm = QPixmap(32, 32); pm.fill(Qt.GlobalColor.transparent)
    p = QPainter(pm); QSvgRenderer(svg.encode()).render(p); p.end()
    pm.setDevicePixelRatio(2)
    return QIcon(pm)


def resolve(s):
    s = s.strip()
    if not s: return ""
    if re.match(r"^[a-z][a-z0-9+.-]*://", s, re.I): return s
    if re.match(r"^localhost(:\d+)?(/|$)", s, re.I) or re.match(r"^[^\s/]+\.[a-z]{2,}(:\d+)?(/\S*)?$", s, re.I):
        return "https://" + s
    if re.match(r"^\d{1,3}(\.\d{1,3}){3}(:\d+)?(/|$)", s): return "http://" + s
    return "https://www.google.com/search?q=" + quote(s)


class Blocker(QWebEngineUrlRequestInterceptor):
    """Cancels requests to known tracker domains (runs on a network thread)."""
    def __init__(self):
        super().__init__()
        self.hosts = set(json.loads((BASE / "trackers.json").read_text()))
        self.count = 0

    def interceptRequest(self, info):
        h = info.requestUrl().host()
        while "." in h:
            if h in self.hosts:
                info.block(True); self.count += 1
                return
            h = h.split(".", 1)[1]


class Tab(QWebEngineView):
    def __init__(self, browser):
        super().__init__()
        self.browser = browser
        pg = QWebEnginePage(browser.profile, self)
        self.setPage(pg)
        self.settings().setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)
        pg.fullScreenRequested.connect(browser.on_fullscreen)
        if hasattr(pg, "permissionRequested"):          # Qt 6.8+
            pg.permissionRequested.connect(lambda p: p.deny())
        else:
            pg.featurePermissionRequested.connect(lambda o, f: pg.setFeaturePermission(
                o, f, QWebEnginePage.PermissionPolicy.PermissionDeniedByUser))

    def createWindow(self, _type):                      # target=_blank / window.open -> new tab
        return self.browser.new_tab()

    def shown(self):
        u = self.url().toString()
        return "" if u.startswith(NEWTAB) else u


class Browser(QMainWindow):
    def __init__(self, profile, blocker, updater):
        super().__init__()
        self.profile, self.blocker, self.updater = profile, blocker, updater
        self.closed, self.dev, self._was_max = [], None, False
        self.setWindowTitle("Vexora"); self.resize(1280, 800)
        self.setWindowIcon(QIcon(str(BASE / "assets" / "icon.png")))

        self.tabbar = QTabBar(movable=True, tabsClosable=True, expanding=False, drawBase=False)
        self.tabbar.setElideMode(Qt.TextElideMode.ElideRight)
        self.stack = QStackedWidget()
        plus = QToolButton(); plus.setIcon(icon("plus")); plus.setToolTip("New tab (Ctrl+T)")
        plus.clicked.connect(lambda: self.new_tab(NEWTAB))
        self.top = QWidget(); tl = QHBoxLayout(self.top); tl.setContentsMargins(8, 6, 8, 0); tl.setSpacing(2)
        tl.addWidget(self.tabbar); tl.addWidget(plus); tl.addStretch()

        self.btn_back, self.btn_fwd, self.btn_reload = QToolButton(), QToolButton(), QToolButton()
        self.btn_back.setIcon(icon("back")); self.btn_fwd.setIcon(icon("forward"))
        self.url = QLineEdit(placeholderText="Search or enter address")
        self.shield = QLabel(); self.shield.setStyleSheet("color:#8d8d96;font-size:12px")
        self.bar = QWidget(); self.bar.setObjectName("bar"); bl = QHBoxLayout(self.bar)
        bl.setContentsMargins(8, 7, 10, 7); bl.setSpacing(4)
        for w in (self.btn_back, self.btn_fwd, self.btn_reload): bl.addWidget(w)
        bl.addWidget(self.url, 1); bl.addWidget(self.shield)

        self.banner = QWidget(); self.banner.setObjectName("banner"); self.banner.hide()
        nl = QHBoxLayout(self.banner); nl.setContentsMargins(14, 8, 10, 8)
        self.banner_text = QLabel(); self.banner_text.setStyleSheet("background:transparent")
        self.btn_update = QPushButton("Update now"); later = QPushButton("Later"); later.setObjectName("ghost")
        later.clicked.connect(self.banner.hide); self.btn_update.clicked.connect(self.start_update)
        nl.addWidget(self.banner_text); nl.addStretch(); nl.addWidget(self.btn_update); nl.addWidget(later)

        root = QWidget(); v = QVBoxLayout(root); v.setContentsMargins(0, 0, 0, 0); v.setSpacing(0)
        for w in (self.top, self.bar, self.banner): v.addWidget(w)
        v.addWidget(self.stack, 1); self.setCentralWidget(root)

        self.tabbar.currentChanged.connect(self.on_current)
        self.tabbar.tabCloseRequested.connect(self.close_tab)
        self.tabbar.tabMoved.connect(self.on_moved)
        self.btn_back.clicked.connect(lambda: self.cur() and self.cur().back())
        self.btn_fwd.clicked.connect(lambda: self.cur() and self.cur().forward())
        self.btn_reload.clicked.connect(self.reload_or_stop)
        self.url.returnPressed.connect(self.go)
        updater.available.connect(self.on_update_available)
        updater.progress.connect(lambda n: self.banner_text.setText(f"Downloading update… {n}%"))
        updater.failed.connect(self.on_update_failed)
        updater.done.connect(QApplication.quit)
        profile.downloadRequested.connect(self.on_download)
        self.setup_shortcuts()

        t = QTimer(self); t.timeout.connect(self.refresh_shield); t.start(1000)
        t2 = QTimer(self); t2.timeout.connect(updater.check); t2.start(6 * 3600 * 1000)
        QTimer.singleShot(4000, updater.check)
        self.restore()

    # ---- tabs ----
    def cur(self): return self.stack.currentWidget()

    def new_tab(self, url=None, activate=True):
        view = Tab(self)
        self.stack.addWidget(view); i = self.tabbar.addTab("New tab")
        view.titleChanged.connect(lambda t, v=view: self.tabbar.setTabText(self.stack.indexOf(v), t or "New tab"))
        view.iconChanged.connect(lambda ic, v=view: self.tabbar.setTabIcon(self.stack.indexOf(v), ic))
        view.urlChanged.connect(lambda _u, v=view: v is self.cur() and self.sync_bar())
        view.loadStarted.connect(lambda v=view: v is self.cur() and self.sync_bar())
        view.loadFinished.connect(lambda _ok, v=view: (v is self.cur() and self.sync_bar(), self.save()))
        if activate: self.tabbar.setCurrentIndex(i)
        if url: view.load(QUrl(url))
        return view

    def close_tab(self, i):
        view = self.stack.widget(i)
        if view.shown(): self.closed.append(view.shown())
        self.stack.removeWidget(view); self.tabbar.removeTab(i); view.deleteLater()
        if self.tabbar.count() == 0:
            (self.session_file()).unlink(missing_ok=True); self.close()
        else: self.save()

    def on_moved(self, a, b):
        w = self.stack.widget(a); self.stack.removeWidget(w); self.stack.insertWidget(b, w)
        self.stack.setCurrentIndex(self.tabbar.currentIndex())

    def on_current(self, i):
        if i < 0: return
        self.stack.setCurrentIndex(i); self.sync_bar()
        if not self.cur().shown(): self.cur().setFocus()

    def sync_bar(self):
        v = self.cur()
        if not v: return
        if not self.url.hasFocus(): self.url.setText(v.shown())
        self.btn_back.setEnabled(v.history().canGoBack()); self.btn_fwd.setEnabled(v.history().canGoForward())
        loading = v.page().isLoading() if hasattr(v.page(), "isLoading") else False
        self.btn_reload.setIcon(icon("stop" if loading else "reload"))
        self.btn_reload.setProperty("loading", loading)

    def reload_or_stop(self):
        v = self.cur()
        if self.btn_reload.property("loading"): v.stop()
        else: v.reload()

    def go(self):
        u = resolve(self.url.text())
        if u: self.cur().load(QUrl(u)); self.cur().setFocus()

    # ---- session ----
    def session_file(self):
        d = Path(QStandardPaths.writableLocation(QStandardPaths.StandardLocation.AppDataLocation))
        d.mkdir(parents=True, exist_ok=True)
        return d / "session.json"

    def save(self):
        urls = [self.stack.widget(i).shown() or NEWTAB for i in range(self.stack.count())]
        try: self.session_file().write_text(json.dumps({"urls": urls, "active": self.tabbar.currentIndex()}))
        except OSError: pass

    def restore(self):
        try: s = json.loads(self.session_file().read_text())
        except (OSError, ValueError): s = {}
        urls = [u for u in s.get("urls", []) if re.match(r"^(https?:|file:)", u)] or [NEWTAB]
        for u in urls: self.new_tab(u, activate=False)
        self.tabbar.setCurrentIndex(min(max(int(s.get("active", 0)), 0), len(urls) - 1))

    # ---- misc ----
    def setup_shortcuts(self):
        def sc(keys, fn): QShortcut(QKeySequence(keys), self, activated=fn)
        sc("Ctrl+T", lambda: self.new_tab(NEWTAB))
        sc("Ctrl+W", lambda: self.close_tab(self.tabbar.currentIndex()))
        sc("Ctrl+Shift+T", lambda: self.closed and self.new_tab(self.closed.pop()))
        sc("Ctrl+L", lambda: (self.url.setFocus(), self.url.selectAll()))
        sc("Alt+D", lambda: (self.url.setFocus(), self.url.selectAll()))
        sc("Ctrl+R", lambda: self.cur().reload()); sc("F5", lambda: self.cur().reload())
        sc("Ctrl+Tab", lambda: self.step(1)); sc("Ctrl+Shift+Tab", lambda: self.step(-1))
        sc("Alt+Left", lambda: self.cur().back()); sc("Alt+Right", lambda: self.cur().forward())
        for n in range(1, 10):
            sc(f"Ctrl+{n}", lambda n=n: self.tabbar.setCurrentIndex(
                self.tabbar.count() - 1 if n == 9 else min(n - 1, self.tabbar.count() - 1)))
        zoom = lambda d: self.cur().setZoomFactor(min(5, max(.25, self.cur().zoomFactor() + d)))
        sc("Ctrl+=", lambda: zoom(.1)); sc("Ctrl++", lambda: zoom(.1)); sc("Ctrl+-", lambda: zoom(-.1))
        sc("Ctrl+0", lambda: self.cur().setZoomFactor(1))
        sc("F12", self.devtools)

    def step(self, d): self.tabbar.setCurrentIndex((self.tabbar.currentIndex() + d) % self.tabbar.count())

    def devtools(self):
        self.dev = QWebEngineView(); self.cur().page().setDevToolsPage(self.dev.page()); self.dev.resize(900, 600); self.dev.show()

    def on_fullscreen(self, req):
        req.accept(); on = req.toggleOn()
        self.top.setVisible(not on); self.bar.setVisible(not on)
        if on: self._was_max = self.isMaximized(); self.showFullScreen()
        else: self.showMaximized() if self._was_max else self.showNormal()

    def on_download(self, dl):
        start = str(Path.home() / "Downloads" / dl.downloadFileName())
        path, _ = QFileDialog.getSaveFileName(self, "Save file", start)
        if not path: dl.cancel(); return
        p = Path(path); dl.setDownloadDirectory(str(p.parent)); dl.setDownloadFileName(p.name); dl.accept()

    def refresh_shield(self):
        n = self.blocker.count
        self.shield.setText(f"{n} trackers blocked" if n else "")

    # ---- updates ----
    def on_update_available(self, ver):
        self.banner_text.setText(f"Vexora {ver} is available (you have {VERSION})")
        self.btn_update.setEnabled(True); self.btn_update.show(); self.banner.show()

    def start_update(self):
        self.btn_update.setEnabled(False); self.banner_text.setText("Downloading update… 0%"); self.updater.install()

    def on_update_failed(self, msg):
        self.banner_text.setText(f"Update failed: {msg}"); self.btn_update.setText("Retry"); self.btn_update.setEnabled(True)


def main():
    app = QApplication(sys.argv)
    app.setApplicationName("Vexora"); app.setStyle("Fusion"); app.setStyleSheet(QSS)
    profile = QWebEngineProfile("Vexora", app)
    # Google refuses sign-in from agents that announce QtWebEngine; present as plain Chromium.
    profile.setHttpUserAgent(re.sub(r"\s*QtWebEngine/\S+", "", profile.httpUserAgent()))
    blocker = Blocker(); profile.setUrlRequestInterceptor(blocker)
    win = Browser(profile, blocker, Updater())
    win.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
