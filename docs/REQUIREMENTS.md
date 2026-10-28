# Family Homecoming RSVP — Requirements, Business Logic & Build Guide

Oct 27, 2026 · @Centrine

## 1. Overview

We are building a no-login RSVP web app, shared as one link through WhatsApp, so the whole lineage can say whether they are coming to the family homecoming at the rural home. Every reply lands in a Google Sheet the hosts can open as a spreadsheet or download as Excel.

**Context.** Dad is hosting a get-together for the lineage of the grandparents: their children, and the grandchildren who now have families of their own. Invitations travel by WhatsApp groups and get forwarded on, so nobody has a single, reliable list of who is coming.

**Goals**

1. Each person can reply in under one minute from a phone, without creating an account.
2. The hosts can see, at any time, who is coming, who is not sure yet, and who cannot make it.
3. The hosts can see which family branches have not replied yet, so they know whom to follow up with.
4. The hosts get accurate headcounts of adults and children for food, seating and sleeping arrangements.
5. The data is available as a spreadsheet that can be opened in Google Sheets or downloaded as Excel.

**Success criteria**

- Every family branch has at least one reply before the RSVP deadline.
- There are no duplicate entries for the same person.
- Running costs are KES 0, using free tiers only.
- The page loads in under 3 seconds on a 3G connection.

## 2. Stakeholders and user roles

There are three roles. Only the hosts can see the raw spreadsheet; everyone else uses the public page.

| Role | Who | What they do | Access |
| --- | --- | --- | --- |
| Host / owner | Dad | Decides the event details, follows up with branches, uses headcounts for planning | Google Sheet (edit), public page |
| Organiser / developer | Centrine | Builds, deploys and maintains the app; owns the Google account and the hosting | Code repo, Apps Script, Google Sheet, hosting dashboard |
| Respondent | Any family member: the grandparents' children, grandchildren, spouses, great-grandchildren | Opens the WhatsApp link, submits or changes a reply, forwards the link | Public page only, no login |
| Viewer | Anyone with the link | Sees who has replied and reads messages to the family | Public page only, read-only |

One respondent may reply on behalf of a household, for example a parent replying for a spouse and children. The adults and children counts cover this case.

## 3. Requirements gathering: inputs needed before the build

Confirm these with Dad before writing code. Every item becomes a value in the app's config file, so the app can be built now and filled in later.

| # | Question | Why it matters | Answer |
| --- | --- | --- | --- |
| Q1 | Grandfather's full name as the family uses it | Hero title on the page | Grado |
| Q2 | Grandmother's full name as the family uses it | Hero title on the page | Teresa |
| Q3 | Names of each of the grandparents' children, in birth order | Each child becomes one family branch in the dropdown and in the coverage table | Not needed: the branch question and branch table are switched off |
| Q4 | Event date or dates, and arrival and departure times | Shown on the page; decides whether overnight stay counts are needed | December 2026, exact date to be confirmed |
| Q5 | Venue: home name or village, plus a Google Maps pin | Shown on the page, with a directions link | Ong'aria's Homestead; no Maps pin yet |
| Q6 | RSVP deadline | Locks the form after this date | None yet (form stays open) |
| Q7 | Should replies be visible to everyone, or only to the hosts? | Decides whether the public lists are shown | Hosts only: the page shows counts, never names |
| Q8 | Are messages to the family public or private? | Privacy of the message wall | Private (follows Q7) |
| Q9 | Do we need overnight accommodation counts? | Optional "staying overnight" field | No |
| Q10 | Do we need dietary needs or contributions, such as who brings what? | Optional extra fields; out of scope unless confirmed | No |
| Q11 | Language: English only, or English and Kiswahili? | Copy and labels | English only |
| Q12 | Who else needs edit access to the sheet? | Google Sheet sharing | Centrine will share as needed |
| Q13 | Is there a photo of the grandparents for the WhatsApp preview? | `og:image` link preview | Family homestead photo (to be added); kanga placeholder until then |
| Q14 | Contact person and phone number for questions | Footer of the page | Uncle Gilly, 0725 433 625 |

## 4. Functional requirements

