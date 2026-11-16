"""Ctrl+K: one box for actions, open tabs, bookmarks and history."""
from PySide6.QtCore import QEvent, QPoint, Qt
from PySide6.QtWidgets import QDialog, QLineEdit, QListWidget, QListWidgetItem, QVBoxLayout

FN = Qt.ItemDataRole.UserRole


class Palette(QDialog):
    def __init__(self, parent, entries, go):
        super().__init__(parent, Qt.WindowType.Popup | Qt.WindowType.FramelessWindowHint)
        self.setObjectName("palette")
        self.setFixedWidth(580)
        self.entries, self.go = entries, go      # entries: (kind, label, detail, fn)
        v = QVBoxLayout(self)
        v.setContentsMargins(8, 8, 8, 8)
        v.setSpacing(6)
        self.input = QLineEdit(placeholderText="Type a command, or search tabs, bookmarks and history   (@ for tabs)")
        self.list = QListWidget()
        v.addWidget(self.input)
        v.addWidget(self.list)
        self.input.textChanged.connect(self.refresh)
        self.input.installEventFilter(self)
        self.list.itemClicked.connect(self.run)
        self.refresh()

    def eventFilter(self, obj, ev):
        if obj is self.input and ev.type() == QEvent.Type.KeyPress:
            k = ev.key()
            if k in (Qt.Key.Key_Down, Qt.Key.Key_Up):
                n = self.list.count()
                if n:
                    self.list.setCurrentRow((self.list.currentRow() + (1 if k == Qt.Key.Key_Down else -1)) % n)
                return True
            if k in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
                if self.list.currentItem():
                    self.run(self.list.currentItem())
                return True
        return super().eventFilter(obj, ev)

    def refresh(self):
        text = self.input.text().strip()
        kind = None
        if text.startswith("@"):
            kind, text = "tab", text[1:].strip()
        q = text.lower()
        rows = []
        if text and not kind:
            rows.append(("go", f'Search or open "{text}"', "", lambda t=text: self.go(t)))
        for e in self.entries:
            if (kind is None or e[0] == kind) and q in f"{e[1]} {e[2]}".lower():
                rows.append(e)
            if len(rows) >= 40:
                break
        self.list.clear()
        for _k, label, detail, fn in rows:
            it = QListWidgetItem(f"{label}  ({detail})" if _k == "action" else f"{label}\n{detail}" if detail else label)
            it.setData(FN, fn)
            self.list.addItem(it)
        if rows:
            self.list.setCurrentRow(0)
        self.list.setFixedHeight(sum(self.list.sizeHintForRow(i) for i in range(min(len(rows), 8))) + 8 if rows else 0)
        self.adjustSize()

    def run(self, item):
        fn = item.data(FN)
        self.accept()
        fn()

    def popup(self):
        p = self.parent()
        self.move(p.mapToGlobal(QPoint((p.width() - self.width()) // 2, 70)))
        self.input.setFocus()
        self.show()
