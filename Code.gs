/**
 * WELL PHOTO LOG — server side
 * Runs as you. Creates one Drive folder per well and uploads photos into it.
 *
 * ==========  THE ONLY PART YOU EDIT IS THE WELLS LIST BELOW  ==========
 */

// Name of the one big folder in your Drive that holds every well folder.
var ROOT_FOLDER_NAME = 'Well Photos';

// Your wells. Add as many rows as you need — copy a line, change the values.
// 'id' just has to be unique. 'note' shows on the card and can be blank.
var WELLS = [
  { id: 'w001', name: 'Cowan # 1', api: '42-083-31158', note: '1 log on file' },
  { id: 'w002', name: 'Cowan B #1', api: '42-083-31788', note: '1 log on file' },
  { id: 'w003', name: 'Cowan C #1', api: '42-083-31357', note: '1 log on file' },
  { id: 'w004', name: 'Cowan, W.T. (D)', api: '42-083-31871', note: '2 logs on file' },
  { id: 'w005', name: 'Devanney, Marcia #1', api: '42-083-30241', note: '1 log on file' },
  { id: 'w006', name: 'Devanney, Marcia #2', api: '42-083-30585', note: '2 logs on file' },
  { id: 'w007', name: 'Henderson W. C. #4', api: '42-083-34865', note: '2 logs on file' },
  { id: 'w008', name: 'Henderson W. C. #7', api: '42-083-34893', note: '3 logs on file' },
  { id: 'w009', name: 'Henderson, W. C. #1', api: '42-083-34816', note: '2 logs on file' },
  { id: 'w010', name: 'Henderson, W. C. #2', api: '42-083-34842', note: '7 logs on file' },
  { id: 'w011', name: 'Henderson, W. C. #3', api: '42-083-34860', note: '3 logs on file' },
  { id: 'w012', name: 'Henderson, W. C. #5', api: '42-083-34872', note: '3 logs on file' },
  { id: 'w013', name: 'Henderson, W. C. #6', api: '42-083-34884', note: '2 logs on file' },
  { id: 'w014', name: 'Henderson, W. H. #2', api: '42-083-31675', note: '1 log on file' },
  { id: 'w015', name: 'Henderson, W. H. #4', api: '42-083-35670', note: '3 logs on file' },
  { id: 'w016', name: 'Henderson, W. H. #5', api: '42-083-35673', note: '3 logs on file' },
  { id: 'w017', name: 'Henderson, W.C. A #1', api: '42-083-34948', note: '3 logs on file' },
  { id: 'w018', name: 'Henderson, W.C. A #2', api: '42-083-34958', note: '7 logs on file' },
  { id: 'w019', name: 'Henderson, W.C. B #3', api: '42-083-31590', note: '7 logs on file' },
  { id: 'w020', name: 'Henderson, W.C. B #4', api: '42-083-31589', note: '4 logs on file' },
  { id: 'w021', name: 'Henderson, W.C. B #6', api: '42-083-31749', note: '1 log on file' },
  { id: 'w022', name: 'Henderson, W.C. C #1', api: '42-083-34967', note: '6 logs on file' },
  { id: 'w023', name: 'Henderson, Willie #1', api: '42-083-30137', note: '6 logs on file' },
  { id: 'w024', name: 'Henderson, Willie #1D', api: '42-083-32408', note: '1 log on file' },
  { id: 'w025', name: 'Henderson, Willie #2', api: '42-083-31690', note: '1 log on file' },
  { id: 'w026', name: 'Henderson, Willie #4', api: '42-083-33977', note: '1 log on file' },
  { id: 'w027', name: 'Kearley #2', api: '42-083-34905', note: '2 logs on file' },
  { id: 'w028', name: 'Kearley #4', api: '42-083-34922', note: '3 logs on file' },
  { id: 'w029', name: 'Knox, E. L., DR #1', api: '42-083-80225', note: '1 log on file' },
  { id: 'w030', name: 'Miller Devanney #4', api: '42-083-35007', note: '7 logs on file' },
  { id: 'w031', name: 'Miller Ranch #1', api: '42-083-34998', note: '1 log on file' },
  { id: 'w032', name: 'Miller Ranch #2', api: '42-083-34997', note: '3 logs on file' },
  { id: 'w033', name: 'Jim Burkett #2', api: '42-083-04665', note: '1 log on file' }
];

// The three required shots. Change the wording if you like; leave the ids alone.
// The shots for each well. Set required:false for anything that's nice-to-have.
// Leave the ids alone — they're baked into the filenames already in Drive.
var SLOTS = [
  { id: 'bore',  label: 'Wellbore diagram', required: true,
    hint: 'Casing / schematic sheet. Perfs are usually marked on this.' },
  { id: 'tops',  label: 'Formation depths', required: true,
    hint: 'Tops list or the marked-up log showing picks' },
  { id: 'perfs', label: 'Perforations',     required: false,
    hint: 'Optional — only if the perf intervals are not legible on the diagram' }
];

