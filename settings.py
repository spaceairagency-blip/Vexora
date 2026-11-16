"""Settings dialog. Every control applies immediately."""
import json

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (QButtonGroup, QCheckBox, QComboBox, QDialog, QFileDialog, QHBoxLayout, QLabel,
                               QListWidget, QMessageBox, QPushButton, QStackedWidget, QVBoxLayout, QWidget)

from store import ENGINES
from theme import ACCENTS, THEMES
from version import VERSION


class Settings(QDialog):
    def __init__(self, br):
        super().__init__(br)
        self.br, self.store = br, br.store
        self.setWindowTitle("Settings")
        self.resize(700, 480)
        h = QHBoxLayout(self)
        h.setContentsMargins(0, 0, 0, 0)
        h.setSpacing(0)
        self.nav = QListWidget()
        self.nav.setObjectName("nav")
        self.nav.setFixedWidth(170)
        self.stack = QStackedWidget()
        for name, build in (("General", self.general), ("Appearance", self.appearance), ("Privacy", self.privacy),
                            ("Your data", self.data), ("About", self.about)):
            self.nav.addItem(name)
            self.stack.addWidget(build())
        self.nav.currentRowChanged.connect(self.stack.setCurrentIndex)
        self.nav.setCurrentRow(0)
        h.addWidget(self.nav)
        h.addWidget(self.stack, 1)

    # helpers
    def page(self, title):
        w = QWidget()
        v = QVBoxLayout(w)
        v.setContentsMargins(28, 24, 28, 24)
        v.setSpacing(16)
        t = QLabel(title)
        t.setObjectName("title")
        v.addWidget(t)
        return w, v

    def check(self, v, key, text, note=""):
        c = QCheckBox(text)
        c.setChecked(bool(self.store.settings[key]))
        c.toggled.connect(lambda on: self.br.apply_setting(key, on))
        v.addWidget(c)
        if note:
            n = QLabel(note)
            n.setObjectName("muted")
            n.setWordWrap(True)
            n.setContentsMargins(26, 0, 0, 0)
            v.addWidget(n)

    # pages
    def general(self):
        w, v = self.page("General")
        v.addWidget(QLabel("Search engine"))
        box = QComboBox()
        box.addItems(list(ENGINES))
        box.setCurrentText(self.store.settings["engine"])
        box.currentTextChanged.connect(lambda t: self.br.apply_setting("engine", t))
        v.addWidget(box, 0, Qt.AlignmentFlag.AlignLeft)
        self.check(v, "restore_tabs", "Reopen tabs from last time on startup")
        self.check(v, "bookmarks_bar", "Show bookmarks bar", "Appears under the address bar once you have a bookmark.")
        self.check(v, "ask_save", "Ask where to save each download")
        v.addStretch()
        return w

    def appearance(self):
        w, v = self.page("Appearance")
        v.addWidget(QLabel("Theme"))
        row = QHBoxLayout()
        group = QButtonGroup(self)
        for name in THEMES:
            b = QPushButton(name)
            b.setObjectName("opt")
            b.setCheckable(True)
            b.setChecked(self.store.settings["theme"] == name)
            b.clicked.connect(lambda _c, n=name: self.br.apply_setting("theme", n))
            group.addButton(b)
            row.addWidget(b)
        row.addStretch()
        v.addLayout(row)
        v.addWidget(QLabel("Accent colour"))
        row2, self.swatches = QHBoxLayout(), []
        for name, col in ACCENTS.items():
            b = QPushButton()
            b.setFixedSize(26, 26)
            b.setToolTip(name)
            b.clicked.connect(lambda _c, c=col: (self.br.apply_setting("accent", c), self.paint()))
            self.swatches.append((b, col))
            row2.addWidget(b)
        row2.addStretch()
        v.addLayout(row2)
        self.paint()
        v.addStretch()
        return w

    def paint(self):
        cur = self.store.settings["accent"]
        for b, col in self.swatches:
            ring = "#e6e6ea" if col == cur else "transparent"
            b.setStyleSheet(f"background:{col}; border:2px solid {ring}; border-radius:13px; padding:0;")

    def privacy(self):
        w, v = self.page("Privacy")
        self.check(v, "shield", "Block trackers and ad networks", "Cancels requests to known tracking domains before they load.")
        self.check(v, "force_dark", "Dark mode for web pages", "Asks Chromium to darken pages that don't have their own dark theme.")
        self.stat = QLabel()
        self.stat.setObjectName("muted")
        v.addWidget(self.stat)
        self.update_stat()
        row = QHBoxLayout()
        for text, fn in (("Clear history", self.clear_history), ("Clear cookies and cache", self.clear_site)):
            b = QPushButton(text)
            b.setObjectName("danger")
            b.clicked.connect(fn)
            row.addWidget(b)
        row.addStretch()
        v.addLayout(row)
        v.addStretch()
        return w

    def update_stat(self):
        self.stat.setText(f'{self.store.settings["blocked_total"] + self.br.blocker.count - self.br._last:,} requests blocked in total')

    def clear_history(self):
        if QMessageBox.question(self, "Clear history", "Delete all browsing history?") == QMessageBox.StandardButton.Yes:
            self.store.clear_history()
            self.br.reload_data()

    def clear_site(self):
        if QMessageBox.question(self, "Clear cookies and cache", "This signs you out of websites. Continue?") == QMessageBox.StandardButton.Yes:
            self.br.clear_site_data()

    def data(self):
        w, v = self.page("Your data")
        info = QLabel(f"{len(self.store.bookmarks)} bookmarks, {len(self.store.history)} history entries")
        info.setObjectName("muted")
        v.addWidget(info)
        row = QHBoxLayout()
        for text, fn in (("Export backup", self.export), ("Import backup", self.import_)):
            b = QPushButton(text)
            b.setObjectName("flat")
            b.clicked.connect(fn)
            row.addWidget(b)
        row.addStretch()
        v.addLayout(row)
        n = QLabel("A backup is a JSON file with your bookmarks, history and settings.")
        n.setObjectName("muted")
        v.addWidget(n)
        v.addStretch()
        return w

    def export(self):
        p, _ = QFileDialog.getSaveFileName(self, "Export backup", "vexora-backup.json", "JSON (*.json)")
        if p:
            with open(p, "w", encoding="utf-8") as f:
                json.dump(self.store.export_data(), f, indent=2)

    def import_(self):
        p, _ = QFileDialog.getOpenFileName(self, "Import backup", "", "JSON (*.json)")
        if not p:
            return
        try:
            with open(p, encoding="utf-8") as f:
                self.store.import_data(json.load(f))
        except (OSError, ValueError) as e:
            QMessageBox.warning(self, "Import failed", f"That file isn't a valid Vexora backup.\n\n{e}")
            return
        self.br.reload_data()
        QMessageBox.information(self, "Import", "Backup imported.")

    def about(self):
        w, v = self.page("About")
        v.addWidget(QLabel(f"Vexora {VERSION}"))
        self.status = QLabel()
        self.status.setObjectName("muted")
        b = QPushButton("Check for updates")
        b.setObjectName("flat")
        b.clicked.connect(lambda: (self.status.setText("Checking…"), self.br.updater.check(True)))
        v.addWidget(b, 0, Qt.AlignmentFlag.AlignLeft)
        v.addWidget(self.status)
        u = self.br.updater
        links = [(u.uptodate, lambda: self.status.setText("You're up to date.")),
                 (u.check_failed, self.status.setText),
                 (u.available, lambda ver: self.status.setText(f"Version {ver} is available. Use the bar at the top of the window."))]
        for sig, fn in links: sig.connect(fn)
        self.finished.connect(lambda _r: [sig.disconnect(fn) for sig, fn in links])
        v.addStretch()
        return w
