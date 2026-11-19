import ctypes, json, re, sys, time
from pathlib import Path
from urllib.parse import quote, urlencode

from PySide6.QtCore import QSize, Qt, QStandardPaths, QTimer, QUrl
from PySide6.QtGui import QColor, QGuiApplication, QIcon, QImage, QKeySequence, QPainter, QPixmap, QShortcut
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtWebEngineCore import (QWebEnginePage, QWebEngineProfile, QWebEngineSettings,
                                     QWebEngineUrlRequestInterceptor)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import (QApplication, QFileDialog, QHBoxLayout, QLabel, QLineEdit, QMainWindow, QMenu,
                               QMessageBox, QPushButton, QStackedWidget, QTabBar, QToolButton, QVBoxLayout, QWidget)

from palette import Palette
from scheme import Handler, NEWTAB, SCHEME, register as register_scheme, wallpaper_dir
from settings import Settings
from sidebar import Sidebar
from store import ENGINES, Store, host_key, icon_dir
from motion import Crossfade
from theme import build as build_theme, resolve as resolve_theme
from updater import Updater
from version import VERSION

BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))
ICONS = {
    "back": "M10 3 5 8l5 5", "forward": "M6 3l5 5-5 5", "plus": "M8 3v10M3 8h10",
    "reload": "M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3", "stop": "M4 4l8 8M12 4l-8 8",
    "star": "M8 1.8l1.9 4 4.3.5-3.2 3 .9 4.3L8 11.4 4.1 13.6 5 9.3 1.8 6.3l4.3-.5z",
    "sidebar": "M2.5 3.5h11v9h-11zM6.5 3.5v9", "menu": "M2.5 4.5h11M2.5 8h11M2.5 11.5h11",
    "up": "M4 10l4-4 4 4", "down": "M4 6l4 4 4-4", "close": "M4.5 4.5l7 7M11.5 4.5l-7 7",
    "home": "M2.5 7.5 8 3l5.5 4.5M4 6.8V13h3V9.5h2V13h3V6.8", "bookmark": "M4.5 2.5h7v11L8 10.5 4.5 13.5z",
    "history": "M8 4.5V8l2.5 1.5M2.5 8a5.5 5.5 0 1 0 1.8-4.1M2.5 2.8v2.7h2.7", "download": "M8 2.5v7.5M5 7l3 3 3-3M3 13h10",
    "sliders": "M3 5h10M3 11h10M6 3v4M10 9v4", "search": "M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM11 11l3 3",
    "lock": "M4.5 7.5h7v5.5h-7zM6 7.5V5.5a2 2 0 0 1 4 0v2", "warn": "M8 2.5l6 10.5H2zM8 7v3M8 11.5v.5",
    "min": "M3.5 8.5h9", "max": "M3.5 3.5h9v9h-9z", "restore": "M5.5 5.5h7v7h-7zM3.5 10.5v-7h7",
}


def pix(name, color, fill=None):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="{fill or "none"}" stroke="{color}" '
           f'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="{ICONS[name]}"/></svg>')
    pm = QPixmap(32, 32)
    pm.fill(Qt.GlobalColor.transparent)
    p = QPainter(pm)
    QSvgRenderer(svg.encode()).render(p)
    p.end()
    pm.setDevicePixelRatio(2)
    return pm


def icon(name, color, fill=None, on=None):
    """on = colour to use when the button is checked."""
    ic = QIcon()
    ic.addPixmap(pix(name, color, fill), QIcon.Mode.Normal, QIcon.State.Off)
    ic.addPixmap(pix(name, on or color, fill), QIcon.Mode.Normal, QIcon.State.On)
    return ic


def resolve(s, engine):
    s = s.strip()
    if not s: return ""
    if re.match(r"^[a-z][a-z0-9+.-]*://", s, re.I): return s
    if re.match(r"^localhost(:\d+)?(/|$)", s, re.I) or re.match(r"^[^\s/]+\.[a-z]{2,}(:\d+)?(/\S*)?$", s, re.I):
        return "https://" + s
    if re.match(r"^\d{1,3}(\.\d{1,3}){3}(:\d+)?(/|$)", s): return "http://" + s
    return engine.replace("%s", quote(s))


class Blocker(QWebEngineUrlRequestInterceptor):
    """Cancels requests to known tracker domains (runs on a network thread)."""
    def __init__(self):
        super().__init__()
        self.hosts = set(json.loads((BASE / "trackers.json").read_text()))
        self.count, self.enabled = 0, True

    def interceptRequest(self, info):
        if not self.enabled: return
        h = info.requestUrl().host()
        while "." in h:
            if h in self.hosts:
                info.block(True); self.count += 1
                return
            h = h.split(".", 1)[1]


