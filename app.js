'use strict';

const STORE_KEY = 'usaf_cert_tracker_v1';
const PRESETS = ['CDL / Driver License', 'DOT Medical Card', 'Hazmat Endorsement', 'Tanker Endorsement', 'Other'];

const REMIND = { expired: 0, critical: 14, warning: 30, ok: 90 };

/* ============================== State ============================== */

let drivers = [];
let currentDriverId = null;

/* ============================== Storage (IndexedDB + fallback) ============================== */

const DB_NAME = 'usaf_cert_tracker_db';
const canIdb = typeof indexedDB !== 'undefined';
let dbReady = idbOpen();
let _writeQueue = Promise.resolve();

function idbOpen() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

async function idbGet(key) {
  try {
    const db = await dbReady;
    return await new Promise((resolve) => {
      const req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  } catch (e) { return null; }
}

async function idbSet(key, value) {
  try {
    const db = await dbReady;
    return await new Promise((resolve) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

function loadLegacy() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
  catch (e) { return []; }
}

function persist() {
  const snapshot = JSON.parse(JSON.stringify(drivers));
  if (canIdb) {
    _writeQueue = _writeQueue.then(() => idbSet(STORE_KEY, snapshot)).catch(() => {});
    return _writeQueue;
  }
  try { localStorage.setItem(STORE_KEY, JSON.stringify(snapshot)); }
  catch (e) { toast('Storage is full.'); }
  return Promise.resolve();
}

async function initStorage() {
  drivers = canIdb ? (await idbGet(STORE_KEY)) || [] : loadLegacy();
  if (canIdb && !drivers.length) {
    const legacy = loadLegacy();
    if (legacy.length) { drivers = legacy; await persist(); }
  }
}

/* ============================== Driver Roster (shared) ============================== */
// usaf_roster_db / usaf_roster_v1 — the SAME IndexedDB all six AutoForce apps read,
// so a driver profile added in the Driver Hub autofills here too.
const ROSTER_DB = 'usaf_roster_db';
const ROSTER_KEY = 'usaf_roster_v1';
let roster = [];

function rosterOpen() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(ROSTER_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

async function rosterGet() {
  try {
    const db = await rosterOpen();
    return await new Promise((resolve) => {
      const req = db.transaction('kv', 'readonly').objectStore('kv').get(ROSTER_KEY);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (e) { return []; }
}

function rosterPut(list) {
  const snapshot = JSON.parse(JSON.stringify(list));
  if (canIdb) {
    return rosterOpen().then((db) => new Promise((resolve) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(snapshot, ROSTER_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    })).catch(() => {});
  }
  try { localStorage.setItem(ROSTER_DB + ':' + ROSTER_KEY, JSON.stringify(snapshot)); } catch (e) {}
  return Promise.resolve();
}

function rosterFind(name) {
  const n = String(name || '').trim().toLowerCase();
  return roster.find((r) => String(r.name || '').trim().toLowerCase() === n) || null;
}

function rosterUpsert(entry) {
  const name = String((entry && entry.name) || '').trim();
  if (!name) return;
  const existing = rosterFind(name);
  if (existing) {
    for (const k of ['license', 'warehouse', 'hireDate', 'trainer']) {
      const v = String((entry && entry[k]) || '').trim();
      if (v) existing[k] = v;
    }
  } else {
    roster.push({
      name,
      license: String((entry && entry.license) || '').trim(),
      warehouse: String((entry && entry.warehouse) || '').trim(),
      hireDate: String((entry && entry.hireDate) || '').trim(),
      trainer: String((entry && entry.trainer) || '').trim(),
    });
  }
  rosterPut(roster);
}

function ensureRosterDatalist() {
  let dl = document.getElementById('roster-names');
  if (!dl) {
    dl = el('datalist', { id: 'roster-names' });
    document.body.appendChild(dl);
  }
  dl.innerHTML = '';
  for (const r of roster) dl.appendChild(el('option', { value: r.name }));
  return dl;
}

function rosterField(labelText, id, value, fields, extra = {}) {
  const input = el('input', { type: 'text', id, value, list: 'roster-names', autocomplete: 'off', ...extra });
  const fill = () => {
    const r = rosterFind(input.value);
    if (!r) return;
    for (const [fid, prop] of Object.entries(fields)) {
      const n = document.getElementById(fid);
      if (n && !n.value) n.value = r[prop] || '';
    }
  };
  input.addEventListener('input', fill);
  input.addEventListener('change', fill);
  return el('label', { class: 'field' }, [el('span', { class: 'field-label' }, [labelText]), input]);
}

/* ============================== Model helpers ============================== */

function newDriver() {
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: '', driverId: '', certs: [] };
}

function newCert(label, expiry, notes) {
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), label: label || 'Other', expiry: expiry || '', notes: notes || '' };
}

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function daysLeft(cert) {
  if (!cert.expiry) return null;
  const e = new Date(cert.expiry + 'T00:00:00');
  const t = new Date(todayISO() + 'T00:00:00');
  return Math.round((e - t) / 86400000);
}

function certStatus(cert) {
  const d = daysLeft(cert);
  if (d === null) return 'unknown';
  if (d < 0) return 'expired';
  if (d <= REMIND.critical) return 'critical';
  if (d <= REMIND.warning) return 'warning';
  return 'ok';
}

const STATUS_META = {
  expired: { label: 'EXPIRED', cls: 'st-expired' },
  critical: { label: 'CRITICAL', cls: 'st-critical' },
  warning: { label: 'WARNING', cls: 'st-warning' },
  ok: { label: 'OK', cls: 'st-ok' },
  unknown: { label: 'NO DATE', cls: 'st-unknown' },
};

function daysText(cert) {
  const d = daysLeft(cert);
  if (d === null) return 'no expiry set';
  if (d < 0) return Math.abs(d) + ' day(s) expired';
  if (d === 0) return 'expires today';
  return d + ' day(s) left';
}

function currentDriver() {
  return drivers.find((d) => d.id === currentDriverId) || null;
}

/* ============================== UI helpers ============================== */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function toast(msg, ms = 2400) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function badgeFor(cert) {
  const m = STATUS_META[certStatus(cert)];
  return el('span', { class: 'badge ' + m.cls }, [m.label]);
}

/* ============================== Screen: Dashboard ============================== */

function renderHome() {
  const view = document.getElementById('view');
  view.innerHTML = '';

  const allCerts = [];
  for (const d of drivers) for (const c of d.certs) allCerts.push({ driver: d, cert: c });

  const nExpired = allCerts.filter((x) => certStatus(x.cert) === 'expired').length;
  const nCritical = allCerts.filter((x) => certStatus(x.cert) === 'critical').length;
  const nWarning = allCerts.filter((x) => certStatus(x.cert) === 'warning').length;
  const nOk = allCerts.length - nExpired - nCritical - nWarning;

  const summary = el('div', { class: 'summary' }, [
    statCard('Expired', nExpired, 'st-expired'),
    statCard('Critical', nCritical, 'st-critical'),
    statCard('Soon', nWarning, 'st-warning'),
    statCard('Good', nOk, 'st-ok'),
  ]);
  view.appendChild(summary);

  view.appendChild(el('div', { class: 'actions home-actions' }, [
    el('button', { class: 'btn primary big', onclick: addDriver }, ['+ Add Driver']),
    el('button', { class: 'btn ghost big', onclick: exportAll }, ['Backup']),
  ]));

  if (!drivers.length) {
    view.appendChild(el('div', { class: 'empty' }, [
      'No drivers yet. Add a driver, then add their certs (CDL, medical card, hazmat…) with expiration dates. The tracker will flag anything getting close.',
    ]));
    return;
  }

  // Reminder list: all certs sorted by soonest expiry, problems first
  const sorted = [...allCerts].sort((a, b) => {
    const rank = { expired: 0, critical: 1, warning: 2, unknown: 3, ok: 4 };
    const r = rank[certStatus(a.cert)] - rank[certStatus(b.cert)];
    return r || (daysLeft(a.cert) ?? 9999) - (daysLeft(b.cert) ?? 9999);
  });

  const list = el('div', { class: 'rec-list' });
  list.appendChild(el('h2', { class: 'page-title', style: 'margin:14px 0 10px' }, ['Reminder List']));
  for (const { driver, cert } of sorted) {
    const m = STATUS_META[certStatus(cert)];
    list.appendChild(el('div', { class: 'card rec', onclick: () => openDriver(driver.id) }, [
      el('div', { class: 'rec-main' }, [
        el('div', { class: 'rec-name' }, [driver.name || '(no name)']),
        el('div', { class: 'rec-meta' }, [cert.label + '  •  ' + (cert.expiry || 'no date')]),
      ]),
      el('div', { class: 'rec-sub' }, [
        badgeFor(cert),
        el('span', { class: 'days' + (m.cls === 'st-ok' ? '' : ' alert') }, [daysText(cert)]),
      ]),
    ]));
  }
  view.appendChild(list);
}

function statCard(label, count, cls) {
  return el('div', { class: 'stat ' + cls }, [
    el('strong', {}, [String(count)]),
    el('span', {}, [label]),
  ]);
}

function addDriver() {
  const d = newDriver();
  drivers.push(d);
  persist();
  currentDriverId = d.id;
  renderDriver();
}

function deleteDriver(id) {
  const d = drivers.find((x) => x.id === id);
  if (!d) return;
  if (!confirm('Delete driver \u201C' + (d.name || 'unnamed') + '\u201D and all their certs?')) return;
  drivers = drivers.filter((x) => x.id !== id);
  persist();
  renderHome();
}

function exportAll() {
  if (!drivers.length) { toast('Nothing to back up yet.'); return; }
  download('cert-tracker-' + todayISO() + '.json', JSON.stringify(drivers, null, 2));
}

/* ============================== Screen: Driver ============================== */

function openDriver(id) {
  currentDriverId = id;
  renderDriver();
}

function renderDriver() {
  const view = document.getElementById('view');
  view.innerHTML = '';
  const d = currentDriver();
  if (!d) { renderHome(); return; }

  view.appendChild(el('div', { class: 'route-head' }, [
    el('button', { class: 'btn ghost small', onclick: renderHome }, ['\u2190 Dashboard']),
    el('button', { class: 'btn primary small', onclick: () => openPrint(d) }, ['Print / PDF']),
  ]));

  ensureRosterDatalist();
  view.appendChild(el('div', { class: 'card' }, [
    rosterField('Driver Name', 'driverName', d.name, { driverId: 'license' }, { placeholder: 'Full name', oninput: (e) => { d.name = e.target.value; persist(); if (d.driverId) rosterUpsert({ name: d.name, license: d.driverId }); } }),
    el('div', { class: 'field' }, [
      el('span', { class: 'field-label' }, ['Driver ID# / Lic.#']),
      el('input', { type: 'text', id: 'driverId', placeholder: 'e.g. 4412', value: d.driverId, oninput: (e) => { d.driverId = e.target.value; persist(); if (d.name) rosterUpsert({ name: d.name, license: d.driverId }); } }),
    ]),
    el('button', { class: 'btn ghost small danger', onclick: () => deleteDriver(d.id) }, ['Delete driver']),
  ]));

  const list = el('div', { class: 'cert-list' });
  list.appendChild(el('h2', { class: 'page-title', style: 'margin:6px 0 10px' }, ['Certifications (' + d.certs.length + ')']));
  if (!d.certs.length) {
    list.appendChild(el('div', { class: 'empty small' }, ['No certs yet. Add one below.']));
  }
  for (const c of d.certs) list.appendChild(certCard(d, c));
  view.appendChild(list);

  // Add-cert form
  const addLabel = el('select', { id: 'newCertLabel' });
  for (const p of PRESETS) addLabel.appendChild(el('option', { value: p }, [p]));
  const addDate = el('input', { type: 'date', id: 'newCertDate', value: '' });
  const addNotes = el('input', { type: 'text', id: 'newCertNotes', placeholder: 'Notes (optional)' });

  view.appendChild(el('div', { class: 'card add-cert' }, [
    el('h2', { class: 'card-title' }, ['Add Certification']),
    el('div', { class: 'field' }, [el('span', { class: 'field-label' }, ['Type']), addLabel]),
    el('div', { class: 'field' }, [el('span', { class: 'field-label' }, ['Expiration Date']), addDate]),
    el('div', { class: 'field' }, [el('span', { class: 'field-label' }, ['Notes (optional)']), addNotes]),
    el('button', { class: 'btn primary big', onclick: () => addCert(d) }, ['Add Certification']),
  ]));
}

function certCard(d, c) {
  const m = STATUS_META[certStatus(c)];
  return el('div', { class: 'card cert' }, [
    el('div', { class: 'cert-head' }, [
      el('div', {}, [
        el('div', { class: 'cert-label' }, [c.label]),
        el('div', { class: 'cert-meta' }, ['Expires: ' + (c.expiry || 'not set')]),
      ]),
      badgeFor(c),
    ]),
    el('div', { class: 'cert-days ' + m.cls }, [daysText(c)]),
    el('div', { class: 'field' }, [
      el('span', { class: 'field-label' }, ['Type']),
      el('select', { onchange: (e) => { c.label = e.target.value; persist(); } }, PRESETS.map((p) => el('option', { value: p, selected: p === c.label }, [p]))),
    ]),
    el('div', { class: 'field' }, [
      el('span', { class: 'field-label' }, ['Expiration Date']),
      el('input', { type: 'date', value: c.expiry, onchange: (e) => { c.expiry = e.target.value; persist(); renderDriver(); } }),
    ]),
    el('div', { class: 'field' }, [
      el('span', { class: 'field-label' }, ['Notes']),
      el('input', { type: 'text', value: c.notes, placeholder: 'Card #, restrictions, etc.', oninput: (e) => { c.notes = e.target.value; persist(); } }),
    ]),
    el('button', { class: 'btn ghost small danger', onclick: () => { d.certs = d.certs.filter((x) => x.id !== c.id); persist(); renderDriver(); } }, ['Remove cert']),
  ]);
}

function addCert(d) {
  const label = document.getElementById('newCertLabel').value;
  const expiry = document.getElementById('newCertDate').value;
  const notes = document.getElementById('newCertNotes').value;
  if (!expiry) { toast('Pick an expiration date.'); return; }
  d.certs.push(newCert(label, expiry, notes));
  persist();
  renderDriver();
  toast('Cert added.');
}

/* ============================== Print / PDF ============================== */

function openPrint(d) {
  const w = window.open('', '_blank');
  if (!w) { toast('Popup blocked. Allow popups for this site.'); return; }
  w.document.open();
  w.document.write(printHtml());
  w.document.close();
}

function printHtml() {
  const sorted = [...drivers].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const driverRows = [];
  for (const d of sorted) {
    const certs = d.certs.slice().sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'));
    if (!certs.length) {
      driverRows.push('<section class="driver"><h3>' + esc(d.name || '(unnamed)') + (d.driverId ? ' <span class="did">#' + esc(d.driverId) + '</span>' : '') + '</h3><table><tr><td>No certifications on file</td></tr></table></section>');
      continue;
    }
    const rows = certs.map((c) => {
      const m = STATUS_META[certStatus(c)];
      return '<tr class="' + m.cls + '"><td class="lab">' + esc(c.label) + '</td>' +
        '<td class="date">' + esc(c.expiry) + '</td>' +
        '<td class="days">' + esc(daysText(c)) + '</td>' +
        '<td class="stat">' + m.label + '</td></tr>';
    }).join('');
    driverRows.push('<section class="driver"><h3>' + esc(d.name || '(unnamed)') + (d.driverId ? ' <span class="did">#' + esc(d.driverId) + '</span>' : '') + '</h3><table>' +
      '<tr class="hdr"><th>Certification</th><th>Expires</th><th>Status</th><th>Flag</th></tr>' + rows + '</table></section>');
  }

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Certification & Expiry Report</title>' +
    '<style>' +
    '@page { size: Letter; margin: 12mm 11mm; }' +
    'body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; margin: 0; }' +
    '.head { text-align: center; margin-bottom: 12px; border-bottom: 2px solid #333; padding-bottom: 8px; }' +
    '.head h1 { font-size: 19px; margin: 0 0 2px; }' +
    '.head p { margin: 0; font-size: 11px; color: #444; }' +
    '.driver { page-break-inside: avoid; margin-bottom: 14px; border: 1px solid #333; }' +
    '.driver h3 { margin: 0; padding: 6px 8px; background: #fdf0dc; border-bottom: 1px solid #333; font-size: 13px; }' +
    '.did { color: #666; font-weight: 400; }' +
    'table { width: 100%; border-collapse: collapse; }' +
    'td, th { padding: 5px 8px; border: 1px solid #ccc; font-size: 12px; text-align: left; }' +
    'tr.hdr th { background: #eee; font-size: 11px; }' +
    'td.date { width: 16%; } td.days { width: 22%; } td.stat { width: 12%; font-weight: 700; }' +
    'tr.st-expired td { background: #fdecec; } tr.st-critical td { background: #fff0e0; }' +
    'tr.st-warning td { background: #fffbe6; } tr.st-ok td { background: #f0fbf0; }' +
    '.foot { margin-top: 16px; font-size: 9.5px; color: #555; border-top: 1px solid #aaa; padding-top: 5px; }' +
    '.sig { margin-top: 36px; display: flex; gap: 40px; } .sig div { flex: 1; border-top: 1px solid #333; padding-top: 3px; font-size: 10px; color: #444; }' +
    '</style></head><body>' +
    '<div class="head"><h1>Driver Certification &amp; Expiry Report</h1><p>Generated: <strong>' + esc(todayISO()) + '</strong> &bull; U.S. AutoForce &bull; Confidential</p></div>' +
    driverRows.join('') +
    '<div class="sig"><div>TRAINER / SUPERVISOR SIGNATURE</div><div>DATE</div></div>' +
    '<div class="foot">Flag legend: EXPIRED = must renew before driving &bull; CRITICAL = expires within ' + REMIND.critical + ' days &bull; WARNING = expires within ' + REMIND.warning + ' days &bull; OK = valid. U.S. AutoForce &bull; Confidential</div>' +
    '</body></html>';
}

/* ============================== Boot ============================== */

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

initStorage().then(() => {
  renderHome();
  registerSW();
});
