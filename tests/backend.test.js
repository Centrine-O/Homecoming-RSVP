// Runs backend/Code.gs in a Node VM against an in-memory fake of the Sheets API,
// covering the backend checklist in docs/REQUIREMENTS.md section 13 that can be automated.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../backend/Code.gs', import.meta.url), 'utf8');
const HEADERS = ['Updated', 'Name', 'Branch', 'Status', 'Adults', 'Children', 'Message', 'Key', 'Created', 'Dates'];

// Mimics how Sheets stores a value: a leading apostrophe forces text and is not kept;
// any other string starting with "=" becomes a live formula.
function store(v) {
  if (typeof v === 'string' && v.startsWith("'")) return v.slice(1);
  if (typeof v === 'string' && v.startsWith('=')) return { formula: v };
  return v;
}

class FakeSheet {
  constructor() { this.data = [HEADERS.slice()]; }
  getLastRow() { return this.data.length; }
  getRange(r, c, nr, nc) {
    return {
      getValues: () => this.data.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc)),
      setValues: (vals) => vals.forEach((v, i) => v.forEach((x, j) => { this.data[r - 1 + i][c - 1 + j] = store(x); })),
      setValue: (x) => { this.data[r - 1][c - 1] = store(x); },
    };
  }
  appendRow(v) { this.data.push(Array.from(v, store)); } // Array.from: keep arrays in this realm
}

let sheet, props, lock, ctx;

function load(over = {}) {
  sheet = new FakeSheet();
  props = {
    BRANCHES: JSON.stringify(['Family of Ann', 'Family of Ben']),
    OTHER_BRANCH: 'Other',
    RSVP_DEADLINE: '',
    SHOW_PUBLIC_LISTS: 'true',
    SHOW_PUBLIC_MESSAGES: 'true',
    CONTACT: 'Peter on 0700 000 000',
    ...over,
  };
  lock = { waits: 0, releases: 0, fail: false };
  ctx = vm.createContext({
    console: { error() {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: (n) => (n === 'RSVPs' ? sheet : null) }),
      flush() {},
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() { lock.waits++; if (lock.fail) throw new Error('Lock timeout'); },
        releaseLock() { lock.releases++; },
      }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => ({ body: s, setMimeType() { return this; } }),
    },
  });
  vm.runInContext(SOURCE, ctx);
}

const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).body);
const get = () => JSON.parse(ctx.doGet().body);
const reply = (over = {}) => ({ name: 'Wanjiru K.', branch: 'Family of Ann', status: 'attending', adults: 2, children: 3, message: 'Hi', website: '', ...over });

describe('POST upsert (BR-03)', () => {
  beforeEach(() => load());

  test('a new reply appends a row with Created = Updated', () => {
    assert.deepEqual(post(reply()), { ok: true, updated: false });
    assert.equal(sheet.data.length, 2);
    const row = sheet.data[1];
    assert.deepEqual(row.slice(1, 8), ['Wanjiru K.', 'Family of Ann', 'attending', 2, 3, 'Hi', 'wanjiru k.|Family of Ann']);
    assert.equal(Object.prototype.toString.call(row[0]), "[object Date]"); // cross-realm safe
    assert.equal(row[8], row[0]);
    assert.equal(lock.waits, 1);
    assert.equal(lock.releases, 1);
  });

  test('same name (any case/spacing) and branch updates the row; Created unchanged', () => {
    post(reply());
    const created = sheet.data[1][8];
    assert.deepEqual(post(reply({ name: '  wanjiru   K. ', status: 'declined' })), { ok: true, updated: true });
    assert.equal(sheet.data.length, 2);
    assert.equal(sheet.data[1][3], 'declined');
    assert.equal(sheet.data[1][4], 0);
    assert.equal(sheet.data[1][5], 0);
    assert.equal(sheet.data[1][8], created);
  });

  test('days that work go in column J as readable labels; updates replace them, Created kept', () => {
    post(reply({ dates: ['2027-01-01', '2026-12-26', '2026-12-20'] }));
    assert.equal(sheet.data[1][9], 'Sat 26 Dec, Fri 1 Jan');
    const created = sheet.data[1][8];
    post(reply({ dates: ['2026-12-28'] }));
    assert.equal(sheet.data[1][9], 'Mon 28 Dec');
    assert.equal(sheet.data[1][8], created);
    post(reply({ status: 'tentative', dates: ['2026-12-28'] }));
    assert.equal(sheet.data[1][9], '', 'days only kept for Coming');
    assert.equal(sheet.data.length, 2);
  });

  test('no days picked leaves column J empty', () => {
    post(reply());
    assert.equal(sheet.data[1][9], '');
  });

  test('DATE_OPTIONS script property overrides the default days', () => {
    load({ DATE_OPTIONS: JSON.stringify(['2026-12-20']) });
    post(reply({ dates: ['2026-12-20', '2026-12-26'] }));
    assert.equal(sheet.data[1][9], 'Sun 20 Dec');
  });

  test('a different branch creates a new row', () => {
    post(reply());
    assert.equal(post(reply({ branch: 'Family of Ben' })).updated, false);
    assert.equal(sheet.data.length, 3);
  });

  test('formula injection is stored as text (BR-02)', () => {
    post(reply({ name: '=HYPERLINK("http://x","y")', message: '+254 700', branch: 'Other' }));
    const row = sheet.data[1];
    assert.ok(row.every((v) => !(v && typeof v === 'object' && 'formula' in v)), 'no cell became a formula');
    assert.equal(row[1], '=HYPERLINK("http://x","y")');
    // and a second submission finds the same row via the stored key
    assert.equal(post(reply({ name: '=HYPERLINK("http://x","y")', branch: 'Other' })).updated, true);
  });

  test('lock timeout returns the server error and releases nothing it did not take', () => {
    lock.fail = true;
    assert.deepEqual(post(reply()), { ok: false, code: 'server', error: 'The reply could not be saved. Try again.' });
    assert.equal(sheet.data.length, 1);
  });

  test('a missing RSVPs tab still releases the lock', () => {
    ctx.SpreadsheetApp.getActiveSpreadsheet = () => ({ getSheetByName: () => null });
    assert.equal(post(reply()).code, 'server');
    assert.equal(lock.releases, 1);
  });
});