class Tab(QWebEngineView):
    def __init__(self, browser, private=False):
        super().__init__()
        self.browser, self.private = browser, private
        pg = QWebEnginePage(browser.private_profile if private else browser.profile, self)
        self.setPage(pg)
        self.settings().setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)
        pg.fullScreenRequested.connect(browser.on_fullscreen)
        pg.findTextFinished.connect(browser.on_find_result)
        if hasattr(pg, "permissionRequested"):          # Qt 6.8+
            pg.permissionRequested.connect(lambda p: p.deny())
        else:
            pg.featurePermissionRequested.connect(lambda o, f: pg.setFeaturePermission(
                o, f, QWebEnginePage.PermissionPolicy.PermissionDeniedByUser))

    def createWindow(self, _type):                      # target=_blank / window.open -> new tab
        return self.browser.new_tab(private=self.private)

    def shown(self):
        u = self.url().toString()
        return "" if u.startswith(NEWTAB) else u


class TitleBar(QWidget):
    """Tabs live here; empty space drags the window, double-click maximises."""
    def __init__(self, win):
        super().__init__()
        self.win = win
        self.setObjectName("titlebar")
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)

    def mousePressEvent(self, e):
        if e.button() == Qt.MouseButton.LeftButton and self.win.windowHandle():
            self.win.windowHandle().startSystemMove()

    def mouseDoubleClickEvent(self, e):
        if e.button() == Qt.MouseButton.LeftButton:
            self.win.toggle_max()


class Grip(QWidget):
    """Invisible strip on a window edge: dragging it resizes the frameless window."""
    CURSORS = {Qt.Edge.LeftEdge: Qt.CursorShape.SizeHorCursor, Qt.Edge.RightEdge: Qt.CursorShape.SizeHorCursor,
               Qt.Edge.TopEdge: Qt.CursorShape.SizeVerCursor, Qt.Edge.BottomEdge: Qt.CursorShape.SizeVerCursor}

    def __init__(self, win, edges):
        super().__init__(win)
        self.win, self.edges = win, edges
        self.setStyleSheet("background:transparent")
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        diag = (Qt.CursorShape.SizeFDiagCursor if edges in (Qt.Edge.LeftEdge | Qt.Edge.TopEdge, Qt.Edge.RightEdge | Qt.Edge.BottomEdge)
                else Qt.CursorShape.SizeBDiagCursor)
        self.setCursor(self.CURSORS.get(edges, diag))

    def mousePressEvent(self, e):
        if e.button() == Qt.MouseButton.LeftButton and self.win.windowHandle():
            self.win.windowHandle().startSystemResize(self.edges)