Must items make up the minimum version. Should and Could items are added only if there is time before the link goes out.

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-01 | Show an event header with the grandparents' names, date, venue, host and a family saying | Must |
| FR-02 | Reply form fields: full name, family branch (dropdown), attendance status, adults, children, optional message | Must |
| FR-03 | Attendance status has exactly three options: Coming, Not sure yet, Can't make it | Must |
| FR-04 | Hide the adults and children fields when Can't make it is selected, and save them as 0 | Must |
| FR-05 | Saving a reply with the same name and branch as an earlier one updates that reply instead of adding a new row | Must |
| FR-06 | Remember the respondent's last reply on their device, and offer "Change my reply" with the form filled in | Must |
| FR-07 | Show live lists of replies grouped by status, each with a count | Must |
| FR-08 | Show totals: people coming, adults, children, and people who might come | Must |
| FR-09 | Show a table of family branches with the number of replies and people coming; flag branches with no replies | Must |
| FR-10 | Store every reply in a Google Sheet with a timestamp | Must |
| FR-11 | Show a confirmation after submitting that names the list the person is on | Must |
| FR-12 | Close the form after the RSVP deadline and show a message instead; lists stay visible | Should |
| FR-13 | Show a wall of messages to the family | Should |
| FR-14 | Refresh the lists automatically every 60 seconds and when the tab regains focus | Should |
| FR-15 | Add a "Get directions" link that opens the Google Maps pin | Should |
| FR-16 | Add a "Share on WhatsApp" button that prefills a forward message with the link | Should |
| FR-17 | Provide a summary tab in the sheet with totals per status and per branch, built with formulas | Should |
| FR-18 | Add an optional overnight stay field and count | Could |
| FR-19 | Add a Kiswahili language toggle | Could |
| FR-20 | Add a host-only view behind a PIN, if replies are made private (Q7) | Could |
| FR-21 | When Coming is selected, optionally pick the days that work, from Sat 26 Dec to Fri 1 Jan (any number). Stored in column J (Dates) as labels like "Sat 26 Dec"; the Summary tab counts replies and people per day | Must (added 28 Oct) |
| FR-22 | After replying, people can tap "See who's coming" to see the names of everyone marked Coming (names only, A–Z, no counts). Before replying they see "Send your reply to see who else is coming." Server sends the names only when SHOW_COMING_NAMES is true | Must (added 28 Oct) |

## 5. Non-functional requirements

The app must work for an older relative on a budget Android phone, with weak signal, who opens it from WhatsApp.

| ID | Area | Requirement |
| --- | --- | --- |
| NFR-01 | Access | No login or account for respondents |
| NFR-02 | Devices | Mobile first; works from 320 px wide; tested in the WhatsApp in-app browser, Chrome for Android and Safari on iOS |
| NFR-03 | Performance | First load under 3 s on 3G; total page weight under 150 KB, not counting fonts; no frameworks needed |
| NFR-04 | Accessibility | Tap targets at least 44 px; text at least 16 px; labels on every field; visible keyboard focus; WCAG AA contrast |
| NFR-05 | Reliability | Concurrent submissions must not overwrite each other (server-side lock); a failed save shows a clear retry message |
| NFR-06 | Security | Trim and length-cap all input on the server; block spreadsheet formula injection; render all user text as text, never HTML |
| NFR-07 | Privacy | Collect only name, branch, counts and an optional message; no phone numbers or emails; the sheet is shared only with the hosts |
| NFR-08 | Cost | KES 0: free GitHub Pages or Netlify hosting, and free Google Apps Script and Google Sheets |
| NFR-09 | Maintainability | All event details live in one config file; no code changes needed to update text |
| NFR-10 | Link preview | Open Graph title, description and image, so the WhatsApp link shows a proper card |
| NFR-11 | Abuse | Basic honeypot field and a per-device cooldown of 10 s between submissions |

## 6. Data model

One Google Sheet holds the data, with one tab named `RSVPs` and one row per reply. A second tab, `Summary`, contains formulas only.

**Tab `RSVPs`** (row 1 is a frozen header)

| Col | Field | Type | Rules |
| --- | --- | --- | --- |
| A | Updated | Date-time | Set by the server on every create or update |
| B | Name | Text | Required; 2–80 characters after trimming; internal spaces collapsed |
| C | Branch | Text | Required; must be one of the configured branches or the Other option |
| D | Status | Text | Required; one of `attending`, `tentative`, `declined` |
| E | Adults | Integer | 1–30 if attending or tentative; 0 if declined |
| F | Children | Integer | 0–30 if attending or tentative; 0 if declined |
| G | Message | Text | Optional; up to 500 characters |
| H | Key | Text | Hidden; `lower(name) + "\|" + branch` |
| I | Created | Date-time | Set once, on the first submission only |
| J | Dates | Text | Optional; days that work, e.g. "Sat 26 Dec, Mon 28 Dec"; only for attending (FR-21) |

