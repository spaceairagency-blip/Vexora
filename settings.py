"""Settings dialog. Every control applies immediately."""
import json

import copy

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (QButtonGroup, QCheckBox, QComboBox, QDialog, QFileDialog, QHBoxLayout, QLabel,
                               QColorDialog, QInputDialog, QListWidget, QMessageBox, QPushButton, QSlider, QStackedWidget,
                               QVBoxLayout, QWidget)

from store import DEFAULTS, ENGINES
import theme
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

    # ---- appearance: everything previews live; Apply saves, closing the dialog without Apply reverts ----
    KEYS = ("theme", "appearance", "overrides", "intensity")

    def appearance(self):
        st = self.store.settings
        if not hasattr(self, "draft"):
            self.draft = {k: copy.deepcopy(st[k]) for k in self.KEYS}
            self.finished.connect(self.revert_preview)
        d = self.draft
        w, v = self.page("Appearance")
        v.addWidget(QLabel("Mode"))
        row = QHBoxLayout(); group = QButtonGroup(w)
        for label, val in (("Dark", "dark"), ("Light", "light"), ("Follow system", "system")):
            b = QPushButton(label); b.setObjectName("opt"); b.setCheckable(True); b.setChecked(d["appearance"] == val)
            b.clicked.connect(lambda _c, x=val: self.change(appearance=x)); group.addButton(b); row.addWidget(b)
        row.addStretch(); v.addLayout(row)

        v.addWidget(QLabel("Theme"))
        grid = QHBoxLayout(); group = QButtonGroup(w)
        for name in theme.names(st):
            b = QPushButton(name); b.setObjectName("opt"); b.setCheckable(True); b.setChecked(d["theme"] == name)
            b.clicked.connect(lambda _c, n=name: self.change(theme=n, overrides={})); group.addButton(b); grid.addWidget(b)
        grid.addStretch(); v.addLayout(grid)

        v.addWidget(QLabel("Colours"))
        final = theme.resolve(dict(st, **d), self.br.system_dark())
        for key, label in theme.LABELS.items():
            r = QHBoxLayout()
            sw = QPushButton(); sw.setFixedSize(26, 26); sw.setToolTip("Choose a colour")
            sw.setStyleSheet(f"background:{final[key]}; border:1px solid {final['line']}; border-radius:13px; padding:0;")
            sw.clicked.connect(lambda _c, k=key, cur=final[key]: self.pick(k, cur))
            lab = QLabel(f"{label}   {final[key].upper()}"); lab.setObjectName("muted")
            r.addWidget(sw); r.addWidget(lab); r.addStretch(); v.addLayout(r)
        r = QHBoxLayout(); r.addWidget(QLabel("Accent intensity"))
        sl = QSlider(Qt.Orientation.Horizontal); sl.setRange(40, 100); sl.setValue(round(d["intensity"] * 100)); sl.setFixedWidth(180)
        sl.valueChanged.connect(lambda x: self.change(intensity=x / 100, rebuild=False))
        r.addWidget(sl); r.addStretch(); v.addLayout(r)

        r = QHBoxLayout()
        self.btn_apply = QPushButton("Apply"); self.btn_apply.clicked.connect(self.apply_draft)
        self.btn_revert = QPushButton("Revert"); self.btn_revert.setObjectName("flat"); self.btn_revert.clicked.connect(self.revert_draft)
        for b in (self.btn_apply, self.btn_revert): r.addWidget(b)
        r.addStretch(); v.addLayout(r)
        self.mark_dirty()

        v.addWidget(QLabel("Custom themes"))
        custom = d["theme"] in st["custom_themes"]
        r = QHBoxLayout()
        for text, fn, on in (("Save current as new…", self.save_theme, True), ("Rename…", self.rename_theme, custom),
                             ("Delete", self.delete_theme, custom), ("Reset to default", self.reset_theme, True)):
            b = QPushButton(text); b.setObjectName("danger" if text in ("Delete", "Reset to default") else "flat")
            b.setEnabled(on); b.clicked.connect(fn); r.addWidget(b)
        r.addStretch(); v.addLayout(r)
        self.check(v, "reduce_motion", "Reduce motion", "Turns off Vexora's animations. Also follows the Windows animation setting.")
        v.addStretch()
        return w

    def mark_dirty(self):
        dirty = any(self.draft[k] != self.store.settings[k] for k in self.KEYS)
        self.btn_apply.setEnabled(dirty); self.btn_revert.setEnabled(dirty)

    def preview(self):
        self.br.apply_theme(dict(self.store.settings, **self.draft))

    def change(self, rebuild=True, **kw):
        self.draft.update(kw); self.preview()
        if rebuild: self.rebuild()
        else: self.mark_dirty()

    def rebuild(self):
        i = self.stack.currentIndex(); old = self.stack.widget(1)
        self.stack.removeWidget(old); old.deleteLater()
        self.stack.insertWidget(1, self.appearance()); self.stack.setCurrentIndex(i)

    def pick(self, key, cur):
        c = QColorDialog.getColor(QColor(cur), self, theme.LABELS[key])
        if c.isValid():
            self.change(overrides=dict(self.draft["overrides"], **{key: c.name().upper()}))

    def apply_draft(self):
        for k in self.KEYS: self.br.apply_setting(k, copy.deepcopy(self.draft[k]))
        self.rebuild()

    def revert_draft(self):
        self.draft = {k: copy.deepcopy(self.store.settings[k]) for k in self.KEYS}; self.preview(); self.rebuild()

    def revert_preview(self, _r=None):
        if any(self.draft[k] != self.store.settings[k] for k in self.KEYS): self.br.apply_theme()

    def current_tokens(self):
        t = theme.resolve(dict(self.store.settings, **self.draft), self.br.system_dark())
        return {k: QColor(t[k]).name().upper() for k in theme.TOKENS}

    def ask_name(self, title, default=""):
        while True:
            name, ok = QInputDialog.getText(self, title, "Theme name", text=default)
            name = name.strip()[:40]
            if not ok or not name: return None
            if name in theme.BUILTIN or (name in self.store.settings["custom_themes"] and name != default):
                QMessageBox.warning(self, title, "A theme with that name already exists."); default = name; continue
            return name

    def save_theme(self):
        name = self.ask_name("Save theme")
        if not name: return
        customs = dict(self.store.settings["custom_themes"]); customs[name] = self.current_tokens()
        self.br.apply_setting("custom_themes", customs)
        self.draft.update(theme=name, overrides={}); self.apply_draft()

    def rename_theme(self):
        old = self.draft["theme"]; name = self.ask_name("Rename theme", old)
        if not name or name == old: return
        customs = {(name if k == old else k): v for k, v in self.store.settings["custom_themes"].items()}
        self.br.apply_setting("custom_themes", customs)
        if self.store.settings["theme"] == old: self.br.apply_setting("theme", name)
        self.draft["theme"] = name; self.rebuild()

    def delete_theme(self):
        old = self.draft["theme"]
        if QMessageBox.question(self, "Delete theme", f'Delete the theme "{old}"?') != QMessageBox.StandardButton.Yes: return
        self.br.apply_setting("custom_themes", {k: v for k, v in self.store.settings["custom_themes"].items() if k != old})
        if self.store.settings["theme"] == old: self.br.apply_setting("theme", theme.DEFAULT)
        self.draft.update(theme=theme.DEFAULT, overrides={}); self.preview(); self.rebuild()

    def reset_theme(self):
        if QMessageBox.question(self, "Reset appearance", "Reset theme, colours and intensity to the Vexora Aurora defaults?\n"
                                "Your saved custom themes are kept.") != QMessageBox.StandardButton.Yes: return
        self.draft = {k: copy.deepcopy(DEFAULTS[k]) for k in self.KEYS}; self.apply_draft()

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
