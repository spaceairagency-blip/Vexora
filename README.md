# Vexora (Python / PySide6)

Real Chromium engine (Qt WebEngine) driven from Python. No Node.js.

## Run from source
    pip install -r requirements.txt
    python main.py

## Release flow (private source repo -> public installer repo)
1. Create a PUBLIC repo that holds installers only, e.g. `vexora-releases` (no source in it).
2. Edit `RELEASES_REPO` at the top of `.github/workflows/release.yml` to `YOU/vexora-releases`.
3. Create a fine-grained token: only the releases repo, permission "Contents: read and write".
   Add it to the PRIVATE repo as an Actions secret named `RELEASES_TOKEN`.
4. In Codespaces, when you are done editing:  `./release.sh 2.0.1`
5. GitHub Actions (Windows runner) builds with PyInstaller + Inno Setup and publishes
   `Vexora-Setup.exe` + its `.sha256` to the releases repo.
6. Running copies check every 6 hours (and at launch), show an "Update now" bar, download,
   verify the checksum, run the installer silently and relaunch.

Never put a GitHub token inside the app: anything shipped in the exe can be extracted.