**Status values**

| Stored value | Label shown | Counts toward |
| --- | --- | --- |
| `attending` | Coming | People coming |
| `tentative` | Not sure yet | People who might come |
| `declined` | Can't make it | Nothing |

**Config** (`config.js`, not stored in the sheet): `grandfather`, `grandmother`, `date`, `venue`, `mapsUrl`, `host`, `saying`, `branches[]`, `otherBranchLabel`, `rsvpDeadline` (ISO date), `showPublicLists`, `showPublicMessages` (boolean), `apiUrl`, `contact`.

**Tab `Summary`** (formulas)

```
B2  People coming      =SUMIFS(RSVPs!E:E,RSVPs!D:D,"attending")+SUMIFS(RSVPs!F:F,RSVPs!D:D,"attending")
B3  Adults coming      =SUMIFS(RSVPs!E:E,RSVPs!D:D,"attending")
B4  Children coming    =SUMIFS(RSVPs!F:F,RSVPs!D:D,"attending")
B5  Might come         =SUMIFS(RSVPs!E:E,RSVPs!D:D,"tentative")+SUMIFS(RSVPs!F:F,RSVPs!D:D,"tentative")
B6  Replies declined   =COUNTIF(RSVPs!D:D,"declined")
A9  Per branch         =QUERY(RSVPs!A:H,"select C, count(B), sum(E)+sum(F) where D='attending' group by C label count(B) 'Replies coming', sum(E)+sum(F) 'People'",1)
```

## 7. Business logic rules

The server is the source of truth. The client repeats the validation only to give faster feedback.

**BR-01 Validation on submit** (client and server)

1. Name: trim it and collapse repeated spaces. Reject it if it is shorter than 2 characters or longer than 80. Message shown: "Add your full name."
2. Branch: reject it if it is empty or not in `branches[]` and not the Other option. Message shown: "Choose your family branch."
3. Status: reject it if it is not `attending`, `tentative` or `declined`. Message shown: "Choose whether you're coming."
4. Adults: if declined, force it to 0. Otherwise clamp it to the range 1–30; an empty value becomes 1.
5. Children: if declined, force it to 0. Otherwise clamp it to the range 0–30; an empty value becomes 0.
6. Message: trim it and cut it to 500 characters.
7. Honeypot: if the hidden field `website` has a value, return success and save nothing.

**BR-02 Formula injection.** On the server, add a leading apostrophe to any text value that starts with `=`, `+`, `-` or `@` before writing it to the sheet.

**BR-03 Upsert (one row per person).** `key = lower(name) + "|" + branch`. Take a script lock for up to 10 s. Look for `key` in column H. If it is found, overwrite columns A–H on that row and keep column I (Created). If it is not found, append a new row with A = I = now. Release the lock in a `finally` block. Return `{ok:true, updated:true|false}`.

**BR-04 Changing a reply.** The device stores the last reply that was sent successfully. "Change my reply" fills in the form with it. Because name and branch are unchanged, BR-03 updates the same row. If the person edits their name or branch, a new row is created. This is acceptable, and hosts can delete the old row in the sheet.

**BR-05 Deadline.** If `now > rsvpDeadline` (end of that day in Africa/Nairobi time), the server rejects writes with "Replies closed on \<date>. Call \<contact> to make a change." The client hides the form and shows the same text. Reads keep working.

**BR-06 Totals** (calculated from all rows)

- People coming = Σ (adults + children) where status = attending
- Adults coming = Σ adults where attending; Children coming = Σ children where attending
- Might come = Σ (adults + children) where status = tentative
- Can't make it = count of rows where status = declined

**BR-07 Branch coverage.** For each branch in `branches[]`, plus any other branch value found in the data:

- replies = count of rows for that branch
- people coming = Σ (adults + children) where attending
- Flag "No replies yet" when replies = 0. List the branches in config order, so they follow the children's birth order.

**BR-08 Lists.** Group the rows by status. Within each group, sort by branch in config order, then by name A–Z. Show the name, then the branch and party size, for example "2 adults, 3 children". Declined rows show the branch only.

**BR-09 Messages.** Show only rows with a non-empty message, newest first. Show them only if `showPublicMessages` is true.

**BR-10 Privacy switch.** If `showPublicLists` is false, the GET endpoint returns totals and branch coverage only, with no names. Hosts then see names in the sheet only.

**BR-11 Cooldown.** The client disables Send for 10 s after a submission to stop double taps from creating extra requests.

