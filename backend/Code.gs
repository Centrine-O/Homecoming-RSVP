/**
 * Family Homecoming RSVP — Apps Script web app (docs/REQUIREMENTS.md section 8).
 *
 * Server config lives in Script Properties (Project Settings → Script properties):
 *   BRANCHES             JSON array, same order as config.js, e.g. ["Family of Ann","Family of Ben"];
 *                        [] with OTHER_BRANCH empty switches the branch question off
 *   OTHER_BRANCH         same text as otherBranchLabel in config.js
 *   RSVP_DEADLINE        YYYY-MM-DD (end of that day, Nairobi time); empty = never closes
 *   SHOW_PUBLIC_LISTS    "true" or "false"
 *   SHOW_PUBLIC_MESSAGES "true" or "false"
 *   CONTACT              e.g. "Peter on 0700 000 000" (used in the closed message)
 *
 * Validation mirrors web/logic.js (Apps Script cannot import it). Change both together.
 */

var SHEET_NAME = 'RSVPs';
var SUMMARY_NAME = 'Summary';
var HEADERS = ['Updated', 'Name', 'Branch', 'Status', 'Adults', 'Children', 'Message', 'Key', 'Created'];
var STATUSES = ['attending', 'tentative', 'declined'];
var LIMITS = { nameMin: 2, nameMax: 80, countMax: 30, messageMax: 500 };
var LOCK_MS = 10000;
var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
var SERVER_ERROR = { ok: false, code: 'server', error: 'The reply could not be saved. Try again.' };

// ---------- HTTP ----------

function doGet() {
  try {
    var cfg = config_();
    var rows = readRows_();
    var out = { ok: true, closed: isClosed_(cfg.deadline, new Date()), deadline: cfg.deadline };
    if (cfg.showLists) {
      out.rows = rows.map(function (r) {
        return {
          name: r.name, branch: r.branch, status: r.status, adults: r.adults, children: r.children,
          message: cfg.showMessages ? r.message : '', updated: r.updated
        };
      });
    } else {
      // BR-10: no names leave the server.
      out.totals = computeTotals_(rows);
      out.coverage = branchCoverage_(rows, cfg.branches);
    }
    return json_(out);
  } catch (err) {
    console.error(err);
    return json_({ ok: false, code: 'server', error: "Couldn't load replies. Try again." });
  }
}

function doPost(e) {
  try {
    var cfg = config_();
    if (isClosed_(cfg.deadline, new Date())) {
      return json_({ ok: false, code: 'closed', error: closedMessage_(cfg) });
    }
    var data;
    try {
      data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (parseErr) {
      data = {};
    }
    var v = validateReply_(data, cfg);
    if (!v.ok) return json_({ ok: false, code: 'validation', field: v.field, error: v.error });
    if (v.spam) return json_({ ok: true, updated: false }); // BR-01.7 honeypot: pretend success
    return json_(upsert_(v.reply));
  } catch (err) {
    console.error(err);
    return json_(SERVER_ERROR);
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Config ----------

function config_() {
  var p = PropertiesService.getScriptProperties();
  var branches = [];
  try {
    branches = JSON.parse(p.getProperty('BRANCHES') || '[]');
  } catch (err) {
    console.error('BRANCHES is not valid JSON');
  }
  return {
    branches: Array.isArray(branches) ? branches.map(String) : [],
    otherBranch: p.getProperty('OTHER_BRANCH') || '',
    deadline: (p.getProperty('RSVP_DEADLINE') || '').trim(),
    showLists: p.getProperty('SHOW_PUBLIC_LISTS') !== 'false',
    showMessages: p.getProperty('SHOW_PUBLIC_MESSAGES') !== 'false',
    contact: p.getProperty('CONTACT') || 'the hosts'
  };
}

// ---------- Business rules (mirror web/logic.js) ----------

function cleanName_(name) {
  return String(name == null ? '' : name).trim().replace(/\s+/g, ' ');
}

function makeKey_(name, branch) {
  return cleanName_(name).toLowerCase() + '|' + branch;
}

function toCount_(value, fallback, min, max) {
  if (value === '' || value == null) return fallback;
  var n = Math.round(Number(value));
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// BR-01
function validateReply_(data, cfg) {
  data = data || {};
  if (String(data.website == null ? '' : data.website).trim() !== '') return { ok: true, spam: true };

  var name = cleanName_(data.name);
  if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) {
    return { ok: false, field: 'name', error: 'Add your full name.' };
  }
  // With no branches configured the question is switched off and every reply has branch ''.
  var usesBranches = cfg.branches.length > 0 || Boolean(cfg.otherBranch);
  var branch = usesBranches ? String(data.branch == null ? '' : data.branch) : '';
  if (usesBranches && (branch === '' || (cfg.branches.indexOf(branch) === -1 && branch !== cfg.otherBranch))) {
    return { ok: false, field: 'branch', error: 'Choose your family branch.' };
  }
  var status = String(data.status == null ? '' : data.status);
  if (STATUSES.indexOf(status) === -1) {
    return { ok: false, field: 'status', error: "Choose whether you're coming." };
  }
  var declined = status === 'declined';
  return {
    ok: true,
    reply: {
      name: name,
      branch: branch,
      status: status,
      adults: declined ? 0 : toCount_(data.adults, 1, 1, LIMITS.countMax),
      children: declined ? 0 : toCount_(data.children, 0, 0, LIMITS.countMax),
      message: String(data.message == null ? '' : data.message).trim().slice(0, LIMITS.messageMax)
    }
  };
}

// BR-02
function escapeFormula_(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
}

function unescape_(value) {
  return String(value == null ? '' : value).replace(/^'/, '');
}

// BR-05
function isClosed_(deadline, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline || '')) return false;
  return now > new Date(deadline + 'T23:59:59.999+03:00');
}

function closedMessage_(cfg) {
  var parts = cfg.deadline.split('-');
  var dateText = Number(parts[2]) + ' ' + MONTHS[Number(parts[1]) - 1] + ' ' + parts[0];
  return 'Replies closed on ' + dateText + '. Call ' + cfg.contact + ' to make a change.';
}

// BR-06
function computeTotals_(rows) {
  var t = { coming: 0, adults: 0, children: 0, mightCome: 0, declined: 0 };
  rows.forEach(function (r) {
    if (r.status === 'attending') {
      t.adults += r.adults;
      t.children += r.children;
    } else if (r.status === 'tentative') {
      t.mightCome += r.adults + r.children;
    } else if (r.status === 'declined') {
      t.declined += 1;
    }
  });
  t.coming = t.adults + t.children;
  return t;
}

// BR-07
function branchCoverage_(rows, branches) {
  var extras = [];
  rows.forEach(function (r) {
    if (r.branch && branches.indexOf(r.branch) === -1 && extras.indexOf(r.branch) === -1) extras.push(r.branch);
  });
  extras.sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: 'base' }); });
  return branches.concat(extras).map(function (branch) {
    var replies = 0;
    var coming = 0;
    rows.forEach(function (r) {
      if (r.branch !== branch) return;
      replies += 1;
      if (r.status === 'attending') coming += r.adults + r.children;
    });
    return { branch: branch, replies: replies, coming: coming, noReplies: replies === 0 };
  });
}

