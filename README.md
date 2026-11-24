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

`npm run typecheck` and `npm run lint` check the source. `npm run format` applies the source formatter.

## Testing

```sh
npm run test        # unit and store tests (Vitest)
npm run test:e2e    # end-to-end scenarios (Playwright)
```

`npm run test:watch` and `npm run test:coverage` are also available. The end-to-end suite builds the app, serves the production build under the test subpath in [app.config.json](app.config.json) (`testing.subpath`), and runs the guide's workflow scenarios. These cover a basic combo with TXT and PNG export, a Skill combo, undo and redo, keyboard-only placement, local saves and recovery, JSON round trips and rejection, an Xyz Summon with materials, missing artwork, timeline repair and insertion, an 80-step combo, and a tap-only phone flow.

Install a Playwright browser once with `npx playwright install chromium`, or set `PLAYWRIGHT_CHANNEL=msedge` (or `chrome`) to use an installed browser. Tests use their own browser profile and never touch your saved combos.

## Deployment

The build in `dist/` is static and uses relative paths, so it works from any GitHub Pages project path. [CI](.github/workflows/ci.yml) runs lint, typecheck, unit tests, the build and the end-to-end suite on pull requests and pushes to `main`. [Deploy](.github/workflows/deploy.yml) runs the same checks on `main` and publishes to GitHub Pages only if they pass. To enable it, open **Settings → Pages** and set **Source** to **GitHub Actions**. Card images are not in the repository, so the published site shows text card faces.

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
