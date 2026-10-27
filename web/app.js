// UI, rendering and state. All user text goes into the DOM via textContent, never innerHTML.
import CONFIG from './config.js';
import * as api from './api.js';
import {
  STATUSES, STATUS_LABELS, LIMITS, validateReply, computeTotals, branchCoverage, sortForList,
  partySize, messagesForWall, isClosed, closedMessage, formatIsoDate, contactText, usesBranches,
} from './logic.js';

const REFRESH_MS = 60000;
const COOLDOWN_MS = 10000; // BR-11
const LAST_REPLY_KEY = 'rsvp:last-reply';
const LAST_SENT_KEY = 'rsvp:last-sent';
const SAVE_ERROR = "Your reply wasn't sent. Check your connection and try again.";
const RULES = { branches: CONFIG.branches, otherBranch: CONFIG.otherBranchLabel };

const $ = (id) => document.getElementById(id);
const form = $('form');
const send = $('send');

let lastLoadAt = 0;
let loading = false;
let sending = false;
let closed = false;
let cooldownTimer = null;

// ---------- Small helpers ----------

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null && c !== '') node.append(c); // strings become text nodes
  return node;
}

const storage = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: not remembered */ }
  },
};

const firstName = (name) => String(name).split(' ')[0];
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const pageUrl = () => CONFIG.siteUrl || location.origin + location.pathname;

function shareHref() {
  const where = CONFIG.venue ? ` at ${CONFIG.venue}` : ' at home';
  const text = `Karibu nyumbani! The family of ${CONFIG.grandfather} & ${CONFIG.grandmother} is gathering${where}: ${CONFIG.date}.\n`
    + `Tap to say if you're coming: ${pageUrl()}\n`
    + 'Please forward to everyone in your household.';
  return 'https://wa.me/?text=' + encodeURIComponent(text);
}

// ---------- Static content from config ----------

function fillEventDetails() {
  for (const node of document.querySelectorAll('[data-cfg]')) node.textContent = CONFIG[node.dataset.cfg] ?? '';
  $('host-row').hidden = !CONFIG.host;
  document.querySelector('.jina').hidden = !CONFIG.saying;
  $('branch-field').hidden = !usesBranches(RULES);
  $('branches').hidden = !usesBranches(RULES);
  if (!CONFIG.showPublicLists) $('who-title').textContent = 'Replies so far';
  if (!CONFIG.showPublicMessages || !CONFIG.showPublicLists) {
    $('message-label').textContent = 'A message for the hosts';
  }
  if (CONFIG.mapsUrl) {
    $('directions').href = CONFIG.mapsUrl;
    $('directions').hidden = false;
  }
  for (const b of [...CONFIG.branches, CONFIG.otherBranchLabel].filter(Boolean)) {
    $('branch').append(new Option(b, b));
  }
  if (CONFIG.rsvpDeadline) {
    $('deadline-note').textContent = `Please reply by ${formatIsoDate(CONFIG.rsvpDeadline)}.`;
    $('deadline-note').hidden = false;
  }
  const contact = $('contact');
  if (CONFIG.contact?.name) {
    contact.append(`Questions? Call ${CONFIG.contact.name}`);
    if (CONFIG.contact.phone) {
      contact.append(' on ', el('a', { href: 'tel:' + CONFIG.contact.phone.replace(/[^\d+]/g, '') }, CONFIG.contact.phone));
    }
    contact.append('.');
  }
  $('share').href = shareHref();
  $('share-footer').href = shareHref();
  $('preview-banner').hidden = !api.previewMode;
}

// ---------- Form ----------

function readForm() {
  const data = new FormData(form);
  return {
    name: data.get('name') ?? '',
    branch: data.get('branch') ?? '',
    status: data.get('status') ?? '',
    adults: data.get('adults') ?? '',
    children: data.get('children') ?? '',
    message: data.get('message') ?? '',
    website: data.get('website') ?? '',
  };
}

function fillForm(reply) {
  form.elements.name.value = reply.name;
  form.elements.branch.value = reply.branch;
  for (const radio of form.elements.status) radio.checked = radio.value === reply.status;
  form.elements.adults.value = reply.status === 'declined' ? 1 : reply.adults;
  form.elements.children.value = reply.status === 'declined' ? 0 : reply.children;
  form.elements.message.value = reply.message || '';
  syncCounts();
  syncMessageCount();
}

function syncCounts() {
  $('counts').hidden = form.elements.status.value === 'declined'; // FR-04
}

