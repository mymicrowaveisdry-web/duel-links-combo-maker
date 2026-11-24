# Duel Links Combo Maker

A browser-local editor for preparing Yu-Gi-Oh! Duel Links Speed Duel boards. The current milestone covers searching, filtering and inspecting cards, configuring the opening hand and both players’ fields, and moving cards between zones by drag or keyboard-accessible controls.

## Development

```sh
npm ci
npm run dev
```

Use Node 24. Open the local address printed by Vite. Use `npm run build` to create the static build in `dist/` and `npm run preview` to serve it locally. The app and catalog use relative asset paths for project-subpath hosting.

`npm run typecheck` and `npm run lint` check the source. `npm run test` runs the manual unit suite. `npm run format` applies the source formatter.

## Configuration

[app.config.json](app.config.json) holds every path and data source used by the app and the Vite build, plus the source locations used by local data tools:

| Key         | Meaning                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------- |
| `base`      | Deployed base URL. `./` works locally and under a GitHub Pages project subpath.               |
| `publicDir` | Folder of static files copied into the build.                                                 |
| `served.*`  | Catalog, image manifest and card image folder, relative to `publicDir` and the deployed base. |
| `local.*`   | Repository-relative files for local data tools that stay out of Git.                          |
| `sources.*` | YGOPRODeck card API, image server and attribution link.                                       |

Paths must be relative and stay inside the project. The app and Vite validate the file on load and reject absolute or `..` paths.

## Card data and images

Card data comes from the approximate Duel Links filter of [YGOPRODeck](https://ygoprodeck.com/api-guide/). Card faces use same-origin card images from the configured image folder when present. Card images are not included in the repository, so each card otherwise shows a text face. Card images are copyrighted by their rights holders.

Setup lives in the open tab. The action recorder, timeline, replay, save and export features are upcoming.
