import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateReply, computeTotals, branchCoverage, sortForList,
  cleanName, makeKey, partySize, messagesForWall, isClosed, closedMessage,
  escapeFormula, STATUS_LABELS,
} from '../web/logic.js';

const BRANCHES = ['Family of Ann', 'Family of Ben', 'Family of Cate'];
const OTHER = 'Other / friend of the family';
const opts = { branches: BRANCHES, otherBranch: OTHER };

const base = { name: 'Wanjiru Kamau', branch: 'Family of Ben', status: 'attending', adults: 2, children: 3, message: '', website: '' };
const v = (over) => validateReply({ ...base, ...over }, opts);

describe('BR-01 validateReply: name', () => {
  test('accepts a normal reply and returns cleaned values', () => {
    const r = v({});
    assert.equal(r.ok, true);
    assert.deepEqual(r.reply, { name: 'Wanjiru Kamau', branch: 'Family of Ben', status: 'attending', adults: 2, children: 3, message: '' });
  });
  test('trims and collapses internal spaces', () => {
    assert.equal(v({ name: '   Wanjiru    \t Kamau  ' }).reply.name, 'Wanjiru Kamau');
  });
  for (const [label, name] of [['1 char', 'A'], ['only spaces', '     '], ['empty', ''], ['missing', undefined], ['81 chars', 'x'.repeat(81)]]) {
    test(`rejects name: ${label}`, () => {
      assert.deepEqual(v({ name }), { ok: false, field: 'name', error: 'Add your full name.' });
    });
  }
  test('accepts 2 and 80 characters', () => {
    assert.equal(v({ name: 'Jo' }).ok, true);
    assert.equal(v({ name: 'x'.repeat(80) }).ok, true);
  });
  test('length is checked after collapsing spaces', () => {
    assert.equal(v({ name: 'A' + ' '.repeat(100) + 'B' }).reply.name, 'A B');
  });
});

describe('BR-01 validateReply: branch and status', () => {
  test('rejects empty or unknown branch', () => {
    for (const branch of ['', undefined, 'Family of Zed', 'family of ben']) {
      assert.deepEqual(v({ branch }), { ok: false, field: 'branch', error: 'Choose your family branch.' });
    }
  });
  test('accepts the Other option', () => {
    assert.equal(v({ branch: OTHER }).reply.branch, OTHER);
  });
  test('rejects an empty Other option when none is configured', () => {
    assert.equal(validateReply({ ...base, branch: '' }, { branches: BRANCHES, otherBranch: '' }).ok, false);
  });
  test('rejects unknown status', () => {
    for (const status of ['', undefined, 'yes', 'Attending']) {
      assert.deepEqual(v({ status }), { ok: false, field: 'status', error: "Choose whether you're coming." });
    }
  });
  test('reports the first failing field in name, branch, status order', () => {
    assert.equal(v({ name: '', branch: '', status: '' }).field, 'name');
    assert.equal(v({ branch: '', status: '' }).field, 'branch');
  });
});

describe('BR-01 validateReply: counts', () => {
  test('declined forces adults and children to 0', () => {
    const r = v({ status: 'declined', adults: 5, children: 4 });
    assert.equal(r.reply.adults, 0);
    assert.equal(r.reply.children, 0);
  });
  test('adults 0 becomes 1; 99 becomes 30; empty becomes 1', () => {
    assert.equal(v({ adults: 0 }).reply.adults, 1);
    assert.equal(v({ adults: 99 }).reply.adults, 30);
    assert.equal(v({ adults: '' }).reply.adults, 1);
    assert.equal(v({ adults: undefined }).reply.adults, 1);
    assert.equal(v({ adults: -4 }).reply.adults, 1);
  });
  test('children empty becomes 0; 99 becomes 30; negative becomes 0', () => {
    assert.equal(v({ children: '' }).reply.children, 0);
    assert.equal(v({ children: null }).reply.children, 0);
    assert.equal(v({ children: 99 }).reply.children, 30);
    assert.equal(v({ children: -1 }).reply.children, 0);
  });
  test('accepts numeric strings and rounds fractions', () => {
    assert.equal(v({ adults: '4' }).reply.adults, 4);
    assert.equal(v({ children: '2.6' }).reply.children, 3);
  });
  test('non-numeric counts fall back to the empty default', () => {
    assert.equal(v({ adults: 'two' }).reply.adults, 1);
    assert.equal(v({ children: 'abc' }).reply.children, 0);
  });
  test('tentative keeps clamped counts', () => {
    const r = v({ status: 'tentative', adults: 31, children: 31 });
    assert.equal(r.reply.adults, 30);
    assert.equal(r.reply.children, 30);
  });
});

