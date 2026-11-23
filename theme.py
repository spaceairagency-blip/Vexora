"""Design tokens and theme engine. Flat, solid-colour surfaces; accents are used sparingly.

A theme is six colour tokens (accent, accent2, bg, surface, text, muted). Everything else (borders, hover,
icon colour) is derived from them, so a custom theme only has to define six colours.
resolve(settings) -> tokens, build(tokens) -> (QSS, tokens)
"""
from string import Template

from PySide6.QtGui import QColor

TOKENS = ("accent", "accent2", "bg", "surface", "text", "muted")
DEFAULT, LIGHT = "Vexora Aurora", "Light"
BUILTIN = {
    "Vexora Aurora": dict(accent="#168BFF", accent2="#8B5CF6", bg="#15151B", surface="#202027", text="#F5F5F7", muted="#A1A1AA"),
    "Ocean":         dict(accent="#1FB6FF", accent2="#14B8A6", bg="#0F1A24", surface="#172635", text="#EAF4FB", muted="#8FA6B8"),
    "Crimson":       dict(accent="#E5484D", accent2="#FB7185", bg="#1A1214", surface="#261A1D", text="#F8ECED", muted="#B09A9D"),
    "Emerald":       dict(accent="#30A46C", accent2="#2DD4BF", bg="#101A16", surface="#18261F", text="#EAF6F0", muted="#8FA89B"),
    "Monochrome":    dict(accent="#E5E5E5", accent2="#A3A3A3", bg="#121212", surface="#1D1D1D", text="#F5F5F5", muted="#9A9A9A"),
    "Light":         dict(accent="#168BFF", accent2="#8B5CF6", bg="#EEF0F4", surface="#FFFFFF", text="#1B1B1F", muted="#6A6A73"),
}
LEGACY = {"Dark": DEFAULT, "Black": "Monochrome"}          # theme names used before 2.1
OLD_DEFAULT_ACCENT = "#8a6df5"
LABELS = dict(accent="Primary accent", accent2="Secondary accent", bg="Background", surface="Surface",
              text="Text", muted="Secondary text")


def valid(c):
    return isinstance(c, str) and c.startswith("#") and len(c) in (4, 7) and QColor.isValidColorName(c)


def clean_tokens(d):
    """Keep only valid colour tokens from untrusted data (imported backups, settings file)."""
    return {k: QColor(d[k]).name().upper() for k in TOKENS if isinstance(d, dict) and valid(d.get(k))} if isinstance(d, dict) else {}


def clean_customs(d):
    out = {}
    if isinstance(d, dict):
        for name, t in d.items():
            t = clean_tokens(t)
            if isinstance(name, str) and name.strip() and name not in BUILTIN and len(t) == len(TOKENS):
                out[name.strip()[:40]] = t
    return out


def mix(a, b, t):
    a, b = QColor(a), QColor(b)
    return QColor(*(round(x + (y - x) * t) for x, y in zip(a.getRgb()[:3], b.getRgb()[:3]))).name()


def is_dark(bg):
    return QColor(bg).lightness() < 128


def names(settings):
    return list(BUILTIN) + sorted(settings.get("custom_themes", {}))


def base_tokens(settings, name=None):
    name = name or settings.get("theme", DEFAULT)
    t = settings.get("custom_themes", {}).get(name) or BUILTIN.get(name) or BUILTIN[DEFAULT]
    return dict(BUILTIN[DEFAULT], **clean_tokens(t))


def resolve(settings, system_dark=True):
    """Settings -> final colour tokens (+ derived ones). appearance: dark | light | system."""
    t = base_tokens(settings)
    mode = settings.get("appearance", "dark")
    want_dark = system_dark if mode == "system" else mode != "light"
    if is_dark(t["bg"]) != want_dark:                     # theme and requested mode disagree: use that mode's default
        t = dict(BUILTIN[DEFAULT] if want_dark else BUILTIN[LIGHT])
    t.update(clean_tokens(settings.get("overrides", {})))
    k = min(1.0, max(0.4, float(settings.get("intensity", 1.0))))
    for a in ("accent", "accent2"):                       # accent intensity: blend toward the background
        t[a] = mix(t["bg"], t[a], k)
    t["dark"] = is_dark(t["bg"])
    t["line"] = mix(t["surface"], t["text"], .13)
    t["hover"] = mix(t["surface"], t["text"], .09)
    t["icon"] = mix(t["muted"], t["text"], .35)
    t["on_accent"] = "#FFFFFF" if QColor(t["accent"]).lightness() < 170 else "#111111"
    return t