## 8. Architecture and API contract

The app has three parts: a static page, one Apps Script web app that acts as the API, and one Google Sheet that holds the data. There is no server to run and no database to pay for.

```
 Phone (WhatsApp link)
        │
        ▼
 Static page (GitHub Pages: web/)
        │  GET / POST (text/plain)
        ▼
 Apps Script web app (runs as owner)
        │  read / write
        ▼
 Google Sheet (RSVPs + Summary)  ◄── Hosts open it in Sheets / Excel
```

The page never touches the sheet directly. Only the Apps Script, running as the owner, reads and writes it, so the sheet stays private.

**Server-side config.** Store `BRANCHES` (a JSON array), `OTHER_BRANCH`, `RSVP_DEADLINE` (ISO date), `SHOW_PUBLIC_LISTS` and `SHOW_PUBLIC_MESSAGES` in Script Properties (Project Settings → Script properties). The server uses these to validate branches and enforce the deadline. Keep them in step with `config.js`.

**`GET {apiUrl}`** returns every reply for the lists.

```json
{
  "ok": true,
  "closed": false,
  "deadline": "YYYY-MM-DD",
  "rows": [
    {"name": "Wanjiru K.", "branch": "Family of …", "status": "attending",
     "adults": 2, "children": 3, "message": "…", "updated": "ISO date-time"}
  ]
}
```

If `SHOW_PUBLIC_LISTS` is false, `rows` is omitted and `totals` and `coverage` (BR-06, BR-07) are returned instead.

**`POST {apiUrl}`** creates or updates one reply. Send the body as `text/plain`, not `application/json`, to avoid a CORS preflight, which Apps Script cannot answer.

```json
{"name": "Wanjiru K.", "branch": "Family of …", "status": "attending",
 "adults": 2, "children": 3, "message": "…", "website": ""}
```

| Response | Meaning |
| --- | --- |
| `{"ok": true, "updated": false}` | New reply added |
| `{"ok": true, "updated": true}` | Existing reply changed (BR-03) |
| `{"ok": false, "code": "validation", "field": "name", "error": "Add your full name."}` | BR-01 failed; show the message by the field |
| `{"ok": false, "code": "closed", "error": "Replies closed on …"}` | Past the deadline (BR-05) |
| `{"ok": false, "code": "server", "error": "The reply could not be saved. Try again."}` | Lock timeout or another error |

Apps Script always answers with HTTP 200, so the client must branch on `ok` and `code`, not on the status code.

## 9. UI and UX specification

The app is a single scrolling page. The reply form comes first, because replying is the one job most visitors have.

**Visual direction.** The header is styled like a kanga: a dotted maize-on-green patterned border frames an indigo panel. Inside are "Karibu nyumbani", the grandparents' names set large, and the family saying in a band at the foot, like a kanga's jina.

| Token | Value | Use |
| --- | --- | --- |
| Indigo | #1E2A5A | Header panel, primary button |
| Maize | #F2B630 | Border dots, saying band, the ampersand |
| Leaf | #2F6B3F | Border ground, Coming status |
| Amber | #9A6F00 | Not sure yet status |
| Slate | #5B6070 | Can't make it status, muted text |
| Paper | #F7F7F4 | Page background |
| Display font | Young Serif | Names and section headings |
| Body font | Figtree 400/600/700 | Everything else |

Use a dark-mode palette under `prefers-color-scheme: dark`.

**Page sections, top to bottom**

1. **Header:** Karibu nyumbani, "A homecoming for the family of", Grandfather & Grandmother, then the date, venue with a Get directions link, the host, and the saying band.
2. **Will you be there?:** the form. Status is shown as three large tappable cards (radio inputs). Adults and Children are number steppers, hidden when Can't make it is selected. The button reads "Send my reply".
3. **Confirmation** (replaces the form after sending): for example, "Thanks, Wanjiru. See you at home!", followed by which list they are on, a "Change my reply" link, and a "Share on WhatsApp" button.
4. **Who has replied:** a totals line, then three columns (stacked on mobile): Coming, Not sure yet, Can't make it, each with a count.
5. **Replies by family branch:** a table with Branch, Replies and People coming. Branches with no replies show "No replies yet" in amber.
6. **Messages to the family:** quote cards, shown only if any messages exist.
7. **Footer:** the last refresh time and the contact person.

**States to design**

