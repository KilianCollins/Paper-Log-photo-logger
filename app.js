// Well Photo Log — screens. Ported from reference/Index.html: same markup,
// same copy, same behaviour. google.script.run calls are replaced with
// Drive.*, auth is handled by Auth, images are Blobs (object URLs) instead
// of base64 data URIs, and photos/status never touch anything but Drive and
// the in-memory session.

var WELLS = [], SLOTS = [], STATUS = {}, ROOT = '', LAST = null, STATUS_LOADED = false;
var PENDING = [], PENDING_WELL = null;
var CURRENT_SCREEN = 'list'; // list | well | review — background status refreshes must not hijack navigation

function el(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
function wellById(id) { for (var i = 0; i < WELLS.length; i++) if (WELLS[i].id === id) return WELLS[i]; return null; }
function slotById(id) { for (var i = 0; i < SLOTS.length; i++) if (SLOTS[i].id === id) return SLOTS[i]; return null; }

function veil(html, cls) {
  hideVeil();
  var v = document.createElement('div');
  v.className = 'veil' + (cls ? ' ' + cls : '');
  v.id = 'veil'; v.innerHTML = html;
  document.body.appendChild(v);
  return v;
}
function hideVeil() { var v = el('veil'); if (v) v.remove(); }
function toast(msg, ms) {
  var old = el('toast'); if (old) old.remove();
  var t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { if (t.parentNode) t.remove(); }, ms || 4200);
}

function isReq(sl) { return sl.required !== false; }
function count(w, s) { return (STATUS[w] && STATUS[w][s]) || 0; }
function slotDone(w, s) { return count(w, s) > 0; }
function wellDone(w) {
  for (var i = 0; i < SLOTS.length; i++)
    if (isReq(SLOTS[i]) && !slotDone(w, SLOTS[i].id)) return false;
  return true;
}
function firstGap(wid) {
  for (var i = 0; i < SLOTS.length; i++)
    if (isReq(SLOTS[i]) && !slotDone(wid, SLOTS[i].id)) return SLOTS[i].id;
  for (var j = 0; j < SLOTS.length; j++)
    if (!slotDone(wid, SLOTS[j].id)) return SLOTS[j].id;
  return SLOTS[0].id;
}
function barLegend() {
  var names = [];
  for (var i = 0; i < SLOTS.length; i++)
    names.push(SLOTS[i].label.toLowerCase() + (isReq(SLOTS[i]) ? '' : ' (optional)'));
  return names.join(', ');
}
function tally() {
  if (!STATUS_LOADED) { el('tally').textContent = 'Reading Drive… · ' + ROOT; return; }
  var d = 0;
  for (var i = 0; i < WELLS.length; i++) if (wellDone(WELLS[i].id)) d++;
  el('tally').textContent = d + ' of ' + WELLS.length + ' wells complete · ' + ROOT;
}

/* ================= list ================= */
function renderList() {
  CURRENT_SCREEN = 'list';
  var html = '';
  if (STATUS_LOADED && LAST && wellById(LAST) && !wellDone(LAST)) {
    html += '<div class="resume" id="resume"><div>' +
              '<div class="k">Pick up where you left off</div>' +
              '<div class="v">' + esc(wellById(LAST).name) + '</div></div>' +
              '<div class="go">&rarr;</div></div>';
  }
  for (var i = 0; i < WELLS.length; i++) {
    var w = WELLS[i], beds = '';
    for (var s = 0; s < SLOTS.length; s++) {
      if (!STATUS_LOADED) {
        beds += '<div class="bed loading ' + (isReq(SLOTS[s]) ? '' : 'opt') + '"></div>';
      } else {
        beds += '<div class="bed ' + (isReq(SLOTS[s]) ? '' : 'opt ') +
                (slotDone(w.id, SLOTS[s].id) ? 'on' : '') + '"></div>';
      }
    }
    var cardClass = !STATUS_LOADED ? 'pending' : (wellDone(w.id) ? 'done' : '');
    html += '<div class="card ' + cardClass + '" data-well="' + esc(w.id) + '">' +
              '<div class="grow"><div class="name">' + esc(w.name) + '</div>' +
              '<div class="api">' + esc(w.api) + (w.note ? ' · ' + esc(w.note) : '') + '</div></div>' +
              '<div class="gauge">' + beds + '</div></div>';
  }
  el('view').innerHTML = html +
    '<button class="send" id="refresh">Refresh from Drive</button>' +
    '<p class="note">Bars are ' + esc(barLegend()) + ', top to bottom. A dashed bar is ' +
    'optional and does not hold a well back from counting as complete. Nothing is kept on ' +
    'this phone — it all lives in your Drive folder &ldquo;' + esc(ROOT) + '&rdquo;.</p>';

  if (el('resume')) el('resume').addEventListener('click', function () { renderWell(LAST); });
  var cards = document.querySelectorAll('[data-well]');
  for (var c = 0; c < cards.length; c++) {
    (function (n) { n.addEventListener('click', function () { renderWell(n.getAttribute('data-well')); }); })(cards[c]);
  }
  el('refresh').addEventListener('click', refresh);
  tally();
}

