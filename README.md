# RootFree — shared family tree

A family tree app for one family, shared by everyone who has the link. It started as a fork of [Mip555/root-free](https://github.com/Mip555/root-free), a single-file, browser-only tree builder. This version keeps the tree on a small Node.js server in SQLite, so the whole family sees and edits the same tree from any device, including phones.

![RootFree](screenshot.png)

## Features

**Building the tree**
- People with name, photo, birth and death years, birthplace, occupation and notes
- Parent, child, partner and sibling connections
- Drag cards freely, or arrange them by generation or in a grid with one click
- GEDCOM 5.5.1 import and export, JSON backup and restore. Export keeps every link: children of a single parent, and each marriage's own children

**Generation layout**
- Partners stand side by side and each family's children stay together under their parents
- Generations are worked out per couple, so lines never skip a row or run behind cards
- Remarriages: numbered marriages ("1. evlilik", "2. evlilik"), each marriage's children drawn from their own couple, a bridge over the row for a third spouse, and a half-sibling badge ("baba bir kardeş" / "anne bir kardeş")

**Adding relatives**
- "+" on any card (or "+ Relative" in a person's details) adds a father, mother, spouse, son, daughter, brother or sister and makes the connections at once
- Several children or siblings in one go ("Hasan, Yusuf, Seher"); for someone married more than once it asks which marriage

**Closing branches**
- "▾" under a parent's card hides everyone below them, and the people who married into those families; the card then shows "▸ 36" and opens it again. The rest of the tree closes up, for viewing only: the saved positions do not change.
- Closing one spouse of someone married twice hides only that marriage's children.
- Each device remembers its own closed branches; "Show all" opens everything.

**Finding someone**
- The search box (top left; 🔍 on phones; "/" jumps to it) finds people as you type. Turkish letters and case do not matter ("baspehlivan" finds "BAŞPEHLİVAN"), and each result shows years, place and parents, so people with the same name can be told apart.
- Picking someone scrolls the tree to their card and lights it up, opening a closed branch if they are in one.

**Moving around**
- Drag empty space to pan
- Pinch, or Ctrl/⌘ + scroll, to zoom around the pointer; two-finger pinch on phones
- Tree, Generations and People views
- Works on phones: the header buttons fold into a ☰ menu and dialogs open from the bottom

**Languages**
- Turkish and English. A Turkish browser gets Turkish; the language button in the header switches and is remembered. Texts live in `web/src/i18n.ts`.

**Shared data**
- The tree lives on the server. Every change is saved straight away, and only the changed fields are sent, so two people editing different things never overwrite each other.
- Changes made by others arrive by themselves: an open page checks every 15 seconds (and when you come back to the tab) and takes the new tree when nothing here is unsaved and no dialog is open.

> **No login.** Anyone with the link can view and change the tree. Keep the link within the family. Search engines are asked not to list the site (`robots.txt`, a `noindex` tag and header).

## Running locally

Requires Node.js 22.18 or newer (Node runs the server's TypeScript directly).

```bash
npm install
npm run dev        # server on :8737 + Vite dev server; open the URL Vite prints
```

The database is created at `data/rootfree.db`.

```bash
npm test           # server tests
npm run typecheck  # TypeScript, browser app and server
npm run build      # builds the browser app into dist/
npm start          # serves dist/ and the API on :3000
```

## Deploying

The `Dockerfile` builds the app and runs the server on port 3000. Mount a persistent volume at `/data`, which is where the SQLite database lives.

```bash
docker build -t rootfree .
docker run -p 3000:3000 -v rootfree-data:/data rootfree
```

| Variable | Default | |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `data/rootfree.db` (`/data/rootfree.db` in Docker) | SQLite database file |
| `PUBLIC_DIR` | `dist` | Built browser app |

## How it is put together

```
web/            browser app (TypeScript, built with Vite)
  index.html
  src/main.ts        entry point; buttons use data-action, one click handler
  src/sync.ts        loads the tree from the server, sends only what changed
  src/layout.ts      generation layout and marriage numbering
  src/connectors.ts  the lines between cards
  src/…              tree view, zoom/pan, dialogs, GEDCOM, views
server/         Node.js server (TypeScript, run directly by Node)
  server.ts          static files + API
  db.ts              SQLite schema, validation, changes
test/           server tests (node:test)
```

API:

| | |
|---|---|
| `GET /api/tree` | `{ people: { id: {...} }, relationships: [{ a, b, type }] }`, relationships in the order they were added; with an ETag (304 when unchanged) |
| `POST /api/changes` | `{ people: { upsert: [...], delete: [...] }, relationships: { add: [...], delete: [...] } }`, applied atomically |
| `GET /api/health` | `{ ok: true }` |

The family's data never goes into this repository: `*.ged` and `*.db` files are git-ignored.

## License

MIT, like the original project.
