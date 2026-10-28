// Talks to the Apps Script web app, or to localStorage in preview mode (apiUrl empty).
import CONFIG from './config.js';
import {
  validateReply, makeKey, isClosed, computeTotals, branchCoverage, comingNames, closedMessage, formatIsoDate, contactText,
} from './logic.js';

export const previewMode = !CONFIG.apiUrl;

const TIMEOUT_MS = 20000; // weak rural signal: allow time, but don't hang forever
const PREVIEW_KEY = 'rsvp:preview-rows';

async function request(options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(CONFIG.apiUrl, { ...options, signal: controller.signal, redirect: 'follow' });
    return await res.json(); // Apps Script always answers 200; callers branch on ok/code
  } finally {
    clearTimeout(timer);
  }
}

export function fetchReplies() {
  if (previewMode) return Promise.resolve(previewGet());
  return request({ method: 'GET', cache: 'no-store' });
}

export function sendReply(payload) {
  if (previewMode) return Promise.resolve(previewPost(payload));
  // text/plain keeps this a "simple" request, so the browser skips the CORS preflight Apps Script can't answer.
  return request({
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
}

// ---------- Preview mode: mimics the server contract in this browser only ----------

function readPreview() {
  try {
    return JSON.parse(localStorage.getItem(PREVIEW_KEY) || '[]');
  } catch {
    return [];
  }
}

function writePreview(rows) {
  try {
    localStorage.setItem(PREVIEW_KEY, JSON.stringify(rows));
    return true;
  } catch {
    return false;
  }
}

function previewGet() {
  const rows = readPreview();
  const out = { ok: true, closed: isClosed(CONFIG.rsvpDeadline), deadline: CONFIG.rsvpDeadline };
  if (CONFIG.showPublicLists) {
    out.rows = rows.map((r) => ({ ...r, message: CONFIG.showPublicMessages ? r.message : '' }));
  } else {
    out.totals = computeTotals(rows);
    out.coverage = branchCoverage(rows, CONFIG.branches);
    if (CONFIG.showComingNames) out.coming = comingNames(rows);
  }
  return out;
}

function previewPost(payload) {
  if (isClosed(CONFIG.rsvpDeadline)) {
    const error = closedMessage(formatIsoDate(CONFIG.rsvpDeadline), contactText(CONFIG.contact));
    return { ok: false, code: 'closed', error };
  }
  const v = validateReply(payload, {
    branches: CONFIG.branches, otherBranch: CONFIG.otherBranchLabel, dateOptions: CONFIG.dateOptions,
  });
  if (!v.ok) return { ok: false, code: 'validation', field: v.field, error: v.error };
  if (v.spam) return { ok: true, updated: false };
  const rows = readPreview();
  const key = makeKey(v.reply.name, v.reply.branch);
  const i = rows.findIndex((r) => makeKey(r.name, r.branch) === key);
  const row = { ...v.reply, updated: new Date().toISOString() };
  if (i >= 0) rows[i] = row;
  else rows.push(row);
  if (!writePreview(rows)) return { ok: false, code: 'server', error: 'The reply could not be saved. Try again.' };
  return { ok: true, updated: i >= 0 };
}