function refresh() {
  veil('<div class="ring"></div><div class="big">Reading Drive&hellip;</div>');
  Drive.fetchStatus(WELLS, SLOTS).then(function (st) {
    STATUS = st; STATUS_LOADED = true; hideVeil(); renderList();
  }).catch(function (e) {
    hideVeil(); toast('Could not reach Drive: ' + e.message, 6000);
  });
}

function refreshStatusBackground() {
  Drive.fetchStatus(WELLS, SLOTS).then(function (st) {
    STATUS = st; STATUS_LOADED = true;
    // Only repaint if the user is still on the list — a background refresh
    // must never yank someone out of the well page or the review screen.
    if (CURRENT_SCREEN === 'list') { LAST = Storage.getLastWell(); renderList(); }
  }).catch(function (e) {
    toast('Could not reach Drive: ' + e.message, 6000);
  });
}

/* ================= well ================= */
function renderWell(wid) {
  var w = wellById(wid);
  if (!w) { renderList(); return; }
  CURRENT_SCREEN = 'well';
  LAST = wid;
  Storage.setLastWell(wid);

  var slots = '';
  for (var s = 0; s < SLOTS.length; s++) {
    var sl = SLOTS[s], n = count(wid, sl.id), opt = !isReq(sl);
    slots += '<div class="slot ' + (opt ? 'opt ' : '') + (n ? 'on' : '') + '">' +
      '<div class="slabel">' + esc(sl.label) +
        '<span class="req' + (opt && !n ? ' opt' : '') + '">' +
        (n ? n + ' in Drive' : (opt ? 'optional' : 'required')) + '</span></div>' +
      '<div class="shint">' + esc(sl.hint) + '</div></div>';
  }

  el('view').innerHTML =
    '<div class="topbar"><button class="back" id="back">&larr; All wells</button>' +
    '<div class="who">' + esc(w.name) + '</div></div>' +
    '<div class="wellhead"><h2>' + esc(w.name) + '</h2>' +
    '<div class="meta">' + esc(w.api) + (w.note ? ' · ' + esc(w.note) : '') + '</div></div>' +
    slots +
    '<div class="addbox"><h3>Add photos to this well</h3>' +
      '<button type="button" class="pick" id="srcCamera">Camera</button>' +
      '<label class="pick ghost">Photos &amp; gallery' +
        '<input type="file" accept="image/*" multiple id="srcGallery"></label>' +
      '<label class="alt">or Files, Drive or Google Photos' +
        '<input type="file" multiple id="srcFiles"></label>' +
    '</div>' +
    '<button class="send" id="open">Open this well’s Drive folder</button>' +
    '<p class="note">You will see every photo and choose its slot before anything uploads.</p>' +
    '<button class="send" id="backbtm" style="margin-top:22px">&larr; Back to all wells</button>';

  el('back').addEventListener('click', renderList);
  el('backbtm').addEventListener('click', renderList);
  el('open').addEventListener('click', function () { openFolder(wid); });

  el('srcCamera').addEventListener('click', function () { openCamera(wid); });

  ['srcGallery', 'srcFiles'].forEach(function (id) {
    el(id).addEventListener('change', function () {
      var files = [];
      if (this.files) for (var f = 0; f < this.files.length; f++) files.push(this.files[f]);
      this.value = '';
      if (!files.length) { toast('Nothing selected.'); return; }
      prepare(wid, files);
    });
  });
}

function openCamera(wid) {
  Camera.open(function (items) {
    if (!items.length) { return; }
    PENDING = []; PENDING_WELL = wid;
    var deflt = firstGap(wid);
    items.forEach(function (it) {
      PENDING.push({ blob: it.blob, url: URL.createObjectURL(it.blob), name: it.name, slot: deflt, dropped: false });
    });
    renderReview();
  }, function (message) {
    toast(message, 7000);
  });
}

function openFolder(wid) {
  var w = wellById(wid);
  Drive.folderLink(w).then(function (url) {
    if (url) window.open(url, '_blank');
    else toast('That folder does not exist yet — add a photo first.');
  }).catch(function (e) {
    toast('Could not look that up: ' + e.message);
  });
}

