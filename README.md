# Vexora (Python / PySide6)

Real Chromium engine (Qt WebEngine) driven from Python. No Node.js.

## Features
Custom title bar with tabs, left icon rail, themes (6 built-in + custom), new tab page (clock, greeting, search, shortcuts,
recently visited, bookmark folders, quick notes, weather, wallpaper), bookmarks, history, downloads, command palette (Ctrl+K),
find in page, private tabs, tracker blocking, backup, small updates.

## Tests (headless, no display needed)
    python tests/test_phase1.py     # theme engine and Appearance settings
    python tests/test_ui.py         # new tab page, internal API security, shell

## Run from source
    pip install -r requirements.txt
    python main.py

## Release (private source repo -> public installer repo)
1. `RELEASES_REPO` at the top of `.github/workflows/release.yml` must be `YOU/vexora-releases`.
2. Actions secret `RELEASES_TOKEN` = fine-grained token with Contents: read and write on the releases repo only.
3. Commit and push, THEN tag with a number higher than every existing tag:
       git tag v2.2.0 && git push origin v2.2.0
4. The Action builds the app, trims unused Qt, builds the installer and a small patch, and publishes
   Vexora-Setup.exe, Vexora-Patch.zip and update.json.

## How updates work
- Same Qt/Chromium as the installed copy: downloads Vexora-Patch.zip (about 2 MB), swaps Vexora.exe and the data
  files, restarts. A few seconds.
- Qt/Chromium or a new native dependency changed: downloads the full installer and runs it silently.
- The app decides by comparing base_id.txt (a fingerprint of the heavy files) with update.json.

Never put a GitHub token inside the app: anything shipped in the exe can be extracted.
