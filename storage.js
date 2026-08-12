// Well Photo Log — local persistence.
// "Last well viewed" lives in localStorage. Pending (not-yet-uploaded) review
// captures live in IndexedDB, keyed under a single record, so a reload mid-review
// doesn't lose photos. Cleared once a batch finishes uploading. Neither of these
// is completion/status data — that always comes fresh from Drive.

var Storage = (function () {
  var DB_NAME = 'well-photo-log';
  var DB_VERSION = 1;
  var STORE = 'pending';
  var KEY = 'current';
  var LAST_WELL_KEY = 'wpl.lastWell';

  var dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(mode) {
    return openDb().then(function (db) {
      return db.transaction(STORE, mode).objectStore(STORE);
    });
  }

  function getLastWell() {
    try { return localStorage.getItem(LAST_WELL_KEY); } catch (e) { return null; }
  }
  function setLastWell(wellId) {
    try { localStorage.setItem(LAST_WELL_KEY, wellId); } catch (e) {}
  }

  // items: [{ blob, name, slot, dropped }]
  function savePending(wellId, items) {
    return tx('readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.put({ wellId: wellId, items: items }, KEY);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function loadPending() {
    return tx('readonly').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.get(KEY);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function clearPending() {
    return tx('readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.delete(KEY);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  return {
    getLastWell: getLastWell,
    setLastWell: setLastWell,
    savePending: savePending,
    loadPending: loadPending,
    clearPending: clearPending
  };
})();