- Loading: the lists show "Loading replies" until the first fetch completes.
- Empty: each list shows "No replies yet".
- Error on load: "Couldn't refresh the list. Check your connection; it will try again shortly."
- Error on save: field-specific messages from BR-01, or "Your reply wasn't sent. Check your connection and try again."
- Closed: after the deadline, the form is replaced by the BR-05 message.
- Preview mode: when `apiUrl` is empty, show a banner and save replies to `localStorage` only.

**WhatsApp forward text** (FR-16)

```
Karibu nyumbani! The family of <Grandfather> & <Grandmother> is gathering at home on <date>.
Tap to say if you're coming: <link>
Please forward to everyone in your household.
```

## 10. End-to-end build with Claude Code

Build in six steps, and commit after each one. Export this doc as Markdown, save it as `docs/REQUIREMENTS.md` in the repo, and point Claude Code at it.

**Target repo structure**

```
family-rsvp/
├── CLAUDE.md               # short project rules for Claude Code
├── docs/REQUIREMENTS.md    # this document
├── web/
│   ├── index.html
│   ├── styles.css
│   ├── config.js           # event details + apiUrl (FR, NFR-09)
│   ├── app.js              # UI, rendering, state
│   ├── api.js              # fetch wrapper + preview-mode store
│   └── logic.js            # pure functions: validate, totals, coverage, sort
├── backend/
│   ├── Code.gs             # doGet / doPost, upsert, lock
│   ├── appsscript.json
│   └── .clasp.json         # created by clasp (gitignored scriptId optional)
├── tests/logic.test.js     # node --test
└── README.md
```

**Steps**

1. **Set up.** Create the repo and run `npm i -g @google/clasp`, then `clasp login`. Add a `CLAUDE.md` containing: "Read docs/REQUIREMENTS.md. Vanilla HTML/CSS/JS, no framework, no build step. Business rules in logic.js as pure functions with tests. Never render user text with innerHTML."
2. **Write the business logic and tests.** Prompt: *"Implement BR-01, BR-06, BR-07 and BR-08 from docs/REQUIREMENTS.md as pure functions in web/logic.js (validateReply, computeTotals, branchCoverage, sortForList). Write node:test tests in tests/logic.test.js covering every rule, including the declined → 0 counts and clamping edges. Run them."*
3. **Build the backend.** Prompt: *"Create backend/Code.gs implementing section 8's API contract and BR-01 to BR-05 and BR-10, with a LockService upsert by key and a Created column. Add a setup() function that creates the RSVPs and Summary tabs with headers and the section 6 formulas."* Then run `clasp create --type sheets --title "Family RSVP" --rootDir backend` and `clasp push`.
4. **Build the frontend.** Prompt: *"Build web/ per section 9: kanga header, form, confirmation, lists, branch table, messages, all states, preview mode. Import logic.js for validation and totals. Mobile first, 320 px. Use the colour and font tokens from section 9. POST with a text/plain body to avoid a CORS preflight."*
5. **Deploy the backend.** In the Apps Script editor, run `setup()` once and approve the permissions. Then go to Deploy → New deployment → Web app, with Execute as: Me and Who has access: Anyone. Copy the `/exec` URL into `config.js`.
6. **Test end to end, then host.** Run section 13, then section 11.

**Updating later.** Text changes go in `config.js` only. Backend changes need `clasp push`, followed by Deploy → Manage deployments → Edit → New version, which keeps the same URL.

## 11. Hosting and deployment

Host the static `web/` folder on GitHub Pages. It is free, uses the GitHub account you already have, and gives an HTTPS link that previews well in WhatsApp. Netlify is the fallback if you want drag-and-drop deploys or a nicer subdomain.

| Option | Cost | URL you get | Deploy |
| --- | --- | --- | --- |
| GitHub Pages (recommended) | Free | `https://<user>.github.io/family-rsvp/` | Push to `main`; Pages serves `/web` via a workflow |
| Netlify | Free tier | `https://<name>.netlify.app` (name of your choice) | Drag the `web/` folder in, or connect the repo |
| Vercel | Free tier | `https://<name>.vercel.app` | Import the repo; set the root directory to `web` |
| Custom domain (optional) | About KES 1,500 a year for a `.co.ke` name, approximately | e.g. `familyname.co.ke` | Add a CNAME record at your registrar |

**GitHub Pages steps**

