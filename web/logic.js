// Pure business rules (docs/REQUIREMENTS.md section 7). No DOM, no I/O.
// backend/Code.gs mirrors validateReply, makeKey and escapeFormula; change both together.

export const STATUSES = ['attending', 'tentative', 'declined'];
export const STATUS_LABELS = { attending: 'Coming', tentative: 'Not sure yet', declined: "Can't make it" };
export const LIMITS = { nameMin: 2, nameMax: 80, countMax: 30, messageMax: 500 };
export const ERRORS = {
  name: 'Add your full name.',
  branch: 'Choose your family branch.',
  status: "Choose whether you're coming.",
};

export function cleanName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

export function makeKey(name, branch) {
  return cleanName(name).toLowerCase() + '|' + branch;
}

export function usesBranches({ branches, otherBranch }) {
  return branches.length > 0 || Boolean(otherBranch);
}

function toCount(value, fallback, min, max) {
  if (value === '' || value == null) return fallback;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// BR-01. Returns {ok:true, reply}, {ok:true, spam:true} or {ok:false, field, error}.
export function validateReply(input, { branches, otherBranch, dateOptions = [] }) {
  const data = input || {};
  if (String(data.website ?? '').trim() !== '') return { ok: true, spam: true };

  const name = cleanName(data.name);
  if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) {
    return { ok: false, field: 'name', error: ERRORS.name };
  }

  // With no branches configured the question is switched off and every reply has branch ''.
  const branch = usesBranches({ branches, otherBranch }) ? String(data.branch ?? '') : '';
  const validBranch = !usesBranches({ branches, otherBranch })
    || (branch !== '' && (branches.includes(branch) || branch === otherBranch));
  if (!validBranch) return { ok: false, field: 'branch', error: ERRORS.branch };

  const status = String(data.status ?? '');
  if (!STATUSES.includes(status)) return { ok: false, field: 'status', error: ERRORS.status };

  const declined = status === 'declined';
  const adults = declined ? 0 : toCount(data.adults, 1, 1, LIMITS.countMax);
  const children = declined ? 0 : toCount(data.children, 0, 0, LIMITS.countMax);
  const message = String(data.message ?? '').trim().slice(0, LIMITS.messageMax);
  const dates = status === 'attending' ? cleanDates(data.dates, dateOptions) : [];

  return { ok: true, reply: { name, branch, status, adults, children, message, dates } };
}

// Optional "days that work for you", only for people who are coming. Unknown days are dropped,
// duplicates removed, and the rest kept in calendar order. Never an error: the question is optional.
export function cleanDates(dates, dateOptions = []) {
  const picked = new Set(Array.isArray(dates) ? dates.map(String) : []);
  return dateOptions.filter((d) => picked.has(d));
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM-DD' → 'Sat 26 Dec'
export function dateLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

// BR-02. Text that a spreadsheet would treat as a formula is stored as text.
export function escapeFormula(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
}

const num = (v) => Number(v) || 0;

// BR-06
export function computeTotals(rows) {
  const t = { coming: 0, adults: 0, children: 0, mightCome: 0, declined: 0 };
  for (const r of rows) {
    if (r.status === 'attending') {
      t.adults += num(r.adults);
      t.children += num(r.children);
    } else if (r.status === 'tentative') {
      t.mightCome += num(r.adults) + num(r.children);
    } else if (r.status === 'declined') {
      t.declined += 1;
    }
  }
  t.coming = t.adults + t.children;
  return t;
}

const byText = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });

// BR-07. Configured branches in birth order, then any other branch found in the data, A–Z.
export function branchCoverage(rows, branches) {
  const extras = [...new Set(rows.map((r) => r.branch).filter((b) => b && !branches.includes(b)))].sort(byText);
  return [...branches, ...extras].map((branch) => {
    const mine = rows.filter((r) => r.branch === branch);
    const coming = mine
      .filter((r) => r.status === 'attending')
      .reduce((sum, r) => sum + num(r.adults) + num(r.children), 0);
    return { branch, replies: mine.length, coming, noReplies: mine.length === 0 };
  });
}

// BR-08. Branch in config order (unknown branches after, A–Z), then name A–Z.
export function sortForList(rows, branches) {
  const rank = (b) => {
    const i = branches.indexOf(b);
    return i === -1 ? branches.length : i;
  };
  const compare = (a, b) =>
    rank(a.branch) - rank(b.branch) || byText(a.branch, b.branch) || byText(a.name, b.name);
  const groups = { attending: [], tentative: [], declined: [] };
  for (const r of rows) if (groups[r.status]) groups[r.status].push(r);
  for (const s of STATUSES) groups[s].sort(compare);
  return groups;
}

export function partySize({ status, adults, children }) {
  if (status === 'declined') return '';
  const a = num(adults);
  const c = num(children);
  const parts = [`${a} ${a === 1 ? 'adult' : 'adults'}`];
  if (c > 0) parts.push(`${c} ${c === 1 ? 'child' : 'children'}`);
  return parts.join(', ');
}

// People who said Coming, A–Z, each once: their name and how many others they replied for
// ('Centrine +1'). Nothing else about them is shared.
export function comingNames(rows) {
  const seen = new Set();
  const people = [];
  for (const r of rows) {
    if (r.status !== 'attending') continue;
    const name = cleanName(r.name);
    const k = name.toLowerCase();
    if (name && !seen.has(k)) {
      seen.add(k);
      people.push({ name, plus: Math.max(0, num(r.adults) + num(r.children) - 1) });
    }
  }
  return people.sort((a, b) => byText(a.name, b.name));
}

// 'Wanjiru Kamau' → 'WK'; 'Otieno' → 'O'
export function initials(name) {
  const parts = cleanName(name).split(' ').filter(Boolean);
  const pick = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return pick.map((p) => [...p][0].toUpperCase()).join('');
}

// BR-09
export function messagesForWall(rows) {
  return rows
    .filter((r) => String(r.message ?? '').trim() !== '')
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

// BR-05. Replies stay open until the end of the deadline day in Africa/Nairobi (UTC+3, no DST).
export function deadlineEnd(deadline) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(deadline || ''))) return null;
  const end = new Date(`${deadline}T23:59:59.999+03:00`);
  return Number.isNaN(end.getTime()) ? null : end;
}

export function isClosed(deadline, now = new Date()) {
  const end = deadlineEnd(deadline);
  return end !== null && now > end;
}

export function closedMessage(dateText, contact) {
  return `Replies closed on ${dateText}. Call ${contact} to make a change.`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

// 'YYYY-MM-DD' → '1 December 2026' (same wording as the server's closed message).
export function formatIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso || '');
}

export function contactText({ name = '', phone = '' } = {}) {
  return phone ? `${name} on ${phone}` : name || 'the hosts';
}
