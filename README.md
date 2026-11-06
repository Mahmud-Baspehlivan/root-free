# RootFree

A free, private family tree builder that runs entirely in your browser.

No account. No subscription. No server. Your family's history stays on your device.

**Live app → [mip555.github.io/root-free](https://mip555.github.io/root-free)**

![RootFree](screenshot.png)

---

## The problem with existing tools

Ancestry, MyHeritage, and similar services charge monthly fees, lock your data in proprietary formats, and make their business by owning access to your family's history. When you stop paying, you lose access.

RootFree works the other way around. Everything runs in your browser. Nothing is sent anywhere. You own the data completely, and you can delete it all in one click.

---

## Features

**Building your tree**
- Add people with name, photo, birth and death years, birthplace, occupation, and notes
- Connect people as parent, child, partner, or sibling — connections can be removed individually from each person's detail view
- Drag and reposition cards freely on an infinite canvas
- Auto-arrange by generation or grid with one click — the generation layout keeps partners side by side and each family's children together under their parents
- Remarriages are shown clearly: numbered marriages ("Marriage 1", "Marriage 2"), each marriage's children drawn from their own couple, and half-siblings marked on their cards

**Viewing your tree**
- Tree view — freeform canvas with relationship lines
- Generations view — automatically groups family by generation, from great-grandparents down to grandchildren
- People view — alphabetical table of everyone in the tree

**Sharing**
- Share a live link with family members — changes sync peer-to-peer in real time
- Choose edit or view-only access when sharing
- No server involved — data travels directly between browsers
- Session ends when everyone closes the tab

**Data portability**
- Import GEDCOM files from Ancestry, MyHeritage, FamilySearch, and any compatible app
- Export to GEDCOM 5.5.1 — the universal genealogy standard
- Backup and restore as JSON
- One-click permanent delete

---

## Privacy

**Solo mode** — all data is stored in your browser's `localStorage`. Nothing is sent to any server, ever. Clearing your browser storage erases your tree, so export a backup regularly.

**Shared mode** — when you share a tree, data travels directly between browsers using WebRTC peer-to-peer. The signalling server (PeerJS) facilitates the connection but never sees your family data. When the session ends, nothing persists anywhere outside the participants' browsers.

There is no analytics, no tracking, and no backend. The entire product is a single HTML file.

---

## Getting started

### Use it in the browser

Open [mip555.github.io/root-free](https://mip555.github.io/root-free) — no install needed.

### Run it locally

Download `index.html` and open it directly in any modern browser. No server, no build step, no dependencies.

```bash
git clone https://github.com/Mip555/root-free.git
cd root-free
open index.html      # macOS
xdg-open index.html  # Linux
start index.html     # Windows
```

### Self-host

Upload `index.html` to any static host — GitHub Pages, Netlify, Vercel, or your own server. No backend required.

---

## GEDCOM

[GEDCOM](https://en.wikipedia.org/wiki/GEDCOM) is the standard interchange format for genealogical data, supported by virtually every family tree platform.

RootFree imports and exports GEDCOM 5.5.1, including names, birth and death years, birthplaces, occupations, genders, notes, and family relationships.

**Import from:** Ancestry, MyHeritage, FamilySearch, MacFamilyTree, Gramps, Legacy Family Tree, and any app that exports `.ged` files.

**Export to:** Any of the above. Your data is never trapped.

---

## Roadmap

Contributions welcome on any of these:

- [ ] Timeline view — births, deaths, and events on a horizontal axis
- [ ] Print and PDF export
- [ ] Mobile touch support for dragging
- [ ] Dark mode
- [ ] Multiple trees
- [ ] Relationship suggestions — detect likely missing connections
- [ ] DNA match comparison — compare exported trees to find shared ancestors

---

## Contributing

RootFree is a single HTML file with no build process. If you know HTML, CSS, and JavaScript, you can contribute without any setup.

1. Fork this repository
2. Edit `index.html`
3. Open it in your browser to test your changes
4. Open a pull request describing what you changed and why

For significant changes, open an issue first so we can discuss the approach.

---

## Browser support

| Browser | Status |
|---|---|
| Chrome / Edge | Full support |
| Firefox | Full support |
| Safari | Full support |
| Mobile | Usable — drag not yet optimised for touch |

---

## License

MIT. Free to use, modify, and distribute. See [LICENSE](LICENSE).