1. Push the repo to GitHub. It can be public; no secrets live in it, because the Apps Script URL is meant to be public.
2. Go to Settings → Pages → Source: GitHub Actions. Add the static-site workflow, with the upload path set to `web`.
3. Wait for the green check, then open the Pages URL on your phone.
4. In `index.html`, set `og:url` and `og:image` to absolute URLs on that domain. WhatsApp ignores relative image paths.
5. Paste the link into a WhatsApp chat with yourself to check the preview card before sharing it widely.

**Backend hosting.** Google hosts the Apps Script web app for free under your Google account. The quotas are far above what a family RSVP needs: about 20,000 URL fetch and sheet calls a day on a personal account (approximate). The script runs as you, so the sheet never needs to be public.

## 12. Accessing the data (Google Sheets and Excel)

The Google Sheet updates live with every reply. Excel gets a snapshot, either downloaded by hand or linked to refresh.

**For Dad and other hosts (view only, live)**

1. Open the sheet and click Share. Add Dad's Gmail as a Viewer, or as an Editor if he will tidy rows.
2. On his phone, he installs the Google Sheets app and the sheet appears under "Shared with me". The `Summary` tab shows the headcount at a glance.
3. Turn on filters (Data → Create a filter) on `RSVPs`, so he can filter by Branch or Status.

**Download as Excel (snapshot).** In Sheets, go to File → Download → Microsoft Excel (.xlsx). Repeat this whenever you need a fresh copy, for example for the caterer.

**Excel that refreshes itself** (optional)

1. In Sheets, go to File → Share → Publish to web, choose the `RSVPs` tab and CSV format, then Publish. Copy the link.
2. In Excel, go to Data → From Web, paste the CSV link and click Load.
3. Data → Refresh All pulls in the latest replies. Note that anyone with that CSV link can read the names, so share it only with the hosts.

**Other useful views in Sheets**

- Sort by Updated, newest first, to see the latest replies.
- Use Conditional formatting on the Status column: green for attending, amber for tentative, grey for declined.
- To remove a duplicate or test row, delete the row in the sheet. The page reflects the change on its next refresh.
- Use Extensions → Apps Script → Triggers (optional) to email yourself a daily digest of new replies.

## 13. Testing checklist and acceptance criteria

The app is ready to share when every box below is ticked on a real phone, against the live backend.

**Business logic (automated, `node --test`)**

- [ ] Name shorter than 2 characters, longer than 80 characters, or only spaces is rejected
- [ ] Unknown branch or status is rejected
- [ ] Declined reply saves adults = 0 and children = 0
- [ ] Adults 0 becomes 1; adults 99 becomes 30; empty children becomes 0
- [ ] Totals and branch coverage match a hand-counted fixture of 10 rows
- [ ] Lists sort by branch in config order, then by name

**Backend (manual, against `/exec`)**

- [ ] A new reply appends a row with Created = Updated
- [ ] The same name and branch, sent again with a different status, updates that row with no new row, and Created is unchanged
- [ ] Name "=HYPERLINK(...)" is stored as text, not run as a formula
- [ ] Two phones submitting at the same moment both save
- [ ] After the deadline, POST returns the closed message and GET still works
- [ ] With `showPublicLists` = false, GET returns no names

**Frontend (on a real phone)**

- [ ] Opening the link from WhatsApp on Android and on iPhone shows the preview card and the page renders at 320 px
- [ ] Selecting Can't make it hides the counts
- [ ] The confirmation names the correct list; Change my reply fills in the form
- [ ] Airplane mode on Send shows the error message and the form keeps its values
- [ ] Lists refresh within 60 s of a reply from another phone
- [ ] Text the user types such as `<b>hi</b>` shows literally, not in bold
- [ ] Lighthouse scores on mobile: Performance ≥ 90, Accessibility ≥ 95

## 14. Rollout on WhatsApp and event-day operations

Share the link once, then use the branch table to chase the gaps. Do not resend the link to everyone.

1. **Soft launch.** Send the link to 3–5 relatives across different phones. Fix anything they stumble on, then clear their test rows only if they were not real replies.
2. **Launch.** Dad posts the link in each family WhatsApp group, using the forward text from section 9. Ask one person per branch to forward it to their own household groups.
3. **Weekly check.** Open the branch table. For each branch showing "No replies yet", Dad or a sibling calls the head of that branch.
4. **Reminder.** Three days before the deadline, post a short reminder in the groups and include the current "people coming" number.
5. **Deadline day.** The form closes automatically. Download the Excel snapshot for catering, seating and sleeping plans.
6. **After the event.** Turn off the Apps Script deployment (Deploy → Manage deployments → Archive). Keep the sheet as a family record, or delete the messages column if people prefer.
