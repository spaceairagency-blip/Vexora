"""Build helpers used by the release workflow.

  prune     <app_dir>            delete Qt parts Vexora never uses (smaller, faster to install)
  baseid    <app_dir>            write _internal/base_id.txt (identifies the heavy, rarely-changing part)
  manifest  <app_dir> <out_dir>  build Vexora-Patch.zip + update.json next to the installer
"""
import hashlib, json, sys, zipfile
from pathlib import Path

UNUSED = ("qt3d", "qt63d", "qtcharts", "qt6charts", "qtdatavisualization", "qt6datavisualization", "qtgraphs", "qt6graphs",
          "qtquick3d", "qt6quick3d", "qtlocation", "qt6location", "qtsensors", "qt6sensors", "qtserialport", "qt6serialport",
          "qtserialbus", "qt6serialbus", "qtbluetooth", "qt6bluetooth", "qtnfc", "qt6nfc", "qtremoteobjects", "qt6remoteobjects",
          "qtscxml", "qt6scxml", "qtstatemachine", "qt6statemachine", "qtspatialaudio", "qt6spatialaudio", "qttest", "qt6test",
          "qtdesigner", "qt6designer", "qthelp", "qt6help", "qtlottie", "qt6lottie", "qthttpserver", "qt6httpserver",
          "qtvirtualkeyboard", "qt6virtualkeyboard", "qtquicktimeline", "qt6quicktimeline", "qtquickeffects", "qtgrpc", "qt6grpc",
          "qtprotobuf", "qt6protobuf", "qtnetworkauth", "qt6networkauth")
# data shipped in the small patch (everything else is the heavy "base")
DATA = {"newtab.html", "resolve.js", "trackers.json", "base_id.txt"}


def internal(app):
    return Path(app) / "_internal"


def mb(app):
    return sum(f.stat().st_size for f in Path(app).rglob("*") if f.is_file()) / 1048576


def prune(app):
    before, root = mb(app), internal(app)
    for f in list(root.rglob("*")):
        if f.is_file() and any(f.name.lower().removeprefix("lib").startswith(u) for u in UNUSED):
            f.unlink()
    for d in root.rglob("qml"):                                    # QML modules: widgets app doesn't use them
        if d.is_dir() and d.parent.name in ("PySide6", "Qt"):
            for f in sorted(d.rglob("*"), reverse=True):
                f.unlink() if f.is_file() else f.rmdir()
            d.rmdir()
    for f in root.rglob("*.qm"):
        f.unlink()
    for loc in root.rglob("qtwebengine_locales"):                  # keep US English only
        for f in loc.glob("*.pak"):
            if f.name != "en-US.pak":
                f.unlink()
    print(f"pruned: {before:.0f} MB -> {mb(app):.0f} MB")


def base_files(app):
    root = internal(app)
    return [f for f in sorted(root.rglob("*"))
            if f.is_file() and f.name not in DATA and "assets" not in f.relative_to(root).parts]


def baseid(app):
    h = hashlib.sha256()
    for f in base_files(app):
        h.update(f"{f.relative_to(internal(app)).as_posix()}:{f.stat().st_size}\n".encode())
    bid = h.hexdigest()[:16]
    (internal(app) / "base_id.txt").write_text(bid)
    print("base id", bid)


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def manifest(app, out):
    app, out, root = Path(app), Path(out), internal(app)
    exe = next(app.glob("Vexora*")) if not (app / "Vexora.exe").exists() else app / "Vexora.exe"
    patch = out / "Vexora-Patch.zip"
    with zipfile.ZipFile(patch, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.write(exe, exe.name)
        for f in root.rglob("*"):
            if f.is_file() and (f.name in DATA or "assets" in f.relative_to(root).parts):
                z.write(f, "_internal/" + f.relative_to(root).as_posix())
    setup = out / "Vexora-Setup.exe"
    info = {"base": (root / "base_id.txt").read_text().strip(), "patch": patch.name, "patch_sha256": sha(patch),
            "setup": setup.name, "setup_sha256": sha(setup) if setup.exists() else ""}
    (out / "update.json").write_text(json.dumps(info, indent=2))
    print(info, f"patch = {patch.stat().st_size / 1048576:.1f} MB")


if __name__ == "__main__":
    {"prune": lambda: prune(sys.argv[2]), "baseid": lambda: baseid(sys.argv[2]),
     "manifest": lambda: manifest(sys.argv[2], sys.argv[3])}[sys.argv[1]]()
