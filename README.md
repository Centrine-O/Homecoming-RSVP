# Family Homecoming RSVP

A no-login RSVP page shared as one WhatsApp link. Replies land in a Google Sheet the hosts can open in Sheets or download as Excel. Costs nothing to run.

- **Page:** static HTML/CSS/JS in `web/`, hosted on GitHub Pages
- **API:** one Google Apps Script web app, `backend/Code.gs`
- **Data:** one Google Sheet, with `RSVPs` (one row per person) and `Summary` (formulas)

The full spec is in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## Try it locally

```sh
npm test          # business rules + backend, no dependencies
npm run serve     # http://localhost:8080
```

While `apiUrl` in `web/config.js` is empty, the page runs in **preview mode**: a banner shows, and replies are saved in the browser only.

## 1. Fill in the event details

Event details are in `web/config.js`, filled in from the answers recorded in section 3 of the requirements. Still to come: the exact December date, the RSVP deadline and a Google Maps pin.

The link preview text is in the `og:` tags in `web/index.html`, because WhatsApp reads them without running JavaScript. The preview card is `web/og-image.jpg` (1200×630), made from the family photo `web/homestead.jpg`.

## 2. Create the backend (one time)

```sh
npm i -g @google/clasp
clasp login
clasp create --type sheets --title "Family RSVP" --rootDir backend
git checkout backend/appsscript.json   # clasp create may overwrite the manifest
clasp push
```

`clasp create` writes `.clasp.json` (gitignored) and creates a new Google Sheet with the script bound to it. Then:

1. Run `clasp open-script` (or open the sheet, then Extensions → Apps Script).
2. Choose `setup` in the function dropdown, click **Run**, and approve the permissions. This creates the `RSVPs` and `Summary` tabs and placeholder Script Properties.
3. Go to Project Settings → **Script properties** and set them to match `config.js`:

   `setup()` already seeds them with the current answers, so you only need to change `RSVP_DEADLINE` once the date is set.

   | Property | Current value | Meaning |
   | --- | --- | --- |
   | `BRANCHES` | `[]` | No family branches; the branch question is off |
   | `OTHER_BRANCH` | (empty) | Same as `otherBranchLabel` |
   | `RSVP_DEADLINE` | (empty) | e.g. `2026-12-10`; empty means the form never closes |
   | `SHOW_PUBLIC_LISTS` | `false` | Only the hosts see names, in the sheet |
   | `SHOW_PUBLIC_MESSAGES` | `false` | Messages go to the hosts only |
   | `CONTACT` | `Uncle Gilly on 0725 433 625` | Used in the "Replies closed" message |

4. Deploy → **New deployment** → type **Web app**, with Execute as: **Me** and Who has access: **Anyone**. Copy the `/exec` URL into `apiUrl` in `web/config.js`.

**Updating the backend later:** run `clasp push`, then Deploy → Manage deployments → Edit (pencil) → Version: **New version**. This keeps the same URL.

## 3. Host the page

1. Push to `main` on GitHub.
2. In the repo, go to Settings → Pages → Source: **GitHub Actions**. The workflow in `.github/workflows/pages.yml` runs the tests, then publishes `web/`.
3. The page is served at https://centrine-o.github.io/Homecoming-RSVP/. If the address differs, update `og:url`, `og:image` and `siteUrl`.
4. Paste the link into a WhatsApp chat with yourself to check the preview card.

## 4. Before sharing

Work through the checklist in section 13 of the requirements on a real phone against the live backend. The business-logic items and most backend items are covered by `npm test`. These still need a real phone and the live backend: two phones submitting at once, WhatsApp preview cards, airplane mode on Send, and Lighthouse.

## Data for the hosts

Share the Google Sheet with Dad. `Summary` shows the headcount. File → Download → Microsoft Excel gives a snapshot for the caterer. See section 12 of the requirements for an Excel file that refreshes itself.

## Files

| Path | What it does |
| --- | --- |
| `web/config.js` | All event text and switches |
| `web/logic.js` | Pure business rules (validation, totals, coverage, sorting, deadline) |
| `web/api.js` | Calls the API, or uses localStorage in preview mode |
| `web/app.js` | Renders the page; user text is only ever set with `textContent` |
| `backend/Code.gs` | `doGet` / `doPost`, locked upsert, `setup()`. Mirrors the validation in `logic.js` |
| `tests/` | `logic.test.js` (rules), `backend.test.js` (runs `Code.gs` against a fake sheet) |