// ---------- Sheet access ----------

function sheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Missing "' + SHEET_NAME + '" tab. Run setup() first.');
  return sheet;
}

function readRows_() {
  var sheet = sheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, HEADERS.length).getValues()
    .filter(function (v) { return String(v[1]).trim() !== ''; })
    .map(function (v) {
      return {
        updated: v[0] instanceof Date ? v[0].toISOString() : String(v[0]),
        name: unescape_(v[1]),
        branch: unescape_(v[2]),
        status: String(v[3]),
        adults: Number(v[4]) || 0,
        children: Number(v[5]) || 0,
        message: unescape_(v[6])
      };
    });
}

// BR-03: one row per name + branch, under a script lock.
function upsert_(reply) {
  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_MS); // throws on timeout → doPost answers with the server error
  try {
    var sheet = sheet_();
    var key = makeKey_(reply.name, reply.branch);
    var now = new Date();
    var values = [now, reply.name, reply.branch, reply.status, reply.adults, reply.children, reply.message, key]
      .map(escapeFormula_);
    var row = findRow_(sheet, key);
    if (row) {
      sheet.getRange(row, 1, 1, values.length).setValues([values]); // column I (Created) untouched
    } else {
      sheet.appendRow(values.concat([now]));
    }
    SpreadsheetApp.flush();
    return { ok: true, updated: row > 0 };
  } finally {
    lock.releaseLock();
  }
}

function findRow_(sheet, key) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var keys = sheet.getRange(2, 8, last - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (unescape_(keys[i][0]) === key) return i + 2;
  }
  return 0;
}

// ---------- One-time setup (run from the editor) ----------

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME, 0);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.hideColumns(8);
  sheet.getRange('A2:A').setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange('I2:I').setNumberFormat('yyyy-mm-dd hh:mm');
  var status = sheet.getRange('D2:D');
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('attending').setBackground('#D7EBDC').setRanges([status]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('tentative').setBackground('#F8E9C2').setRanges([status]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('declined').setBackground('#E3E4E8').setRanges([status]).build()
  ]);
  if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).createFilter();

  var summary = ss.getSheetByName(SUMMARY_NAME) || ss.insertSheet(SUMMARY_NAME, 1);
  summary.clear();
  summary.getRange('A1:B6').setValues([
    ['Headcount', ''],
    ['People coming', '=SUMIFS(RSVPs!E:E,RSVPs!D:D,"attending")+SUMIFS(RSVPs!F:F,RSVPs!D:D,"attending")'],
    ['Adults coming', '=SUMIFS(RSVPs!E:E,RSVPs!D:D,"attending")'],
    ['Children coming', '=SUMIFS(RSVPs!F:F,RSVPs!D:D,"attending")'],
    ['Might come', '=SUMIFS(RSVPs!E:E,RSVPs!D:D,"tentative")+SUMIFS(RSVPs!F:F,RSVPs!D:D,"tentative")'],
    ['Replies declined', '=COUNTIF(RSVPs!D:D,"declined")']
  ]);
  summary.getRange('A8').setValue('Per branch');
  summary.getRange('A9').setFormula(
    "=QUERY(RSVPs!A:H,\"select C, count(B), sum(E)+sum(F) where D='attending' group by C " +
    "label count(B) 'Replies coming', sum(E)+sum(F) 'People'\",1)");
  summary.getRange('A1').setFontWeight('bold');
  summary.getRange('A8').setFontWeight('bold');
  summary.setColumnWidth(1, 220);

  // Drop the blank default tab a new spreadsheet comes with.
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(blank);

  // Seed Script Properties that are not set yet, so the app runs straight away.
  var props = PropertiesService.getScriptProperties();
  var defaults = {
    BRANCHES: '[]',
    OTHER_BRANCH: '',
    RSVP_DEADLINE: '',
    SHOW_PUBLIC_LISTS: 'false',
    SHOW_PUBLIC_MESSAGES: 'false',
    CONTACT: 'Uncle Gilly on 0725 433 625'
  };
  Object.keys(defaults).forEach(function (k) {
    if (props.getProperty(k) === null) props.setProperty(k, defaults[k]);
  });
}