/* ================= prepare then review ================= */
function prepare(wid, files) {
  PENDING = []; PENDING_WELL = wid;
  var i = 0, rejected = [];
  var deflt = firstGap(wid);

  function step() {
    if (i >= files.length) {
      if (rejected.length) toast('Skipped: ' + rejected.join(', '), 6500);
      if (!PENDING.length) { hideVeil(); renderWell(wid); return; }
      hideVeil(); renderReview();
      return;
    }
    veil('<div class="ring"></div><div class="big">Preparing&hellip;</div>' +
         '<div class="small">photo ' + (i + 1) + ' of ' + files.length + '</div>' +
         '<div class="bar"><i style="width:' + Math.round(i / files.length * 100) + '%"></i></div>');
    var f = files[i];
    Resize.shrinkFile(f).then(function (blob) {
      PENDING.push({ blob: blob, url: URL.createObjectURL(blob), name: (f.name || ('photo-' + (i + 1))), slot: deflt, dropped: false });
      i++; step();
    }).catch(function () {
      rejected.push(f.name || ('photo ' + (i + 1)));
      i++; step();
    });
  }
  step();
}

function persistPending() {
  if (!PENDING.length) { Storage.clearPending(); return; }
  var items = PENDING.map(function (p) { return { blob: p.blob, name: p.name, slot: p.slot, dropped: p.dropped }; });
  Storage.savePending(PENDING_WELL, items).catch(function () {});
}

function renderReview() {
  CURRENT_SCREEN = 'review';
  persistPending();
  var w = wellById(PENDING_WELL);
  var live = PENDING.filter(function (p) { return !p.dropped; }).length;
  var html =
    '<div class="topbar"><button class="back" id="cancel">&larr; Cancel, upload nothing</button>' +
    '<div class="who">' + esc(w.name) + '</div></div>' +
    '<div class="wellhead"><h2>Check before uploading</h2>' +
    '<div class="meta">' + esc(w.name) + ' · ' + PENDING.length + ' selected</div></div>' +
    '<p class="note" style="margin:12px 0 16px">This is exactly what will land in Drive, at the ' +
    'size it will be stored. Tap an image to zoom in and check the fine print.</p>';

  for (var i = 0; i < PENDING.length; i++) {
    var p = PENDING[i], chips = '';
    for (var s = 0; s < SLOTS.length; s++) {
      chips += '<div class="chip ' + (p.slot === SLOTS[s].id ? 'sel' : '') + '" ' +
               'data-i="' + i + '" data-slot="' + esc(SLOTS[s].id) + '">' +
               esc(SLOTS[s].label) + '</div>';
    }
    var kb = Math.round(p.blob.size / 1024);
    html += '<div class="rev ' + (p.dropped ? 'dropped' : '') + '">' +
      '<img src="' + p.url + '" data-zoom="' + i + '" alt="">' +
      '<div class="zoomtip">Tap image to zoom</div>' +
      '<div class="body">' +
        '<div class="fn">' + esc(p.name) + ' · ' + kb + ' KB</div>' +
        (p.dropped ? '' : '<div class="chips">' + chips + '</div>') +
        '<button class="drop" data-drop="' + i + '">' +
          (p.dropped ? 'Put this one back' : 'Do not upload this one') + '</button>' +
      '</div></div>';
  }

  html += '<button class="send" id="go" style="background:var(--blue);color:#fff;border-color:var(--blue)">' +
          (live ? 'Upload ' + live + ' photo' + (live > 1 ? 's' : '') + ' to Drive' : 'Nothing selected') +
          '</button>';

  el('view').innerHTML = html;
  window.scrollTo(0, 0);

  el('cancel').addEventListener('click', function () {
    PENDING.forEach(function (p) { URL.revokeObjectURL(p.url); });
    PENDING = []; Storage.clearPending(); renderWell(PENDING_WELL);
  });

  var chipEls = el('view').querySelectorAll('.chip');
  for (var c = 0; c < chipEls.length; c++) {
    (function (n) {
      n.addEventListener('click', function () {
        PENDING[+n.getAttribute('data-i')].slot = n.getAttribute('data-slot');
        renderReview();
      });
    })(chipEls[c]);
  }
  var dropEls = el('view').querySelectorAll('[data-drop]');
  for (var d = 0; d < dropEls.length; d++) {
    (function (n) {
      n.addEventListener('click', function () {
        var p = PENDING[+n.getAttribute('data-drop')];
        p.dropped = !p.dropped;
        renderReview();
      });
    })(dropEls[d]);
  }
  var imgs = el('view').querySelectorAll('[data-zoom]');
  for (var z = 0; z < imgs.length; z++) {
    (function (n) {
      n.addEventListener('click', function () { openZoom(PENDING[+n.getAttribute('data-zoom')]); });
    })(imgs[z]);
  }
  el('go').addEventListener('click', function () {
    var keep = PENDING.filter(function (p) { return !p.dropped; });
    if (!keep.length) { toast('Every photo is marked not to upload.'); return; }
    runQueue(PENDING_WELL, keep);
  });
}

