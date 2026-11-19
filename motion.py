"""Animation helpers. Everything here is skipped when the user (or the OS) asks for reduced motion."""
import ctypes, sys

from PySide6.QtCore import QEasingCurve, QPropertyAnimation, Qt
from PySide6.QtWidgets import QGraphicsOpacityEffect, QLabel


def system_reduced():
    """True when Windows has 'Animation effects' turned off (SPI_GETCLIENTAREAANIMATION)."""
    if sys.platform != "win32":
        return False
    try:
        on = ctypes.c_int(1)
        ctypes.windll.user32.SystemParametersInfoW(0x1042, 0, ctypes.byref(on), 0)
        return not on.value
    except Exception:
        return False


def reduced(store):
    return bool(store.settings["reduce_motion"]) or system_reduced()


class Crossfade:
    """Freeze the current look of a widget, let the caller change it, then fade the frozen image away."""
    def __init__(self, widget, store, ms=180):
        self.overlay = None
        if reduced(store) or not widget.isVisible():
            return
        self.overlay = QLabel(widget)
        self.overlay.setPixmap(widget.grab())
        self.overlay.setGeometry(widget.rect())
        self.overlay.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        self.overlay.show()
        self.ms = ms

    def run(self):
        o = self.overlay
        if o is None:
            return
        fx = QGraphicsOpacityEffect(o)
        o.setGraphicsEffect(fx)
        a = QPropertyAnimation(fx, b"opacity", o)
        a.setDuration(self.ms); a.setStartValue(1.0); a.setEndValue(0.0); a.setEasingCurve(QEasingCurve.Type.OutCubic)
        a.finished.connect(o.deleteLater)
        a.start()
        o._anim = a