function syncMessageCount() {
  $('message-count').textContent = `${form.elements.message.value.length} / ${LIMITS.messageMax}`;
}

function clearErrors() {
  for (const field of ['name', 'branch', 'status']) {
    $(`${field}-error`).hidden = true;
    $(`${field}-error`).textContent = '';
  }
  for (const n of form.querySelectorAll('[aria-invalid]')) n.removeAttribute('aria-invalid');
  $('form-error').hidden = true;
}

function showFieldError(field, message) {
  const box = $(`${field}-error`);
  if (!box) return showFormError(message);
  box.textContent = message;
  box.hidden = false;
  const target = field === 'status' ? form.elements.status[0] : form.elements[field];
  if (field !== 'status') target.setAttribute('aria-invalid', 'true');
  target.focus();
}

function showFormError(message) {
  $('form-error').textContent = message;
  $('form-error').hidden = false;
}

function setSendLabel() {
  const wait = Math.ceil(((storage.get(LAST_SENT_KEY) || 0) + COOLDOWN_MS - Date.now()) / 1000);
  const coolingDown = wait > 0;
  send.disabled = sending || coolingDown;
  send.textContent = sending ? 'Sending…' : coolingDown ? `Send my reply (wait ${wait} s)` : 'Send my reply';
  if (!coolingDown && cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
  return coolingDown;
}

function startCooldown() {
  storage.set(LAST_SENT_KEY, Date.now());
  if (!cooldownTimer) cooldownTimer = setInterval(setSendLabel, 1000);
  setSendLabel();
}

async function onSubmit(event) {
  event.preventDefault();
  if (sending || closed || setSendLabel()) return;
  clearErrors();

  const input = readForm();
  const v = validateReply(input, RULES);
  if (!v.ok) return showFieldError(v.field, v.error);
  if (v.spam) return; // a bot filled the honeypot; send nothing

  sending = true;
  setSendLabel();
  try {
    const res = await api.sendReply({ ...v.reply, website: '' });
    if (res?.ok) {
      storage.set(LAST_REPLY_KEY, v.reply); // BR-04
      startCooldown();
      showConfirmation(v.reply, false);
      refresh();
    } else if (res?.code === 'validation') {
      showFieldError(res.field, res.error);
    } else if (res?.code === 'closed') {
      setClosed(res.error);
    } else {
      showFormError(res?.error || SAVE_ERROR);
    }
  } catch {
    showFormError(SAVE_ERROR); // offline or timed out; the form keeps its values
  } finally {
    sending = false;
    setSendLabel();
  }
}

function stepCount(button) {
  const input = $(button.dataset.target);
  const min = Number(input.min);
  const max = Number(input.max);
  const current = input.value === '' ? min : Number(input.value) || min;
  input.value = Math.min(max, Math.max(min, current + Number(button.dataset.step)));
}

// ---------- Confirmation (FR-11, FR-06) ----------

const THANKS = {
  attending: 'See you at home!',
  tentative: 'We hope you can make it.',
  declined: 'You will be missed.',
};

function showConfirmation(reply, returning) {
  const title = returning
    ? `Welcome back, ${firstName(reply.name)}.`
    : `Thanks, ${firstName(reply.name)}. ${THANKS[reply.status]}`;
  $('confirm-title').textContent = title;

  const list = $('confirm-list');
  list.textContent = '';
  list.append(`${returning ? 'Your reply puts you' : 'You are'} on the `, el('strong', {}, STATUS_LABELS[reply.status]), ' list');
  const size = partySize(reply);
  list.append(size ? `, for ${size}.` : '.');
  if (reply.status === 'tentative') list.append(' Come back and change your reply once you know.');

  form.hidden = true;
  $('confirmation').hidden = false;
  if (!returning) $('confirmation').focus();
}

function changeReply() {
  const last = storage.get(LAST_REPLY_KEY);
  if (last) fillForm(last);
  $('confirmation').hidden = true;
  form.hidden = closed;
  setSendLabel();
  form.elements.name.focus();
}

function setClosed(message) {
  closed = true;
  const text = message
    || closedMessage(formatIsoDate(CONFIG.rsvpDeadline), contactText(CONFIG.contact));
  $('closed').textContent = text;
  $('closed').hidden = false;
  form.hidden = true;
  $('change').hidden = true;
  $('deadline-note').hidden = true;
}

// ---------- Lists, totals, branches, messages ----------

function renderTotals(t) {
  const box = $('totals');
  box.textContent = '';
  box.append(
    el('strong', {}, plural(t.coming, 'person', 'people') + ' coming'),
    ` (${plural(t.adults, 'adult', 'adults')}, ${plural(t.children, 'child', 'children')})`,
    ` · ${t.mightCome} might come · ${t.declined} can't make it`,
  );
}

function renderLists(rows) {
  const groups = sortForList(rows, CONFIG.branches);
  for (const status of STATUSES) {
    const box = document.querySelector(`.list[data-status="${status}"]`);
    box.querySelector('.count').textContent = groups[status].length;
    const ul = box.querySelector('ul');
    ul.textContent = '';
    if (groups[status].length === 0) {
      ul.append(el('li', { class: 'empty' }, 'No replies yet'));
      continue;
    }
    for (const r of groups[status]) {
      const size = partySize(r);
      ul.append(el('li', {},
        el('span', { class: 'who' }, r.name),
        el('span', { class: 'meta' }, [r.branch, size].filter(Boolean).join(' · '))));
    }
  }
}

function renderCoverage(coverage) {
  const body = $('branch-rows');
  body.textContent = '';
  for (const c of coverage) {
    const replies = c.noReplies ? el('span', { class: 'no-replies' }, 'No replies yet') : String(c.replies);
    body.append(el('tr', { class: c.noReplies ? 'is-gap' : '' },
      el('td', {}, c.branch),
      el('td', { class: 'num' }, replies),
      el('td', { class: 'num' }, String(c.coming))));
  }
}

function renderMessages(rows) {
  const messages = CONFIG.showPublicMessages ? messagesForWall(rows) : [];
  const list = $('message-list');
  list.textContent = '';
  for (const r of messages) {
    list.append(el('figure', { class: 'quote' },
      el('blockquote', {}, r.message),
      el('figcaption', {}, [r.name, r.branch].filter(Boolean).join(', '))));
  }
  $('messages').hidden = messages.length === 0;
}

function render(data) {
  if (Array.isArray(data.rows)) {
    renderTotals(computeTotals(data.rows));
    renderLists(data.rows);
    renderCoverage(branchCoverage(data.rows, CONFIG.branches));
    renderMessages(data.rows);
    $('lists').hidden = false;
    $('private-note').hidden = true;
  } else {
    // BR-10: the server sent counts only.
    renderTotals(data.totals);
    renderCoverage(data.coverage);
    $('lists').hidden = true;
    $('messages').hidden = true;
    $('private-note').hidden = false;
  }
  if (data.closed && !closed) setClosed();
}

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const data = await api.fetchReplies();
    if (!data?.ok) throw new Error(data?.error || 'Bad response');
    render(data);
    lastLoadAt = Date.now();
    $('load-error').hidden = true;
    $('refreshed').textContent = 'List updated at '
      + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '.';
  } catch {
    $('load-error').hidden = false;
    if (!lastLoadAt) $('totals').textContent = '';
  } finally {
    loading = false;
  }
}