class Browser(QMainWindow):
    def __init__(self, profile, private_profile, blocker, updater, store):
        super().__init__()
        self.profile, self.private_profile, self.blocker, self.updater, self.store = profile, private_profile, blocker, updater, store
        self.closed, self.dev, self._was_max, self._last, self.t = [], None, False, 0, {}
        self.setWindowTitle("Vexora"); self.resize(1280, 800)
        self.setWindowFlag(Qt.WindowType.FramelessWindowHint, True)
        self.handlers = [Handler(self, False), Handler(self, True)]       # vexora:// pages, one per profile
        for p, h in zip((profile, private_profile), self.handlers): p.installUrlSchemeHandler(SCHEME, h)
        self.setWindowIcon(QIcon(str(BASE / "assets" / "icon.png")))

        # tab strip
        self.tabbar = QTabBar(movable=True, tabsClosable=True, expanding=False, drawBase=False)
        self.tabbar.setElideMode(Qt.TextElideMode.ElideRight)
        self.stack = QStackedWidget()
        self.btn_plus = QToolButton(); self.btn_plus.setToolTip("New tab (Ctrl+T)")
        self.btn_plus.clicked.connect(lambda: self.new_tab(self.newtab_url()))
        self.top = TitleBar(self); tl = QHBoxLayout(self.top); tl.setContentsMargins(8, 6, 0, 0); tl.setSpacing(2)
        tl.addWidget(self.tabbar); tl.addWidget(self.btn_plus); tl.addStretch()
        self.btn_min, self.btn_max, self.btn_x = QToolButton(), QToolButton(), QToolButton()
        for b, name, fn in ((self.btn_min, "winbtn", self.showMinimized), (self.btn_max, "winbtn", self.toggle_max), (self.btn_x, "winclose", self.close)):
            b.setObjectName(name); b.setFixedSize(46, 36); b.clicked.connect(fn); tl.addWidget(b)
        for g in (Qt.Edge.LeftEdge, Qt.Edge.RightEdge, Qt.Edge.TopEdge, Qt.Edge.BottomEdge, Qt.Edge.LeftEdge | Qt.Edge.TopEdge,
                  Qt.Edge.RightEdge | Qt.Edge.TopEdge, Qt.Edge.LeftEdge | Qt.Edge.BottomEdge, Qt.Edge.RightEdge | Qt.Edge.BottomEdge):
            Grip(self, g)

        # toolbar
        self.btn_back, self.btn_fwd, self.btn_reload, self.btn_home = QToolButton(), QToolButton(), QToolButton(), QToolButton()
        self.btn_star, self.btn_dl, self.btn_menu = QToolButton(), QToolButton(), QToolButton()
        self.btn_star.setToolTip("Bookmark this page (Ctrl+D)"); self.btn_dl.setToolTip("Downloads (Ctrl+J)")
        self.btn_back.setToolTip("Back (Alt+Left)"); self.btn_fwd.setToolTip("Forward (Alt+Right)"); self.btn_reload.setToolTip("Reload (Ctrl+R)")
        self.btn_home.setToolTip("Home")
        self.url = QLineEdit(placeholderText="Search or enter address"); self.url.setObjectName("url"); self.url.setClearButtonEnabled(True)
        self.url_mark = self.url.addAction(QIcon(), QLineEdit.ActionPosition.LeadingPosition)
        self.shield = QLabel(); self.shield.setObjectName("muted")
        self.bar = QWidget(); self.bar.setObjectName("bar"); bl = QHBoxLayout(self.bar)
        bl.setContentsMargins(8, 7, 8, 7); bl.setSpacing(4)
        for w in (self.btn_back, self.btn_fwd, self.btn_reload, self.btn_home): bl.addWidget(w)
        bl.addWidget(self.url, 1)
        for w in (self.shield, self.btn_star, self.btn_dl, self.btn_menu): bl.addWidget(w)

        # bookmarks bar, update banner, find bar
        self.bmbar = QWidget(); self.bmbar.setObjectName("bmbar")
        self.bml = QHBoxLayout(self.bmbar); self.bml.setContentsMargins(8, 2, 8, 2); self.bml.setSpacing(0)
        self.banner = QWidget(); self.banner.setObjectName("banner"); self.banner.hide()
        nl = QHBoxLayout(self.banner); nl.setContentsMargins(14, 8, 10, 8)
        self.banner_text = QLabel()
        self.btn_update = QPushButton("Update now"); later = QPushButton("Later"); later.setObjectName("ghost")
        later.clicked.connect(self.banner.hide); self.btn_update.clicked.connect(self.start_update)
        nl.addWidget(self.banner_text); nl.addStretch(); nl.addWidget(self.btn_update); nl.addWidget(later)
        self.find = QWidget(); self.find.setObjectName("find"); self.find.hide()
        fl = QHBoxLayout(self.find); fl.setContentsMargins(12, 6, 8, 6); fl.setSpacing(4)
        self.find_input = QLineEdit(placeholderText="Find in page"); self.find_input.setMaximumWidth(300)
        self.find_count = QLabel(); self.find_count.setObjectName("muted")
        self.f_prev, self.f_next, self.f_close = QToolButton(), QToolButton(), QToolButton()
        for w in (self.find_input, self.find_count, self.f_prev, self.f_next, self.f_close): fl.addWidget(w)
        fl.addStretch()
        self.find_input.textChanged.connect(lambda: self.find_text(True))
        self.find_input.returnPressed.connect(lambda: self.find_text(True))
        self.f_next.clicked.connect(lambda: self.find_text(True)); self.f_prev.clicked.connect(lambda: self.find_text(False))
        self.f_close.clicked.connect(self.hide_find)
        QShortcut(QKeySequence("Esc"), self.find, activated=self.hide_find, context=Qt.ShortcutContext.WidgetWithChildrenShortcut)

        # body
        self.rail = QWidget(); self.rail.setObjectName("rail"); self.rail.setFixedWidth(54)
        self.rail.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        rl = QVBoxLayout(self.rail); rl.setContentsMargins(7, 12, 7, 12); rl.setSpacing(6)
        self.rail_btns = {}
        for key, tip in (("home", "Home"), ("bookmark", "Bookmarks (Ctrl+B)"), ("history", "History (Ctrl+H)"), ("download", "Downloads (Ctrl+J)")):
            b = QToolButton(); b.setObjectName("railbtn"); b.setToolTip(tip); b.setCheckable(key != "home"); self.rail_btns[key] = b; rl.addWidget(b)
        rl.addStretch()
        self.btn_set = QToolButton(); self.btn_set.setObjectName("railbtn"); self.btn_set.setToolTip("Settings (Ctrl+,)"); rl.addWidget(self.btn_set)
        self.rail_btns["home"].clicked.connect(lambda: self.open_here(self.newtab_url()))
        for i, k in enumerate(("bookmark", "history", "download")): self.rail_btns[k].clicked.connect(lambda _c, i=i: self.toggle_sidebar(i))
        self.btn_set.clicked.connect(lambda: self.open_settings())
        self.btn_home.clicked.connect(lambda: self.open_here(self.newtab_url()))
        self.btn_dl.clicked.connect(lambda: self.toggle_sidebar(2))
        self.sidebar = Sidebar(store); self.sidebar.hide()
        self.sidebar.openUrl.connect(lambda u, new: self.new_tab(u) if new else self.open_here(u))
        self.sidebar.bookmarks.changed = self.on_bookmarks_changed
        body = QWidget(); bh = QHBoxLayout(body); bh.setContentsMargins(0, 0, 0, 0); bh.setSpacing(0)
        bh.addWidget(self.rail); bh.addWidget(self.sidebar); bh.addWidget(self.stack, 1)
        root = QWidget(); v = QVBoxLayout(root); v.setContentsMargins(0, 0, 0, 0); v.setSpacing(0)
        for w in (self.top, self.bar, self.bmbar, self.banner, self.find): v.addWidget(w)
        v.addWidget(body, 1); self.setCentralWidget(root)

        # menu (same list feeds the command palette)
        nt = lambda: self.new_tab(self.newtab_url())
        self.actions_list = [
            ("New tab", "Ctrl+T", nt), ("New private tab", "Ctrl+Shift+N", lambda: self.new_tab(self.newtab_url(), private=True)),
            None, ("Bookmark this page", "Ctrl+D", self.toggle_bookmark), ("Bookmarks", "Ctrl+B", lambda: self.toggle_sidebar(0)),
            ("History", "Ctrl+H", lambda: self.toggle_sidebar(1)), ("Downloads", "Ctrl+J", lambda: self.toggle_sidebar(2)),
            None, ("Find in page", "Ctrl+F", self.show_find), ("Command palette", "Ctrl+K", self.open_palette),
            ("Settings", "Ctrl+,", self.open_settings),
        ]
        menu = QMenu(self)
        for a in self.actions_list:
            menu.addSeparator() if a is None else menu.addAction(f"{a[0]}\t{a[1]}", a[2])
        self.btn_menu.setMenu(menu); self.btn_menu.setPopupMode(QToolButton.ToolButtonPopupMode.InstantPopup)

        self.tabbar.currentChanged.connect(self.on_current)
        self.tabbar.tabCloseRequested.connect(self.close_tab)
        self.tabbar.tabMoved.connect(self.on_moved)
        self.btn_back.clicked.connect(lambda: self.cur() and self.cur().back())
        self.btn_fwd.clicked.connect(lambda: self.cur() and self.cur().forward())
        self.btn_reload.clicked.connect(self.reload_or_stop)
        self.btn_star.clicked.connect(self.toggle_bookmark)
        self.url.returnPressed.connect(self.go)
        updater.available.connect(self.on_update_available)
        updater.progress.connect(lambda n: self.banner_text.setText(f"Downloading update… {n}%"))
        updater.status.connect(self.banner_text.setText)
        updater.failed.connect(self.on_update_failed)
        updater.done.connect(QApplication.quit)
        for p in (profile, private_profile): p.downloadRequested.connect(self.on_download)
        self.setup_shortcuts()
        self.apply_web_settings(); self.blocker.enabled = store.settings["shield"]
        self.apply_theme(); self.place_grips()
        QGuiApplication.styleHints().colorSchemeChanged.connect(
            lambda _s: self.store.settings["appearance"] == "system" and self.apply_theme())

        t = QTimer(self); t.timeout.connect(self.refresh_shield); t.start(1000)
        t2 = QTimer(self); t2.timeout.connect(updater.check); t2.start(6 * 3600 * 1000)
        QTimer.singleShot(4000, updater.check)
        self.restore()

    # ---- theme & settings ----
    def system_dark(self):
        return QGuiApplication.styleHints().colorScheme() != Qt.ColorScheme.Light

    def apply_theme(self, settings=None):
        """Apply the stored theme, or `settings` (a settings-shaped dict) to preview one without saving."""
        s = settings or self.store.settings
        fade = Crossfade(self.centralWidget(), self.store)
        qss, self.t = build_theme(resolve_theme(s, self.system_dark()))
        QApplication.instance().setStyleSheet(qss)
        c, on = self.t["icon"], self.t["on_accent"]
        for b, n in ((self.btn_plus, "plus"), (self.btn_back, "back"), (self.btn_fwd, "forward"), (self.btn_home, "home"), (self.btn_dl, "download"),
                     (self.btn_menu, "menu"), (self.f_prev, "up"), (self.f_next, "down"), (self.f_close, "close"),
                     (self.btn_min, "min"), (self.btn_x, "close"), (self.btn_set, "sliders")):
            b.setIcon(icon(n, c, on=on))
        for k, b in self.rail_btns.items(): b.setIcon(icon(k, c, on=on))
        self.sync_max()
        for i in range(self.stack.count()):
            v = self.stack.widget(i)
            if not v.shown(): v.load(QUrl(NEWTAB))
            self.tabbar.setTabTextColor(i, QColor(self.t["accent"]) if v.private else QColor(self.t["muted"]))
        self.sync_bar(); self.style_titlebar()
        fade.run()

    def style_titlebar(self):
        if sys.platform != "win32" or not self.isVisible(): return
        try:
            hwnd, dwm = int(self.winId()), ctypes.windll.dwmapi
            dwm.DwmSetWindowAttribute(hwnd, 20, ctypes.byref(ctypes.c_int(1 if self.t["dark"] else 0)), 4)
            c = QColor(self.t["bg"])
            dwm.DwmSetWindowAttribute(hwnd, 35, ctypes.byref(ctypes.c_int(c.red() | c.green() << 8 | c.blue() << 16)), 4)
        except Exception:
            pass

    def apply_web_settings(self):
        attr = getattr(QWebEngineSettings.WebAttribute, "ForceDarkMode", None)
        if attr is not None:
            for p in (self.profile, self.private_profile):
                p.settings().setAttribute(attr, bool(self.store.settings["force_dark"]))

    def apply_setting(self, key, val):
        self.store.set(key, val)
        if key in ("theme", "appearance", "overrides", "intensity", "custom_themes"): self.apply_theme()
        elif key == "bookmarks_bar": self.refresh_bookmarks()
        elif key == "shield": self.blocker.enabled = val
        elif key == "force_dark": self.apply_web_settings()
        elif key == "engine": self.reload_newtabs()

    def reload_data(self):
        self.apply_web_settings(); self.blocker.enabled = self.store.settings["shield"]
        self.apply_theme(); self.refresh_bookmarks(); self.sidebar.refresh()

    def clear_site_data(self):
        for p in (self.profile, self.private_profile):
            p.clearHttpCache(); p.cookieStore().deleteAllCookies()

    def newtab_url(self): return NEWTAB

    def reload_newtabs(self):
        for i in range(self.stack.count()):
            v = self.stack.widget(i)
            if v.url().toString().startswith(NEWTAB): v.reload()

    def pick_wallpaper(self):
        p, _ = QFileDialog.getOpenFileName(self, "Choose wallpaper", "", "Images (*.png *.jpg *.jpeg *.webp *.bmp)")
        if not p: return
        img = QImage(p)
        if img.isNull():
            QMessageBox.warning(self, "Wallpaper", "That file isn't an image Vexora can read."); return
        if img.width() > 2560 or img.height() > 1440:
            img = img.scaled(2560, 1440, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
        old = list(wallpaper_dir().glob("*"))
        name = f"wall{int(time.time())}.jpg"
        if not img.save(str(wallpaper_dir() / name), "JPG", 88):
            QMessageBox.warning(self, "Wallpaper", "Couldn't save that image."); return
        self.store.set("wallpaper", name)
        for f in old: f.unlink(missing_ok=True)
        self.reload_newtabs()

    def reset_wallpaper(self):
        for f in wallpaper_dir().glob("*"): f.unlink(missing_ok=True)
        self.store.set("wallpaper", ""); self.reload_newtabs()

    # ---- frameless window ----
    def toggle_max(self): self.showNormal() if self.isMaximized() else self.showMaximized()

    def sync_max(self):
        self.btn_max.setIcon(icon("restore" if self.isMaximized() else "max", self.t["icon"] if self.t else "#888"))
        self.btn_max.setToolTip("Restore" if self.isMaximized() else "Maximize")

    def place_grips(self):
        g, w, h = 6, self.width(), self.height()
        show = not (self.isMaximized() or self.isFullScreen())
        for s in self.findChildren(Grip, options=Qt.FindChildOption.FindDirectChildrenOnly):
            E = Qt.Edge
            x = 0 if E.LeftEdge in s.edges else w - g if E.RightEdge in s.edges else g
            y = 0 if E.TopEdge in s.edges else h - g if E.BottomEdge in s.edges else g
            cw = g if (E.LeftEdge in s.edges or E.RightEdge in s.edges) else w - 2 * g
            ch = g if (E.TopEdge in s.edges or E.BottomEdge in s.edges) else h - 2 * g
            s.setGeometry(x, y, cw, ch); s.setVisible(show); s.raise_()

    def resizeEvent(self, e): super().resizeEvent(e); self.place_grips()

    def changeEvent(self, e):
        super().changeEvent(e)
        if e.type() == e.Type.WindowStateChange and self.t: self.sync_max(); self.place_grips()

    # ---- tabs ----
    def cur(self): return self.stack.currentWidget()

    def new_tab(self, url=None, activate=True, private=False):
        view = Tab(self, private)
        self.stack.addWidget(view); i = self.tabbar.addTab("Private" if private else "New tab")
        if private: self.tabbar.setTabTextColor(i, QColor(self.t["accent"]))
        def title(t, v=view): self.tabbar.setTabText(self.stack.indexOf(v), ("Private: " if v.private else "") + (t or "New tab"))
        view.titleChanged.connect(title)
        view.iconChanged.connect(lambda ic, v=view: self.on_icon(v, ic))
        view.urlChanged.connect(lambda _u, v=view: v is self.cur() and self.sync_bar())
        view.loadStarted.connect(lambda v=view: v is self.cur() and self.sync_bar())
        view.loadFinished.connect(lambda ok, v=view: self.on_loaded(v, ok))
        if activate: self.tabbar.setCurrentIndex(i)
        if url: view.load(QUrl(url))
        return view

    def on_icon(self, v, ic):
        self.tabbar.setTabIcon(self.stack.indexOf(v), ic)
        u = v.shown()
        if v.private or not u.startswith(("http://", "https://")): return
        if self.store.save_icon(u, ic) and any(host_key(b["url"]) == host_key(u) for b in self.store.bookmarks):
            self.refresh_bookmarks()
            if self.sidebar.isVisible(): self.sidebar.refresh()

    def open_here(self, url): self.cur().load(QUrl(url)); self.cur().setFocus()

    def close_tab(self, i):
        view = self.stack.widget(i)
        if view.shown() and not view.private: self.closed.append(view.shown())
        self.stack.removeWidget(view); self.tabbar.removeTab(i); view.deleteLater()
        if self.tabbar.count() == 0:
            self.session_file().unlink(missing_ok=True); self.close()
        else: self.save()

    def on_moved(self, a, b):
        w = self.stack.widget(a); self.stack.removeWidget(w); self.stack.insertWidget(b, w)
        self.stack.setCurrentIndex(self.tabbar.currentIndex())

    def on_current(self, i):
        if i < 0: return
        self.stack.setCurrentIndex(i); self.sync_bar()
        if not self.cur().shown(): self.cur().setFocus()

    def on_loaded(self, view, ok):
        if view is self.cur(): self.sync_bar()
        u = view.shown()
        if ok and u.startswith(("http://", "https://")) and not view.private:
            self.store.add_history(u, view.title())
            if self.sidebar.isVisible(): self.sidebar.history.refresh()
        self.save()

    def sync_bar(self):
        v = self.cur()
        if not v or not self.t: return
        u = v.shown()
        if not self.url.hasFocus(): self.url.setText(u)
        self.url.setPlaceholderText("Private tab: nothing is saved" if v.private else "Search or enter address")
        mark, tip = (("lock", "Connection is secure (HTTPS)") if u.startswith("https://") else ("warn", "Not secure (HTTP)") if u.startswith("http://")
                     else ("search", "Search or enter an address"))
        self.url_mark.setIcon(icon(mark, "#e5a13a" if mark == "warn" else self.t["icon"])); self.url_mark.setToolTip(tip)
        self.btn_back.setEnabled(v.history().canGoBack()); self.btn_fwd.setEnabled(v.history().canGoForward())
        loading = v.isLoading() if hasattr(v, "isLoading") else False
        self.btn_reload.setIcon(icon("stop" if loading else "reload", self.t["icon"]))
        self.btn_reload.setProperty("loading", loading)
        on = bool(u) and self.store.is_bookmarked(u)
        self.btn_star.setIcon(icon("star", self.t["accent"] if on else self.t["icon"], self.t["accent"] if on else None))
        self.btn_star.setEnabled(bool(u))

    def reload_or_stop(self):
        if self.btn_reload.property("loading"): self.cur().stop()
        else: self.cur().reload()

    def go(self):
        u = resolve(self.url.text(), ENGINES[self.store.settings["engine"]])
        if u: self.open_here(u)

    # ---- bookmarks ----
    def toggle_bookmark(self):
        v = self.cur(); u = v.shown()
        if u: self.store.toggle_bookmark(u, v.title()); self.on_bookmarks_changed()

    def on_bookmarks_changed(self): self.sync_bar(); self.refresh_bookmarks(); self.sidebar.bookmarks.refresh()

    def refresh_bookmarks(self):
        while self.bml.count():
            w = self.bml.takeAt(0).widget()
            if w: w.deleteLater()
        for b in self.store.bookmarks:
            btn = QToolButton(); btn.setObjectName("bm"); btn.setToolTip(b["url"])
            btn.setText(b["title"][:22] + ("…" if len(b["title"]) > 22 else ""))
            btn.setIcon(self.store.icon(b["url"])); btn.setIconSize(QSize(14, 14))
            btn.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonTextBesideIcon)
            btn.clicked.connect(lambda _c, u=b["url"]: self.open_here(u))
            btn.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
            btn.customContextMenuRequested.connect(lambda _p, u=b["url"], w=btn: self.bookmark_menu(u, w))
            self.bml.addWidget(btn)
        self.bml.addStretch()
        self.bmbar.setVisible(self.store.settings["bookmarks_bar"] and bool(self.store.bookmarks))

    def bookmark_menu(self, url, widget):
        m = QMenu(self)
        m.addAction("Open in new tab", lambda: self.new_tab(url))
        m.addAction("Remove bookmark", lambda: (self.store.remove_bookmark(url), self.on_bookmarks_changed()))
        m.exec(widget.mapToGlobal(widget.rect().bottomLeft()))

    # ---- sidebar, find, palette, settings ----
    def toggle_sidebar(self, page):
        if page is None or (self.sidebar.isVisible() and self.sidebar.stack.currentIndex() == page):
            self.sidebar.setVisible(not self.sidebar.isVisible())
        else:
            self.sidebar.show(); self.sidebar.show_page(page)
        if self.sidebar.isVisible() and page is None: self.sidebar.refresh()
        self.sync_rail()

    def sync_rail(self):
        cur = self.sidebar.stack.currentIndex() if self.sidebar.isVisible() else -1
        for i, k in enumerate(("bookmark", "history", "download")): self.rail_btns[k].setChecked(i == cur)

    def show_find(self):
        self.find.show(); self.find_input.setFocus(); self.find_input.selectAll()
        if self.find_input.text(): self.find_text(True)

    def hide_find(self):
        self.find.hide(); self.find_count.clear()
        if self.cur(): self.cur().findText(""); self.cur().setFocus()

    def find_text(self, forward):
        flags = QWebEnginePage.FindFlag(0) if forward else QWebEnginePage.FindFlag.FindBackward
        self.cur().findText(self.find_input.text(), flags)

    def on_find_result(self, r):
        self.find_count.setText(f"{r.activeMatch()}/{r.numberOfMatches()}" if self.find_input.text() else "")

    def open_palette(self):
        E = [("action", a[0], a[1], a[2]) for a in self.actions_list if a]
        for i in range(self.stack.count()):
            v = self.stack.widget(i)
            E.append(("tab", v.title() or "New tab", v.shown(), lambda i=i: self.tabbar.setCurrentIndex(i)))
        for b in self.store.bookmarks:
            E.append(("bookmark", b["title"], b["url"], lambda u=b["url"]: self.open_here(u)))
        seen = set()
        for h in reversed(self.store.history):
            if h["url"] not in seen and len(seen) < 200:
                seen.add(h["url"]); E.append(("history", h["title"], h["url"], lambda u=h["url"]: self.open_here(u)))
        eng = ENGINES[self.store.settings["engine"]]
        Palette(self, E, lambda text: self.open_here(resolve(text, eng))).popup()

    def open_settings(self, page=None):
        d = Settings(self)
        for i in range(d.nav.count()):
            if page and d.nav.item(i).text() == page: d.nav.setCurrentRow(i)
        d.exec()

    # ---- session ----
    def session_file(self):
        d = Path(QStandardPaths.writableLocation(QStandardPaths.StandardLocation.AppDataLocation))
        d.mkdir(parents=True, exist_ok=True)
        return d / "session.json"

    def save(self):
        tabs = [self.stack.widget(i) for i in range(self.stack.count())]
        keep = [v for v in tabs if not v.private]
        cur = self.cur()
        active = keep.index(cur) if cur in keep else 0           # index among the saved (non-private) tabs
        urls = [(v.shown() or NEWTAB) for v in keep]
        try: self.session_file().write_text(json.dumps({"urls": urls, "active": active}))
        except OSError: pass

    def restore(self):
        try: s = json.loads(self.session_file().read_text())
        except (OSError, ValueError): s = {}
        saved = s.get("urls", []) if self.store.settings["restore_tabs"] and isinstance(s.get("urls"), list) else []
        urls = [u for u in saved if isinstance(u, str) and (u.startswith(("http://", "https://")) or u.startswith(NEWTAB))] or [NEWTAB]
        for u in urls: self.new_tab(u, activate=False)
        try: act = int(s.get("active", 0))
        except (TypeError, ValueError): act = 0
        self.tabbar.setCurrentIndex(min(max(act, 0), len(urls) - 1))
        self.refresh_bookmarks()

    # ---- misc ----
    def setup_shortcuts(self):
        def sc(keys, fn): QShortcut(QKeySequence(keys), self, activated=fn)
        for a in self.actions_list:
            if a: sc(a[1], a[2])
        sc("Ctrl+W", lambda: self.close_tab(self.tabbar.currentIndex()))
        sc("Ctrl+Shift+T", lambda: self.closed and self.new_tab(self.closed.pop()))
        sc("Ctrl+Shift+B", lambda: self.apply_setting("bookmarks_bar", not self.store.settings["bookmarks_bar"]))
        sc("Ctrl+L", lambda: (self.url.setFocus(), self.url.selectAll())); sc("Alt+D", lambda: (self.url.setFocus(), self.url.selectAll()))
        sc("Ctrl+R", lambda: self.cur().reload()); sc("F5", lambda: self.cur().reload())
        sc("Ctrl+Tab", lambda: self.step(1)); sc("Ctrl+Shift+Tab", lambda: self.step(-1))
        sc("Alt+Left", lambda: self.cur().back()); sc("Alt+Right", lambda: self.cur().forward())
        for n in range(1, 10):
            sc(f"Ctrl+{n}", lambda n=n: self.tabbar.setCurrentIndex(
                self.tabbar.count() - 1 if n == 9 else min(n - 1, self.tabbar.count() - 1)))
        zoom = lambda d: self.cur().setZoomFactor(min(5, max(.25, self.cur().zoomFactor() + d)))
        sc("Ctrl+=", lambda: zoom(.1)); sc("Ctrl++", lambda: zoom(.1)); sc("Ctrl+-", lambda: zoom(-.1))
        sc("Ctrl+0", lambda: self.cur().setZoomFactor(1)); sc("F12", self.devtools)

    def step(self, d): self.tabbar.setCurrentIndex((self.tabbar.currentIndex() + d) % self.tabbar.count())

    def devtools(self):
        self.dev = QWebEngineView(); self.cur().page().setDevToolsPage(self.dev.page()); self.dev.resize(900, 600); self.dev.show()

    def on_fullscreen(self, req):
        req.accept(); on = req.toggleOn()
        if on:
            self._hidden = [w for w in (self.top, self.bar, self.bmbar, self.rail, self.sidebar) if w.isVisible()]
            for w in self._hidden: w.hide()
        else:
            for w in getattr(self, "_hidden", []): w.show()
        if on: self._was_max = self.isMaximized(); self.showFullScreen()
        else: self.showMaximized() if self._was_max else self.showNormal()

    def on_download(self, dl):
        name = dl.downloadFileName()
        folder = Path(QStandardPaths.writableLocation(QStandardPaths.StandardLocation.DownloadLocation))
        if self.store.settings["ask_save"]:
            path, _ = QFileDialog.getSaveFileName(self, "Save file", str(folder / name))
            if not path: dl.cancel(); return
            p = Path(path)
        else:
            p, n = folder / name, 1
            while p.exists():
                p = folder / f"{Path(name).stem} ({n}){Path(name).suffix}"; n += 1
        dl.setDownloadDirectory(str(p.parent)); dl.setDownloadFileName(p.name); dl.accept()
        self.sidebar.downloads.add(dl); self.sidebar.show(); self.sidebar.show_page(2); self.sync_rail()

    def refresh_shield(self):
        n = self.blocker.count
        if n != self._last:
            self.store.settings["blocked_total"] += n - self._last; self._last = n; self.store.touch()
        self.shield.setText(f"{n} blocked" if n else "")

    def closeEvent(self, e):
        self.store.flush(); super().closeEvent(e)

    # ---- updates ----
    def on_update_available(self, ver):
        self.banner_text.setText(f"Vexora {ver} is available (you have {VERSION})")
        self.btn_update.setEnabled(True); self.btn_update.show(); self.banner.show()

    def start_update(self):
        self.btn_update.setEnabled(False); self.banner_text.setText("Downloading update… 0%"); self.updater.install()

    def on_update_failed(self, msg):
        self.banner_text.setText(f"Update failed: {msg}"); self.btn_update.setText("Retry"); self.btn_update.setEnabled(True)


def make_profile(app, name, ua, blocker):
    p = QWebEngineProfile(name, app) if name else QWebEngineProfile(app)   # no name = off the record
    p.setHttpUserAgent(ua); p.setUrlRequestInterceptor(blocker)
    return p


def main():
    register_scheme()                                  # must happen before QApplication exists
    app = QApplication(sys.argv)
    app.setApplicationName("Vexora"); app.setStyle("Fusion")
    store = Store(); app.aboutToQuit.connect(store.flush)
    blocker = Blocker()
    # Google refuses sign-in from agents that announce QtWebEngine; present as plain Chromium.
    ua = re.sub(r"\s*QtWebEngine/\S+", "", QWebEngineProfile.defaultProfile().httpUserAgent())
    win = Browser(make_profile(app, "Vexora", ua, blocker), make_profile(app, None, ua, blocker), blocker, Updater(), store)
    win.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
