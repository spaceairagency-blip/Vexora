"""Update checker.

Small update  (about 2 MB, a few seconds): replaces Vexora.exe and the data files in place.
Full update   (installer, only when Qt/Chromium itself changed): runs Vexora-Setup.exe silently.
"""
import hashlib, json, os, re, subprocess, sys, tempfile, threading, urllib.request, zipfile
from pathlib import Path

from PySide6.QtCore import QObject, Signal
from version import REPO, VERSION

HEAD = {"User-Agent": "Vexora-Updater", "Accept": "application/vnd.github+json"}
SETUP, SUM, PATCH, MANIFEST = "Vexora-Setup.exe", "Vexora-Setup.exe.sha256", "Vexora-Patch.zip", "update.json"
BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))
FROZEN = bool(getattr(sys, "frozen", False))
APP_DIR = Path(sys.executable).parent if FROZEN else None


def parse(v):
    return tuple(int(x) for x in re.findall(r"\d+", v)[:3])


def fetch(url, timeout=20):
    return urllib.request.urlopen(urllib.request.Request(url, headers=HEAD), timeout=timeout)


def local_base():
    try:
        return (BASE / "base_id.txt").read_text().strip()
    except OSError:
        return ""


def writable(d):
    try:
        with tempfile.TemporaryFile(dir=d):
            return True
    except OSError:
        return False


class Updater(QObject):
    available = Signal(str)
    uptodate = Signal()
    check_failed = Signal(str)
    progress = Signal(int)
    status = Signal(str)
    failed = Signal(str)
    done = Signal()

    def check(self, manual=False):
        threading.Thread(target=self._check, args=(manual,), daemon=True).start()

    def _check(self, manual=False):
        if REPO.startswith("OWNER/"):
            if manual:
                self.check_failed.emit("This build has no update source configured.")
            return
        try:
            rel = json.load(fetch(f"https://api.github.com/repos/{REPO}/releases/latest"))
            ver = rel["tag_name"].lstrip("v")
            assets = {a["name"]: a["browser_download_url"] for a in rel["assets"]}
            if parse(ver) <= parse(VERSION):
                if manual:
                    self.uptodate.emit()
                return
            plan = None
            if MANIFEST in assets:
                man = json.load(fetch(assets[MANIFEST]))
                if FROZEN and PATCH in assets and man.get("base") and man["base"] == local_base() and writable(APP_DIR):
                    plan = ("patch", assets[PATCH], man["patch_sha256"])
                elif SETUP in assets and man.get("setup_sha256"):
                    plan = ("full", assets[SETUP], man["setup_sha256"])
            elif SETUP in assets and SUM in assets:                      # releases made before small updates
                plan = ("full", assets[SETUP], fetch(assets[SUM]).read().decode().split()[0].lower())
            if plan:
                self.ver, self.plan = ver, plan
                self.available.emit(ver)
        except Exception:
            if manual:
                self.check_failed.emit("Could not reach the update server.")

    def install(self):
        threading.Thread(target=self._install, daemon=True).start()

    def _download(self, url, want, dest):
        h = hashlib.sha256()
        with fetch(url, 60) as r, open(dest, "wb") as f:
            total, got, last = int(r.headers.get("Content-Length") or 0), 0, -1
            while chunk := r.read(1 << 18):
                f.write(chunk); h.update(chunk); got += len(chunk)
                if total and got * 100 // total != last:
                    last = got * 100 // total
                    self.progress.emit(last)
        if h.hexdigest() != want.lower():
            os.remove(dest)
            raise RuntimeError("download is corrupted (checksum mismatch)")

    def _install(self):
        try:
            mode, url, want = self.plan
            tmp = Path(tempfile.mkdtemp(prefix="vexora-update-"))
            if mode == "full":
                dest = tmp / SETUP
                self._download(url, want, dest)
                self.status.emit("Installing…")
                subprocess.Popen([str(dest), "/SILENT", "/SP-", "/NORESTART", "/CLOSEAPPLICATIONS"], close_fds=True)
            else:
                dest = tmp / PATCH
                self._download(url, want, dest)
                stage = tmp / "stage"
                with zipfile.ZipFile(dest) as z:
                    for name in z.namelist():                            # refuse paths that escape the folder
                        if not (stage / name).resolve().is_relative_to(stage.resolve()):
                            raise RuntimeError("update archive is invalid")
                    z.extractall(stage)
                self.status.emit("Restarting…")
                script = tmp / "apply.cmd"
                script.write_text(
                    "@echo off\r\n"
                    f'set "SRC={stage}"\r\nset "DST={APP_DIR}"\r\n'
                    "set N=0\r\n:retry\r\n"
                    'copy /y "%SRC%\\Vexora.exe" "%DST%\\Vexora.exe" >nul 2>&1 && goto copied\r\n'
                    "set /a N+=1\r\nif %N% GEQ 40 goto launch\r\nping -n 2 127.0.0.1 >nul\r\ngoto retry\r\n"
                    ':copied\r\nxcopy "%SRC%\\_internal" "%DST%\\_internal\\" /e /y /q >nul\r\n'
                    ':launch\r\nstart "" "%DST%\\Vexora.exe"\r\n')
                flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)
                subprocess.Popen(["cmd", "/c", str(script)], creationflags=flags, close_fds=True)
            self.done.emit()
        except Exception as e:
            self.failed.emit(str(e))