// ======================  NOTHING BELOW NEEDS EDITING  ======================

/** Serves the phone app. */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Well Photo Log')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** One round trip on load: config + what's already in Drive. */
function boot() {
  var last = null;
  try { last = PropertiesService.getUserProperties().getProperty('lastWell'); } catch (e) {}
  return {
    wells: WELLS,
    slots: SLOTS,
    rootName: ROOT_FOLDER_NAME,
    status: getStatus(),
    lastWell: last
  };
}

/** Remembers which well you had open, so a browser reload can offer to resume. */
function setLastWell(wellId) {
  try { PropertiesService.getUserProperties().setProperty('lastWell', String(wellId)); } catch (e) {}
  return true;
}

/**
 * Reads Drive and reports how many photos exist per well per slot.
 * Drive is the single source of truth — nothing is cached on the phone.
 */
function getStatus() {
  var root = getRoot_();
  var byName = {};
  var folders = root.getFolders();
  while (folders.hasNext()) {
    var f = folders.next();
    byName[f.getName()] = f;
  }

  var out = {};
  for (var i = 0; i < WELLS.length; i++) {
    var w = WELLS[i];
    var counts = {};
    for (var s = 0; s < SLOTS.length; s++) counts[SLOTS[s].id] = 0;

    var folder = byName[folderNameFor_(w)];
    if (folder) {
      var files = folder.getFiles();
      while (files.hasNext()) {
        var n = files.next().getName();
        for (var k = 0; k < SLOTS.length; k++) {
          if (n.indexOf(SLOTS[k].id + '_') === 0) counts[SLOTS[k].id]++;
        }
      }
    }
    out[w.id] = counts;
  }
  return out;
}

/**
 * Uploads one photo. Creates the root folder and the well folder if missing.
 * payload = { wellId, slotId, data }  where data is base64 with no prefix.
 */
function uploadPhoto(payload) {
  var well = null;
  for (var i = 0; i < WELLS.length; i++) {
    if (WELLS[i].id === payload.wellId) { well = WELLS[i]; break; }
  }
  if (!well) throw new Error('Unknown well id: ' + payload.wellId);

  var slotOk = false;
  for (var s = 0; s < SLOTS.length; s++) if (SLOTS[s].id === payload.slotId) slotOk = true;
  if (!slotOk) throw new Error('Unknown slot id: ' + payload.slotId);

  var root = getRoot_();
  var wanted = folderNameFor_(well);
  var it = root.getFoldersByName(wanted);
  var folder = it.hasNext() ? it.next() : root.createFolder(wanted);

  var n = nextIndex_(folder, payload.slotId);
  var name = payload.slotId + '_' + pad_(n) + '_' + sanitize_(well.name) + '.jpg';

  var blob = Utilities.newBlob(Utilities.base64Decode(payload.data), 'image/jpeg', name);
  var file = folder.createFile(blob);

  return { ok: true, wellId: well.id, slotId: payload.slotId, count: n, name: name, url: file.getUrl() };
}

/** Deletes a photo (moves it to Drive trash) by exact filename. */
function deletePhoto(wellId, fileName) {
  var well = null;
  for (var i = 0; i < WELLS.length; i++) if (WELLS[i].id === wellId) well = WELLS[i];
  if (!well) throw new Error('Unknown well id: ' + wellId);

  var root = getRoot_();
  var it = root.getFoldersByName(folderNameFor_(well));
  if (!it.hasNext()) return { ok: true };
  var folder = it.next();
  var files = folder.getFilesByName(fileName);
  while (files.hasNext()) files.next().setTrashed(true);
  return { ok: true };
}

/** Returns a direct link to a well's Drive folder, or null if not created yet. */
function folderLink(wellId) {
  var well = null;
  for (var i = 0; i < WELLS.length; i++) if (WELLS[i].id === wellId) well = WELLS[i];
  if (!well) return null;
  var it = getRoot_().getFoldersByName(folderNameFor_(well));
  return it.hasNext() ? it.next().getUrl() : null;
}

// ---------- helpers ----------

function getRoot_() {
  var it = DriveApp.getRootFolder().getFoldersByName(ROOT_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(ROOT_FOLDER_NAME);
}

function folderNameFor_(well) {
  return sanitize_(well.name) + ' [' + well.api + ']';
}

function nextIndex_(folder, slotId) {
  var max = 0;
  var files = folder.getFiles();
  while (files.hasNext()) {
    var n = files.next().getName();
    if (n.indexOf(slotId + '_') === 0) {
      var num = parseInt(n.split('_')[1], 10);
      if (!isNaN(num) && num > max) max = num;
    }
  }
  return max + 1;
}

function pad_(n) { return (n < 10 ? '0' : '') + n; }

function sanitize_(s) {
  return String(s).replace(/[\\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
}