describe('BR-01 validateReply: message and honeypot', () => {
  test('message is trimmed and cut to 500 characters', () => {
    assert.equal(v({ message: '  hello  ' }).reply.message, 'hello');
    assert.equal(v({ message: 'y'.repeat(600) }).reply.message.length, 500);
    assert.equal(v({ message: undefined }).reply.message, '');
  });
  test('honeypot with a value returns success and flags spam', () => {
    const r = v({ website: 'http://spam.example' });
    assert.deepEqual(r, { ok: true, spam: true });
  });
  test('honeypot wins even when the rest is invalid', () => {
    assert.deepEqual(v({ name: '', website: 'x' }), { ok: true, spam: true });
  });
});

describe('helpers', () => {
  test('cleanName and makeKey', () => {
    assert.equal(cleanName('  a   b '), 'a b');
    assert.equal(makeKey(' Wanjiru  KAMAU ', 'Family of Ben'), 'wanjiru kamau|Family of Ben');
  });
  test('partySize', () => {
    assert.equal(partySize({ status: 'attending', adults: 2, children: 3 }), '2 adults, 3 children');
    assert.equal(partySize({ status: 'attending', adults: 1, children: 1 }), '1 adult, 1 child');
    assert.equal(partySize({ status: 'tentative', adults: 2, children: 0 }), '2 adults');
    assert.equal(partySize({ status: 'declined', adults: 0, children: 0 }), '');
  });
  test('status labels', () => {
    assert.deepEqual(STATUS_LABELS, { attending: 'Coming', tentative: 'Not sure yet', declined: "Can't make it" });
  });
  test('BR-02 escapeFormula prefixes risky leading characters only', () => {
    assert.equal(escapeFormula('=HYPERLINK("x")'), '\'=HYPERLINK("x")');
    assert.equal(escapeFormula('+254'), "'+254");
    assert.equal(escapeFormula('-ok'), "'-ok");
    assert.equal(escapeFormula('@me'), "'@me");
    assert.equal(escapeFormula('Wanjiru'), 'Wanjiru');
    assert.equal(escapeFormula('a=b'), 'a=b');
    assert.equal(escapeFormula(3), 3);
  });
});

// Hand-counted fixture of 10 rows.
const FIXTURE = [
  { name: 'Zawadi', branch: 'Family of Ann', status: 'attending', adults: 2, children: 1, message: 'Tutaonana!', updated: '2026-11-01T08:00:00.000Z' },
  { name: 'Amani', branch: 'Family of Ann', status: 'attending', adults: 1, children: 0, message: '', updated: '2026-11-02T08:00:00.000Z' },
  { name: 'brian', branch: 'Family of Ann', status: 'tentative', adults: 2, children: 2, message: '', updated: '2026-11-03T08:00:00.000Z' },
  { name: 'Chebet', branch: 'Family of Ben', status: 'attending', adults: 3, children: 4, message: 'Bringing the drums', updated: '2026-11-05T08:00:00.000Z' },
  { name: 'Baraka', branch: 'Family of Ben', status: 'declined', adults: 0, children: 0, message: 'Sorry, abroad', updated: '2026-11-04T08:00:00.000Z' },
  { name: 'Otieno', branch: OTHER, status: 'attending', adults: 1, children: 0, message: '', updated: '2026-11-06T08:00:00.000Z' },
  { name: 'Akinyi', branch: OTHER, status: 'tentative', adults: 1, children: 1, message: '   ', updated: '2026-11-07T08:00:00.000Z' },
  { name: 'Mwangi', branch: 'Family of Ben', status: 'attending', adults: 2, children: 0, message: '', updated: '2026-11-08T08:00:00.000Z' },
  { name: 'Halima', branch: 'Family of Ann', status: 'declined', adults: 0, children: 0, message: '', updated: '2026-11-09T08:00:00.000Z' },
  { name: 'Ali', branch: 'Old Branch Name', status: 'attending', adults: 1, children: 2, message: '', updated: '2026-11-10T08:00:00.000Z' },
];

