"""Checks the public releases repo for a newer installer, verifies it, runs it silently."""
import hashlib, json, os, re, subprocess, tempfile, threading, urllib.request
from PySide6.QtCore import QObject, Signal
from version import VERSION, REPO

HEAD = {"User-Agent": "Vexora-Updater", "Accept": "application/vnd.github+json"}
SETUP, SUM = "Vexora-Setup.exe", "Vexora-Setup.exe.sha256"


def parse(v):
    return tuple(int(x) for x in re.findall(r"\d+", v)[:3])


def fetch(url, timeout=20):
    return urllib.request.urlopen(urllib.request.Request(url, headers=HEAD), timeout=timeout)


class Updater(QObject):
    available = Signal(str)
    progress = Signal(int)
    failed = Signal(str)
    done = Signal()

    def check(self):
        threading.Thread(target=self._check, daemon=True).start()

    def _check(self):
        if REPO.startswith("OWNER/"):
            return
        try:
            rel = json.load(fetch(f"https://api.github.com/repos/{REPO}/releases/latest"))
            ver = rel["tag_name"].lstrip("v")
            assets = {a["name"]: a["browser_download_url"] for a in rel["assets"]}
            if parse(ver) > parse(VERSION) and SETUP in assets and SUM in assets:
                self.ver, self.url, self.sum_url = ver, assets[SETUP], assets[SUM]
                self.available.emit(ver)
        except Exception:
            pass  # offline or rate-limited: try again later

    def install(self):
        threading.Thread(target=self._install, daemon=True).start()

    def _install(self):
        try:
            dest = os.path.join(tempfile.gettempdir(), f"Vexora-Setup-{self.ver}.exe")
            h = hashlib.sha256()
            with fetch(self.url, 60) as r, open(dest, "wb") as f:
                total, got = int(r.headers.get("Content-Length") or 0), 0
                while chunk := r.read(1 << 16):
                    f.write(chunk); h.update(chunk); got += len(chunk)
                    if total:
                        self.progress.emit(got * 100 // total)
            want = fetch(self.sum_url).read().decode().split()[0].lower()
            if want != h.hexdigest():
                os.remove(dest)
                raise RuntimeError("download is corrupted (checksum mismatch)")
            subprocess.Popen([dest, "/SILENT", "/SP-", "/NORESTART", "/CLOSEAPPLICATIONS"], close_fds=True)
            self.done.emit()
        except Exception as e:
            self.failed.emit(str(e))
