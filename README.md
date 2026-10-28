# Family Homecoming RSVP

A no-login RSVP page shared as one WhatsApp link. Replies land in a Google Sheet the hosts can open in Sheets or download as Excel. Costs nothing to run.

- **Page:** static HTML/CSS/JS in `web/`, live at **https://ongaria-homecoming.netlify.app**
- **API:** one Google Apps Script web app, `backend/Code.gs`
- **Data:** one Google Sheet, with `RSVPs` (one row per person) and `Summary` (formulas)

The full spec is in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## Try it locally

```sh
npm test          # business rules + backend, no dependencies
npm run dev       # http://localhost:8080 (stop with Ctrl+C)
```

While `apiUrl` in `web/config.js` is empty, the page runs in **preview mode**: a banner shows, and replies are saved in the browser only.

## 1. Fill in the event details

Event details are in `web/config.js`, filled in from the answers recorded in section 3 of the requirements. Still to come: the exact December date, the RSVP deadline and a Google Maps pin.

The link preview text is in the `og:` tags in `web/index.html`, because WhatsApp reads them without running JavaScript. The preview card is `web/og-image.jpg` (1200×630). The page photo is `web/homestead.webp` / `.jpg`, cropped and compressed from the original in `assets/homestead-original.jpg` (not published).

## 2. Create the backend (one time)

The live backend was set up without clasp: create a Google Sheet, open Extensions → Apps Script, paste in all of `backend/Code.gs`, save, then follow steps 2–4 below. clasp is optional:

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
   | `SHOW_COMING_NAMES` | `true` | After replying, people can see the names of who's coming (names only) |
   | `DATE_OPTIONS` | (not set) | Optional JSON list of days people can pick; unset means 26 Dec 2026 to 1 Jan 2027, matching `dateOptions` in `config.js` |

4. Deploy → **New deployment** → type **Web app**, with Execute as: **Me** and Who has access: **Anyone**. Copy the `/exec` URL into `apiUrl` in `web/config.js`.

**Updating the backend later:** paste the new `Code.gs` into the editor and save (or run `clasp push`), then Deploy → Manage deployments → Edit (pencil) → Version: **New version** → Deploy. This keeps the same URL. Making a *new deployment* instead gives a new URL, which then has to go into `apiUrl`.

## 3. Host the page

The page is hosted on Netlify, connected to this GitHub repo. `netlify.toml` tells Netlify to run `npm test` and publish `web/`, so every push to `main` goes live within a minute or two, and a push with failing tests does not.

If the address ever changes, update `og:url` and `og:image` in `web/index.html` and `siteUrl` in `web/config.js`.

(`.github/workflows/pages.yml` is for GitHub Pages, which is unused while the GitHub account's Actions are unavailable.)

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
