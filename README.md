# Duel Links Combo Maker

A browser-local editor for documenting Yu-Gi-Oh! Duel Links Speed Duel combos. Set up a starting hand and board, record each action, then review, replay and export the combo as a PNG guide, text or a JSON backup. Card effects are documented manually; the app does not verify game legality.

## Features

- Search and filter the Duel Links card catalog, and drag or tap cards onto a Speed Duel field.
- **Setup** edits the starting board. **Record** turns each move into a typed step through an action menu, with atomic summons, Xyz materials and grouped effects. **Replay** steps through the combo without changing it.
- A timeline with editable descriptions and notes, insertion, reordering, deletion, repair of steps that no longer apply, playback at 0.5–2× and full undo/redo.
- Character (free text) and Skill selection from a bundled Skill snapshot or a custom Skill. A combo keeps the Skill text it was written with.
- Exports: vertical or endboard-only PNG guides with a preview (long combos split into numbered images), plain or Discord-formatted text with copy, and versioned JSON backups.
- Saves, an autosaved draft and recovery stay in this browser through IndexedDB. Nothing is uploaded. Export JSON backups for combos you want to keep.
- YDK deck import, optional deck-aware recording, and non-blocking deck warnings. Duel Links limits that are not officially confirmed are labelled provisional.

## Development

```sh
npm ci
npm run dev
```

Use Node 24. Open the local address printed by Vite. Use `npm run build` to create the static build in `dist/` and `npm run preview` to serve it locally. The app and catalog use relative asset paths for project-subpath hosting.

`npm run typecheck` and `npm run lint` check the source. `npm run test` runs the manual unit suite. `npm run format` applies the source formatter.

## Configuration

[app.config.json](app.config.json) holds every path and data source used by the app and the Vite build, plus the source locations used by local data tools:

| Key         | Meaning                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| `base`      | Deployed base URL. `./` works locally and under a GitHub Pages project subpath.                           |
| `publicDir` | Folder of static files copied into the build.                                                             |
| `served.*`  | Catalog, image manifest, card image folder and Skill list, relative to `publicDir` and the deployed base. |
| `local.*`   | Repository-relative files for local data tools that stay out of Git.                                      |
| `sources.*` | YGOPRODeck card API, image server and attribution link.                                                   |

Paths must be relative and stay inside the project. The app and Vite validate the file on load and reject absolute or `..` paths.

## Card data and images

Card data comes from the approximate Duel Links filter of [YGOPRODeck](https://ygoprodeck.com/api-guide/). Card faces use same-origin card images from the configured image folder when present. Card images are not included in the repository, so each card otherwise shows a text face. Card images are copyrighted by their rights holders.

The Skill list in `public/data/skills.json` is a dated Duel Links Meta snapshot. Its coverage and Speed/Rush split are unverified, and it has no character data.
