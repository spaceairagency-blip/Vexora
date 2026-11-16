"""Left panel: bookmarks, history, downloads."""
from datetime import date, datetime, timedelta
from pathlib import Path

from PySide6.QtCore import Qt, QUrl, Signal
from PySide6.QtGui import QBrush, QColor, QDesktopServices, QGuiApplication
from PySide6.QtWebEngineCore import QWebEngineDownloadRequest
from PySide6.QtWidgets import (QButtonGroup, QHBoxLayout, QLineEdit, QListWidget, QListWidgetItem, QMenu,
                               QMessageBox, QPushButton, QStackedWidget, QVBoxLayout, QWidget)

URL = Qt.ItemDataRole.UserRole


class Page(QWidget):
    openUrl = Signal(str, bool)

    def __init__(self, placeholder):
        super().__init__()
        v = QVBoxLayout(self)
        v.setContentsMargins(0, 8, 0, 8)
        v.setSpacing(6)
        self.search = QLineEdit(placeholderText=placeholder)
        self.search.setObjectName("sbsearch")
        self.list = QListWidget()
        self.list.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        v.addWidget(self.search)
        v.addWidget(self.list, 1)
        self.body = v

    def menu(self, pos, remover=None):
        it = self.list.itemAt(pos)
        if not it or not it.data(URL):
            return
        url, m = it.data(URL), QMenu(self)
        m.addAction("Open in new tab", lambda: self.openUrl.emit(url, True))
        m.addAction("Copy address", lambda: QGuiApplication.clipboard().setText(url))
        if remover:
            m.addSeparator()
            m.addAction("Remove", lambda: remover(url))
        m.exec(self.list.viewport().mapToGlobal(pos))


class Bookmarks(Page):
    def __init__(self, store):
        super().__init__("Search bookmarks")
        self.store = store
        self.search.textChanged.connect(self.refresh)
        self.list.itemClicked.connect(lambda i: self.openUrl.emit(i.data(URL), False))
        self.list.customContextMenuRequested.connect(lambda p: self.menu(p, self.remove))

    def remove(self, url):
        self.store.remove_bookmark(url)
        self.refresh()
        self.changed()

    changed = lambda self: None  # replaced by the browser

    def refresh(self):
        q = self.search.text().lower()
        self.list.clear()
        for b in self.store.bookmarks:
            if q in (b["title"] + b["url"]).lower():
                it = QListWidgetItem(f'{b["title"]}\n{b["url"]}')
                it.setData(URL, b["url"])
                self.list.addItem(it)


class History(Page):
    def __init__(self, store):
        super().__init__("Search history")
        self.store = store
        self.search.textChanged.connect(self.refresh)
        self.list.itemClicked.connect(lambda i: i.data(URL) and self.openUrl.emit(i.data(URL), False))
        self.list.customContextMenuRequested.connect(lambda p: self.menu(p, self.remove))
        clear = QPushButton("Clear history")
        clear.setObjectName("ghost")
        clear.clicked.connect(self.clear)
        self.body.addWidget(clear, 0, Qt.AlignmentFlag.AlignLeft)

    def remove(self, url):
        self.store.remove_history(url)
        self.refresh()

    def clear(self):
        if QMessageBox.question(self, "Clear history", "Delete all browsing history?") == QMessageBox.StandardButton.Yes:
            self.store.clear_history()
            self.refresh()

    def refresh(self):
        q, today, last, shown = self.search.text().lower(), date.today(), None, 0
        self.list.clear()
        for h in reversed(self.store.history):
            if q and q not in (h["title"] + h["url"]).lower():
                continue
            d = datetime.fromtimestamp(h["t"]).date()
            if d != last:
                last = d
                label = "Today" if d == today else "Yesterday" if d == today - timedelta(1) else d.strftime("%A, %d %B %Y")
                head = QListWidgetItem(label)
                head.setFlags(Qt.ItemFlag.NoItemFlags)
                head.setForeground(QBrush(QColor("#8a8a93")))
                self.list.addItem(head)
            it = QListWidgetItem(f'{h["title"]}\n{h["url"]}')
            it.setData(URL, h["url"])
            self.list.addItem(it)
            shown += 1
            if shown >= 400:
                break


class Downloads(Page):
    def __init__(self):
        super().__init__("")
        self.search.hide()
        self.list.itemClicked.connect(self.open_file)
        self.list.customContextMenuRequested.connect(self.menu_file)

    def open_file(self, it):
        p = it.data(URL)
        if p and it.text().endswith("Done") and Path(p).exists():
            QDesktopServices.openUrl(QUrl.fromLocalFile(p))

    def menu_file(self, pos):
        it = self.list.itemAt(pos)
        if it and it.data(URL):
            m = QMenu(self)
            m.addAction("Show in folder", lambda: QDesktopServices.openUrl(QUrl.fromLocalFile(str(Path(it.data(URL)).parent))))
            m.exec(self.list.viewport().mapToGlobal(pos))

    def add(self, dl):
        name = dl.downloadFileName()
        it = QListWidgetItem()
        it.setData(URL, str(Path(dl.downloadDirectory()) / name))
        self.list.insertItem(0, it)
        S = QWebEngineDownloadRequest.DownloadState

        def update(*_):
            try:
                st = dl.state()
                if st == S.DownloadCompleted:
                    status = "Done"
                elif st == S.DownloadCancelled:
                    status = "Cancelled"
                elif st == S.DownloadInterrupted:
                    status = "Failed"
                else:
                    tot = dl.totalBytes()
                    status = f"{dl.receivedBytes() * 100 // tot}%" if tot > 0 else f"{dl.receivedBytes() // 1024} KB"
                it.setText(f"{name}\n{status}")
            except RuntimeError:
                pass

        dl.receivedBytesChanged.connect(update)
        dl.stateChanged.connect(update)
        update()


class Sidebar(QWidget):
    openUrl = Signal(str, bool)

    def __init__(self, store):
        super().__init__()
        self.setObjectName("sidebar")
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        self.setFixedWidth(300)
        v = QVBoxLayout(self)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(0)
        head = QHBoxLayout()
        head.setContentsMargins(6, 6, 6, 0)
        head.setSpacing(0)
        self.stack = QStackedWidget()
        self.bookmarks, self.history, self.downloads = Bookmarks(store), History(store), Downloads()
        self.group = QButtonGroup(self)
        for i, (name, page) in enumerate((("Bookmarks", self.bookmarks), ("History", self.history), ("Downloads", self.downloads))):
            b = QPushButton(name)
            b.setObjectName("sbtab")
            b.setCheckable(True)
            self.group.addButton(b, i)
            head.addWidget(b)
            self.stack.addWidget(page)
            page.openUrl.connect(self.openUrl)
        self.group.idClicked.connect(self.show_page)
        self.group.button(0).setChecked(True)
        head.addStretch()
        v.addLayout(head)
        v.addWidget(self.stack, 1)

    def show_page(self, i):
        self.stack.setCurrentIndex(i)
        self.group.button(i).setChecked(True)
        self.refresh()

    def refresh(self):
        self.bookmarks.refresh()
        self.history.refresh()