function openZoom(p) {
  var z = document.createElement('div');
  z.className = 'zoom'; z.id = 'zoom';
  z.innerHTML = '<button class="x" id="zx">Close</button>' +
                '<img src="' + p.url + '" alt="">';
  document.body.appendChild(z);
  el('zx').addEventListener('click', function () { z.remove(); });
}

/* ================= upload ================= */
function runQueue(wid, items) {
  var total = items.length, done = 0, failed = [];

  function paint(stage) {
    veil('<div class="ring"></div>' +
      '<div class="big">Uploading&hellip;<br>Please wait</div>' +
      '<div class="small">photo ' + Math.min(done + 1, total) + ' of ' + total + ' · ' + esc(stage) + '</div>' +
      '<div class="bar"><i style="width:' + Math.round(done / total * 100) + '%"></i></div>' +
      '<div class="warn">Do not close this page<br>or lock your phone</div>');
  }

  function next() {
    if (done >= total) { finish(); return; }
    var it = items[done];
    paint(slotById(it.slot).label);
    var w = wellById(wid);
    Drive.uploadPhoto(w, it.slot, it.blob).then(function (res) {
      if (!STATUS[wid]) STATUS[wid] = {};
      STATUS[wid][it.slot] = res.count;
      done++; next();
    }).catch(function (err) {
      failed.push(it.name + ' — ' + (err && err.message ? err.message : 'unknown'));
      done++; next();
    });
  }

  function finish() {
    PENDING.forEach(function (p) { URL.revokeObjectURL(p.url); });
    PENDING = [];
    Storage.clearPending();
    var ok = total - failed.length;
    if (!failed.length) {
      veil('<div class="big">' + ok + ' saved to Drive</div>' +
           '<div class="small">' + esc(wellById(wid).name) + '</div>' +
           '<button id="vok">Done</button>', 'ok');
      el('vok').addEventListener('click', function () { hideVeil(); renderWell(wid); });
    } else {
      veil('<div class="big">' + ok + ' saved, ' + failed.length + ' failed</div>' +
           '<div class="small">' + esc(failed.join('  •  ')) + '</div>' +
           '<button id="vbad">Back</button>', failed.length === total ? 'bad' : '');
      el('vbad').addEventListener('click', function () { hideVeil(); renderWell(wid); });
    }
  }
  next();
}

/* ================= sign-in ================= */
function showSignInVeil() {
  var v = veil(
    '<div class="big">Sign in to Google Drive</div>' +
    '<div class="small">Well Photo Log stores everything in your Drive folder &ldquo;' + esc(ROOT) + '&rdquo;. ' +
    'Sign in with the Google account that owns it.</div>' +
    '<button id="signin">Sign in with Google</button>'
  );
  el('signin').addEventListener('click', function () {
    el('signin').disabled = true;
    Auth.signIn().then(function (ok) {
      if (ok) { hideVeil(); startAfterAuth(); }
      else { el('signin').disabled = false; toast('Sign-in did not complete. Try again.'); }
    });
  });
}

/* ================= boot ================= */
function startAfterAuth() {
  LAST = Storage.getLastWell();
  Storage.loadPending().then(function (record) {
    if (record && record.wellId && record.items && record.items.length) {
      PENDING_WELL = record.wellId;
      PENDING = record.items.map(function (it) {
        return { blob: it.blob, url: URL.createObjectURL(it.blob), name: it.name, slot: it.slot, dropped: it.dropped };
      });
      renderReview();
    } else {
      renderList();
    }
    refreshStatusBackground();
  }).catch(function () {
    renderList();
    refreshStatusBackground();
  });
}

function boot() {
  ROOT = CONFIG.ROOT_FOLDER_NAME;
  fetch('./wells.json').then(function (r) { return r.json(); }).then(function (cfg) {
    WELLS = cfg.wells; SLOTS = cfg.slots;
    renderList();
    return Auth.trySilent();
  }).then(function (signedIn) {
    if (signedIn) startAfterAuth();
    else showSignInVeil();
  }).catch(function (e) {
    veil('<div class="big">Could not start</div><div class="small">' +
         esc(e && e.message ? e.message : 'Unknown error') + '</div>' +
         '<button onclick="location.reload()">Reload</button>', 'bad');
  });
}

window.addEventListener('load', boot);