describe('POST validation (BR-01)', () => {
  beforeEach(() => load());

  test('validation errors name the field', () => {
    assert.deepEqual(post(reply({ name: 'A' })), { ok: false, code: 'validation', field: 'name', error: 'Add your full name.' });
    assert.equal(post(reply({ branch: 'Family of Zed' })).field, 'branch');
    assert.equal(post(reply({ status: 'maybe' })).field, 'status');
  });

  test('clamps counts and caps the message', () => {
    post(reply({ adults: 0, children: 99, message: 'z'.repeat(900) }));
    assert.equal(sheet.data[1][4], 1);
    assert.equal(sheet.data[1][5], 30);
    assert.equal(sheet.data[1][6].length, 500);
  });

  test('honeypot returns success and saves nothing', () => {
    assert.deepEqual(post(reply({ website: 'spam' })), { ok: true, updated: false });
    assert.equal(sheet.data.length, 1);
  });

  test('with no branches configured, replies save with an empty branch and upsert by name', () => {
    load({ BRANCHES: '[]', OTHER_BRANCH: '' });
    assert.deepEqual(post(reply({ branch: '' })), { ok: true, updated: false });
    assert.deepEqual(post(reply({ branch: 'ignored', status: 'tentative' })), { ok: true, updated: true });
    assert.equal(sheet.data.length, 2);
    assert.equal(sheet.data[1][2], '');
    assert.equal(sheet.data[1][7], 'wanjiru k.|');
  });

  test('a body that is not JSON is a validation error, not a crash', () => {
    assert.equal(JSON.parse(ctx.doPost({ postData: { contents: 'nope' } }).body).code, 'validation');
    assert.equal(JSON.parse(ctx.doPost(undefined).body).code, 'validation');
  });
});

describe('deadline (BR-05)', () => {
  test('after the deadline POST is refused and GET still works', () => {
    load({ RSVP_DEADLINE: '2020-01-05' });
    assert.deepEqual(post(reply()), {
      ok: false, code: 'closed', error: 'Replies closed on 5 January 2020. Call Peter on 0700 000 000 to make a change.',
    });
    const g = get();
    assert.equal(g.ok, true);
    assert.equal(g.closed, true);
    assert.equal(g.deadline, '2020-01-05');
  });

  test('before the deadline POST works', () => {
    load({ RSVP_DEADLINE: '2999-01-01' });
    assert.equal(post(reply()).ok, true);
    assert.equal(get().closed, false);
  });
});

describe('GET (section 8, BR-09, BR-10)', () => {
  test('returns rows with ISO dates and unescaped text', () => {
    load();
    post(reply({ name: '-Dash', message: '@all see you' }));
    const g = get();
    assert.equal(g.rows.length, 1);
    assert.equal(g.rows[0].name, '-Dash');
    assert.equal(g.rows[0].message, '@all see you');
    assert.match(g.rows[0].updated, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(g.totals, undefined);
  });

  test('SHOW_PUBLIC_MESSAGES=false blanks messages', () => {
    load({ SHOW_PUBLIC_MESSAGES: 'false' });
    post(reply());
    assert.equal(get().rows[0].message, '');
  });

  test('SHOW_PUBLIC_LISTS=false returns totals and coverage, no names', () => {
    load({ SHOW_PUBLIC_LISTS: 'false' });
    post(reply());
    post(reply({ name: 'Otieno', branch: 'Other', status: 'tentative', adults: 1, children: 0 }));
    const g = get();
    assert.equal(g.rows, undefined);
    assert.ok(!JSON.stringify(g).includes('Wanjiru'));
    assert.deepEqual(g.totals, { coming: 5, adults: 2, children: 3, mightCome: 1, declined: 0 });
    assert.deepEqual(g.coverage.map((c) => [c.branch, c.replies, c.coming, c.noReplies]), [
      ['Family of Ann', 1, 5, false],
      ['Family of Ben', 0, 0, true],
      ['Other', 1, 0, false],
    ]);
  });

  test('SHOW_COMING_NAMES=true adds only the names of people coming, A–Z', () => {
    load({ SHOW_PUBLIC_LISTS: 'false', SHOW_COMING_NAMES: 'true' });
    post(reply({ name: 'Zawadi Ong\'aria' }));
    post(reply({ name: 'Baraka', status: 'declined' }));
    post(reply({ name: 'Akinyi', status: 'tentative' }));
    post(reply({ name: 'amani' }));
    const g = get();
    assert.deepEqual(g.coming, ['amani', "Zawadi Ong'aria"]);
    assert.equal(g.rows, undefined);
    assert.ok(!JSON.stringify(g).includes('Baraka') && !JSON.stringify(g).includes('Akinyi'));
  });

  test('without SHOW_COMING_NAMES no names are sent', () => {
    load({ SHOW_PUBLIC_LISTS: 'false' });
    post(reply());
    assert.equal(get().coming, undefined);
  });

  test('skips rows a host blanked out in the sheet', () => {
    load();
    post(reply());
    sheet.data.push(['', '', '', '', '', '', '', '', '']);
    assert.equal(get().rows.length, 1);
  });
});