describe('BR-06 computeTotals', () => {
  test('matches the hand count', () => {
    // attending: Zawadi 2+1, Amani 1+0, Chebet 3+4, Otieno 1+0, Mwangi 2+0, Ali 1+2
    // adults 2+1+3+1+2+1 = 10, children 1+0+4+0+0+2 = 7
    // tentative: brian 2+2, Akinyi 1+1 = 6; declined rows: Baraka, Halima = 2
    assert.deepEqual(computeTotals(FIXTURE), { coming: 17, adults: 10, children: 7, mightCome: 6, declined: 2 });
  });
  test('empty input gives zeros', () => {
    assert.deepEqual(computeTotals([]), { coming: 0, adults: 0, children: 0, mightCome: 0, declined: 0 });
  });
  test('ignores counts on declined rows and coerces strings', () => {
    const t = computeTotals([{ status: 'declined', adults: 3, children: 3 }, { status: 'attending', adults: '2', children: '' }]);
    assert.deepEqual(t, { coming: 2, adults: 2, children: 0, mightCome: 0, declined: 1 });
  });
});

describe('BR-07 branchCoverage', () => {
  test('config branches first in order, then extra branches found in data A–Z', () => {
    const cov = branchCoverage(FIXTURE, BRANCHES);
    assert.deepEqual(cov, [
      { branch: 'Family of Ann', replies: 4, coming: 4, noReplies: false },
      { branch: 'Family of Ben', replies: 3, coming: 9, noReplies: false },
      { branch: 'Family of Cate', replies: 0, coming: 0, noReplies: true },
      { branch: 'Old Branch Name', replies: 1, coming: 3, noReplies: false },
      { branch: OTHER, replies: 2, coming: 1, noReplies: false },
    ]);
  });
  test('with no rows every configured branch is flagged', () => {
    assert.ok(branchCoverage([], BRANCHES).every((b) => b.noReplies && b.replies === 0));
  });
});

describe('BR-08 sortForList', () => {
  test('groups by status, sorts by branch config order then name A–Z (case-insensitive)', () => {
    const g = sortForList(FIXTURE, BRANCHES);
    assert.deepEqual(g.attending.map((r) => r.name), ['Amani', 'Zawadi', 'Chebet', 'Mwangi', 'Ali', 'Otieno']);
    assert.deepEqual(g.tentative.map((r) => r.name), ['brian', 'Akinyi']);
    assert.deepEqual(g.declined.map((r) => r.name), ['Halima', 'Baraka']);
  });
  test('does not mutate input and drops unknown statuses', () => {
    const copy = structuredClone(FIXTURE);
    const g = sortForList([...FIXTURE, { name: 'X', branch: 'Family of Ann', status: 'maybe' }], BRANCHES);
    assert.deepEqual(FIXTURE, copy);
    assert.equal(g.attending.length + g.tentative.length + g.declined.length, 10);
  });
});

describe('BR-09 messagesForWall', () => {
  test('non-empty messages only, newest first', () => {
    assert.deepEqual(messagesForWall(FIXTURE).map((r) => r.name), ['Chebet', 'Baraka', 'Zawadi']);
  });
});

describe('BR-05 isClosed', () => {
  test('open through the end of the deadline day in Nairobi (UTC+3)', () => {
    assert.equal(isClosed('2026-12-01', new Date('2026-12-01T20:59:59.000Z')), false);
    assert.equal(isClosed('2026-12-01', new Date('2026-12-01T21:00:00.000Z')), true);
  });
  test('no deadline or a malformed one never closes', () => {
    assert.equal(isClosed('', new Date('2099-01-01')), false);
    assert.equal(isClosed('soon', new Date('2099-01-01')), false);
  });
  test('closedMessage', () => {
    assert.equal(closedMessage('1 December 2026', 'Peter on 0700 000 000'),
      'Replies closed on 1 December 2026. Call Peter on 0700 000 000 to make a change.');
  });
});