QSS = Template("""
QWidget { background:$bg; color:$text; font:14px "Segoe UI"; }
QLabel { background:transparent; }
QLabel#muted { color:$muted; font-size:12px; }
QLabel#title { font-size:16px; font-weight:600; }
#bar, #banner, #find, #sidebar, #bmbar { background:$surface; }
#bar, #banner, #find, #bmbar { border-bottom:1px solid $line; }
#sidebar { border-right:1px solid $line; }
QToolButton { border:0; border-radius:8px; padding:7px; background:transparent; color:$text; }
QToolButton:hover { background:$hover; }
QToolButton::menu-indicator { image:none; }
QToolButton#bm { padding:4px 8px; color:$muted; }
QToolButton#bm:hover { color:$text; }
QLineEdit { background:$bg; border:1px solid transparent; border-radius:12px; padding:8px 14px; selection-background-color:$accent; selection-color:$on_accent; }
QLineEdit:focus { border-color:$accent; }
#sidebar QWidget { background:transparent; }
QLineEdit#sbsearch { background:$bg; margin:0 10px; }
QLineEdit#url { border-radius:18px; padding:7px 14px 7px 8px; background:$bg; border:1px solid $line; }
QLineEdit#url:focus { border-color:$accent; }
#titlebar { background:$bg; }
QToolButton#winbtn, QToolButton#winclose { border-radius:0; padding:0; }
QToolButton#winclose:hover { background:#e5484d; }
#rail { background:$bg; border-right:1px solid $line; }
QToolButton#railbtn { padding:10px; border-radius:12px; }
QToolButton#railbtn:hover { background:$hover; }
QToolButton#railbtn:checked { background:$accent; }
QTabBar::tab { background:transparent; color:$muted; padding:9px 12px; min-width:100px; max-width:220px; border-top:2px solid transparent; border-top-left-radius:10px; border-top-right-radius:10px; margin-right:2px; }
QTabBar::tab:selected { background:$surface; color:$text; border-top-color:$accent2; }
QTabBar::tab:hover:!selected { background:$surface; }
QTabBar::close-button { image:url("$close"); subcontrol-position:right; border-radius:4px; margin:0 2px; }
QTabBar::close-button:hover { background:$hover; }
QPushButton { background:$accent; color:$on_accent; border:0; border-radius:6px; padding:6px 14px; }
QPushButton:disabled { background:$hover; color:$muted; }
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
QMenu { background:$surface; border:1px solid $line; border-radius:6px; padding:4px; }
QMenu::item { padding:6px 22px 6px 12px; border-radius:4px; }
QMenu::item:selected { background:$hover; }
QMenu::separator { height:1px; background:$line; margin:4px 8px; }
QCheckBox { spacing:10px; }
QCheckBox::indicator { width:16px; height:16px; border:1px solid $line; border-radius:4px; background:$bg; }
QCheckBox::indicator:checked { background:$accent; border-color:$accent; image:url("$check"); }
QComboBox { background:$bg; border:1px solid $line; border-radius:6px; padding:5px 10px; min-width:120px; }
QComboBox QAbstractItemView { background:$surface; border:1px solid $line; selection-background-color:$hover; outline:0; }
QComboBox::drop-down { border:0; width:20px; }
QSlider::groove:horizontal { height:4px; background:$line; border-radius:2px; }
QSlider::sub-page:horizontal { background:$accent; border-radius:2px; }
QSlider::handle:horizontal { width:14px; height:14px; margin:-5px 0; border-radius:7px; background:$text; }
QScrollBar:vertical { width:12px; background:transparent; }
QScrollBar::handle:vertical { background:$hover; border-radius:6px; min-height:24px; }
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height:0; }
QDialog { background:$bg; }
#palette { background:$surface; border:1px solid $line; border-radius:10px; }
QToolTip { background:$surface; color:$text; border:1px solid $line; border-radius:4px; }
""")


def _svg(path, color, w=1.6):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="none" '
            f'stroke="{color}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"><path d="{path}"/></svg>')


def build(t):
    from store import cache_dir                          # imported here: store imports this module
    d = cache_dir()
    (d / "close.svg").write_text(_svg("M4.5 4.5l7 7M11.5 4.5l-7 7", t["muted"]))
    (d / "check.svg").write_text(_svg("M3.5 8.5l3 3 6-7", t["on_accent"], 2))
    t = dict(t, close=(d / "close.svg").as_posix(), check=(d / "check.svg").as_posix())
    return QSS.substitute(t), t