// ---------- Start ----------

function init() {
  fillEventDetails();

  for (const status of STATUSES) {
    for (const ul of document.querySelectorAll(`.list[data-status="${status}"] ul`)) {
      ul.append(el('li', { class: 'empty' }, 'Loading replies…'));
    }
  }

  form.addEventListener('submit', onSubmit);
  form.addEventListener('change', (e) => {
    if (e.target.name === 'status') syncCounts();
    const box = $(`${e.target.name}-error`);
    if (box) { box.hidden = true; e.target.removeAttribute('aria-invalid'); }
  });
  form.elements.message.addEventListener('input', syncMessageCount);
  for (const b of form.querySelectorAll('.step')) b.addEventListener('click', () => stepCount(b));
  $('change').addEventListener('click', changeReply);

  if (isClosed(CONFIG.rsvpDeadline)) setClosed();

  const last = storage.get(LAST_REPLY_KEY);
  if (last && STATUSES.includes(last.status)) {
    fillForm(last);
    showConfirmation(last, true);
  }
  if (setSendLabel()) cooldownTimer = setInterval(setSendLabel, 1000);

  refresh();
  setInterval(refresh, REFRESH_MS); // FR-14
  const refreshIfStale = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastLoadAt > 5000) refresh();
  };
  document.addEventListener('visibilitychange', refreshIfStale);
  window.addEventListener('focus', refreshIfStale);
}

init();
