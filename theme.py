"""Flat, solid-colour themes. No gradients."""
from string import Template
from store import cache_dir

THEMES = {
    "Dark":  dict(bg="#141416", surface="#1e1e22", hover="#2a2a30", line="#2b2b31", text="#e6e6ea", muted="#8d8d96", icon="#b4b4bb", dark=True),
    "Black": dict(bg="#000000", surface="#0d0d0f", hover="#1b1b1f", line="#232327", text="#ececf0", muted="#85858e", icon="#b4b4bb", dark=True),
    "Light": dict(bg="#e9e9ed", surface="#ffffff", hover="#dcdce2", line="#d2d2d8", text="#1b1b1f", muted="#6a6a73", icon="#55555e", dark=False),
}
ACCENTS = {"Violet": "#8a6df5", "Blue": "#4c8dff", "Green": "#34b27b", "Orange": "#e8833a", "Rose": "#e0568f"}

QSS = Template("""
QWidget { background:$bg; color:$text; font:13px "Segoe UI"; }
QLabel { background:transparent; }
QLabel#muted { color:$muted; font-size:12px; }
QLabel#title { font-size:15px; font-weight:600; }
#bar, #banner, #find, #sidebar, #bmbar { background:$surface; }
#bar, #banner, #find, #bmbar { border-bottom:1px solid $line; }
#sidebar { border-right:1px solid $line; }
QToolButton { border:0; border-radius:6px; padding:6px; background:transparent; color:$text; }
QToolButton:hover { background:$hover; }
QToolButton::menu-indicator { image:none; }
QToolButton#bm { padding:4px 8px; color:$muted; }
QToolButton#bm:hover { color:$text; }
QLineEdit { background:$bg; border:1px solid transparent; border-radius:8px; padding:6px 12px; selection-background-color:$accent; selection-color:#fff; }
QLineEdit:focus { border-color:$accent; }
#sidebar QWidget { background:transparent; }
QLineEdit#sbsearch { background:$bg; margin:0 10px; }
QTabBar::tab { background:transparent; color:$muted; padding:8px 10px; min-width:90px; max-width:200px; border-top-left-radius:8px; border-top-right-radius:8px; margin-right:2px; }
QTabBar::tab:selected { background:$surface; color:$text; }
QTabBar::tab:hover:!selected { background:$surface; }
QTabBar::close-button { image:url("$close"); subcontrol-position:right; border-radius:4px; margin:0 2px; }
QTabBar::close-button:hover { background:$hover; }
QPushButton { background:$accent; color:#fff; border:0; border-radius:6px; padding:6px 14px; }
QPushButton#ghost { background:transparent; color:$muted; }
QPushButton#ghost:hover { color:$text; }
QPushButton#flat { background:$hover; color:$text; }
QPushButton#danger { background:transparent; color:#e5484d; border:1px solid $line; }
QPushButton#opt { background:$surface; color:$text; border:1px solid $line; padding:6px 16px; }
QPushButton#opt:checked { border-color:$accent; }
QPushButton#sbtab { background:transparent; color:$muted; border:0; border-bottom:2px solid transparent; border-radius:0; padding:8px 10px; }
QPushButton#sbtab:checked { color:$text; border-bottom-color:$accent; }
QListWidget { background:transparent; border:0; outline:0; }
QListWidget::item { padding:7px 10px; border-radius:6px; margin:1px 6px; }
QListWidget::item:hover, QListWidget::item:selected { background:$hover; color:$text; }
QListWidget#nav::item { padding:8px 12px; margin:1px 8px; }
QListWidget#nav::item:selected { background:$hover; }
QMenu { background:$surface; border:1px solid $line; padding:4px; }
QMenu::item { padding:6px 22px 6px 12px; border-radius:4px; }
QMenu::item:selected { background:$hover; }
QMenu::separator { height:1px; background:$line; margin:4px 8px; }
QCheckBox { spacing:10px; }
QCheckBox::indicator { width:16px; height:16px; border:1px solid $line; border-radius:4px; background:$bg; }
QCheckBox::indicator:checked { background:$accent; border-color:$accent; image:url("$check"); }
QComboBox { background:$bg; border:1px solid $line; border-radius:6px; padding:5px 10px; min-width:120px; }
QComboBox QAbstractItemView { background:$surface; border:1px solid $line; selection-background-color:$hover; outline:0; }
QComboBox::drop-down { border:0; width:20px; }
QScrollBar:vertical { width:10px; background:transparent; }
QScrollBar::handle:vertical { background:$hover; border-radius:5px; min-height:24px; }
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height:0; }
QDialog { background:$bg; }
#palette { background:$surface; border:1px solid $line; border-radius:10px; }
QToolTip { background:$surface; color:$text; border:1px solid $line; }
""")


def _svg(path, color, w=1.6):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="none" '
            f'stroke="{color}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"><path d="{path}"/></svg>')


def build(theme, accent):
    t = dict(THEMES.get(theme, THEMES["Dark"]), accent=accent)
    d = cache_dir()
    (d / "close.svg").write_text(_svg("M4.5 4.5l7 7M11.5 4.5l-7 7", t["muted"]))
    (d / "check.svg").write_text(_svg("M3.5 8.5l3 3 6-7", "#ffffff", 2))
    t["close"], t["check"] = (d / "close.svg").as_posix(), (d / "check.svg").as_posix()
    return QSS.substitute(t), t
