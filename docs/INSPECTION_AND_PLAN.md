# Vexora: inspection and implementation plan

## What exists (v2.0.0)
Engine: Qt WebEngine (Chromium) through PySide6, Qt Widgets shell. No Node.
Working: tabs, private tabs (off-the-record profile), back/forward/reload, address bar with URL/search resolution,
bookmarks bar + sidebar (flat list), history (5000 entries), downloads list, find in page, Ctrl+K palette
(actions/tabs/bookmarks/history), zoom, devtools, fullscreen, session restore, tracker blocking (79 domains, real counter),
force-dark pages, JSON backup/restore, auto-updater, installer, release workflow...

## Known problems found
1. Every web permission (camera, mic, location, notifications, clipboard) is silently denied; there is no way to grant one.
2. Session save/restore: `active` index counts private tabs but the saved URL list does not (off-by-one after restart with private tabs open).
3. Ctrl+Shift+N opens a private *tab*; the spec asks for a private *window*.
4. Downloads: no pause/resume/cancel, no history after restart.
5. Bookmarks: flat only (no folders, no duplicate detection beyond identical URL).
6. Qt >= 6.8 is needed for the permission API (`QWebEnginePermission`); requirements.txt says >= 6.7.

## Engine capabilities for the storage-permission system (probed on PySide6 6.12)
| Storage | What Qt WebEngine allows | Plan |
|---|---|---|
| Cookies | Real: `cookieStore.setCookieFilter` sees every cookie read/write with origin + third-party flag. Runs synchronously on the IO thread, so it cannot wait for a dialog. | Decide from a per-site policy cache; unknown site = block until the user answers, then reload. Real enforcement. |
| localStorage | Coarse on/off: `LocalStorageEnabled` per page. No per-write hook. | Set per site before load from the policy. Real, but all-or-nothing per site. |
| sessionStorage, IndexedDB, Cache Storage, Service Workers | No Qt API to intercept. | Injected document-start script gates `indexedDB.open`, `caches.open`, `serviceWorker.register`. This is best-effort: a hostile page can reach them from a worker/iframe context the script does not cover. Will be documented in the UI, not hidden. |
| Camera/mic/location/notifications/clipboard | Real: `permissionRequested`, `QWebEnginePermission`, `persistentPermissionsPolicy`, `listAllPermissions`. | Full support. |
"Clear on exit" and per-site deletion: cookies via cookie store; other storage by clearing the profile's storage path at the next start (before the profile opens).

## Phases (each must pass its tests before the next starts)
- Phase 1 UI/theme/animation/toolbar/new tab/settings: **step 1 done** (token theme engine + Appearance page, 29 automated checks).
  Remaining: animations (tabs, menus, dialogs), toolbar customization, new tab widgets, settings dashboard (18 categories + search).
- Phase 2 storage permissions, privacy dashboard, permission prompts.
- Phase 3 tab groups/vertical/sleeping tabs, split-screen, workspaces, sidebar, command center upgrades.
- Phase 4 toolbox, download manager, bookmark manager.
- Phase 5 AI assistant (key in OS keychain via `keyring`, never in the app), performance.
- Phase 6 tests, security review, polish.

## Not claimed as done
Everything not listed as done above. Nothing in the UI advertises a feature that is not implemented.
