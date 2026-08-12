// Well Photo Log — Google Drive API v3 client.
// Mirrors reference/Code.gs conventions exactly: same root folder lookup,
// same well-folder naming, same filename scheme, same "count files starting
// with slotId_" status rule. Drive is the only source of truth; nothing here
// is persisted across page loads.

var Drive = (function () {
  var FILES_BASE = 'https://www.googleapis.com/drive/v3/files';
  var UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';

  var rootId = null;
  var folderIdByName = {}; // well-folder name -> Drive folder id, session cache only

  function sanitize(s) {
    return String(s).replace(/[\\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function folderNameFor(well) { return sanitize(well.name) + ' [' + well.api + ']'; }
  function filenameFor(well, slotId, n) {
    return slotId + '_' + pad2(n) + '_' + sanitize(well.name) + '.jpg';
  }
  function escapeQ(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

  function driveFetch(url, options) {
    options = options || {};
    return Auth.withAuthRetry(function (token) {
      var headers = {};
      for (var k in (options.headers || {})) headers[k] = options.headers[k];
      headers.Authorization = 'Bearer ' + token;
      var opts = {};
      for (var k2 in options) opts[k2] = options[k2];
      opts.headers = headers;
      return fetch(url, opts);
    });
  }

  function checkOk(res) {
    return res.json().catch(function () { return {}; }).then(function (json) {
      if (!res.ok) {
        var msg = (json.error && json.error.message) || (res.status + ' ' + res.statusText);
        throw new Error(msg);
      }
      return json;
    });
  }

  // Fully paginated list for a Drive query. Returns Promise<Array<file>>.
  function driveList(q, fields, pageSize) {
    var out = [];
    function loop(pageToken) {
      var params = new URLSearchParams({
        q: q,
        fields: 'nextPageToken,' + fields,
        pageSize: String(pageSize || 1000),
        spaces: 'drive'
      });
      if (pageToken) params.set('pageToken', pageToken);
      return driveFetch(FILES_BASE + '?' + params.toString())
        .then(checkOk)
        .then(function (json) {
          out = out.concat(json.files || []);
          if (json.nextPageToken) return loop(json.nextPageToken);
          return out;
        });
    }
    return loop(null);
  }

  function getRootFolder() {
    if (rootId) return Promise.resolve(rootId);
    var q = "name='" + escapeQ(CONFIG.ROOT_FOLDER_NAME) + "' and 'root' in parents " +
      "and mimeType='application/vnd.google-apps.folder' and trashed=false";
    return driveList(q, 'files(id,name)').then(function (files) {
      if (files.length) { rootId = files[0].id; return rootId; }
      return driveFetch(FILES_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: CONFIG.ROOT_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['root']
        })
      }).then(checkOk).then(function (json) {
        rootId = json.id;
        return rootId;
      });
    });
  }

  // Fetches the full Well Photos subtree in a small, fixed number of
  // paginated queries (root lookup + well-folder listing + a few batched
  // file listings), then computes every well/slot count locally.
  function fetchStatus(wells, slots) {
    return getRootFolder().then(function (rid) {
      var q = "'" + rid + "' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false";
      return driveList(q, 'files(id,name)');
    }).then(function (wellFolders) {
      folderIdByName = {};
      wellFolders.forEach(function (f) { folderIdByName[f.name] = f.id; });

      var neededIds = [];
      wells.forEach(function (w) {
        var fid = folderIdByName[folderNameFor(w)];
        if (fid) neededIds.push(fid);
      });

      var filesByFolder = {};
      var BATCH = 15;
      var batches = [];
      for (var i = 0; i < neededIds.length; i += BATCH) batches.push(neededIds.slice(i, i + BATCH));

      return batches.reduce(function (chain, batchIds) {
        return chain.then(function () {
          var q = '(' + batchIds.map(function (id) { return "'" + id + "' in parents"; }).join(' or ') +
            ') and trashed=false';
          return driveList(q, 'files(id,name,parents)').then(function (files) {
            files.forEach(function (f) {
              var pid = f.parents && f.parents[0];
              if (!pid) return;
              (filesByFolder[pid] = filesByFolder[pid] || []).push(f.name);
            });
          });
        });
      }, Promise.resolve()).then(function () {
        var status = {};
        wells.forEach(function (w) {
          var counts = {};
          slots.forEach(function (s) { counts[s.id] = 0; });
          var fid = folderIdByName[folderNameFor(w)];
          var names = (fid && filesByFolder[fid]) || [];
          names.forEach(function (n) {
            slots.forEach(function (s) { if (n.indexOf(s.id + '_') === 0) counts[s.id]++; });
          });
          status[w.id] = counts;
        });
        return status;
      });
    });
  }

  function getOrCreateWellFolder(well) {
    var name = folderNameFor(well);
    if (folderIdByName[name]) return Promise.resolve(folderIdByName[name]);
    return getRootFolder().then(function (rid) {
      var q = "name='" + escapeQ(name) + "' and '" + rid + "' in parents " +
        "and mimeType='application/vnd.google-apps.folder' and trashed=false";
      return driveList(q, 'files(id,name)').then(function (files) {
        if (files.length) { folderIdByName[name] = files[0].id; return files[0].id; }
        return driveFetch(FILES_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, mimeType: 'application/vnd.google-apps.folder', parents: [rid] })
        }).then(checkOk).then(function (json) {
          folderIdByName[name] = json.id;
          return json.id;
        });
      });
    });
  }

  // Re-scans the folder fresh (not the session cache) so the next index is
  // always correct even if photos were added from elsewhere this session.
  function nextIndexFor(folderId, slotId) {
    var q = "'" + folderId + "' in parents and trashed=false";
    return driveList(q, 'files(id,name)').then(function (files) {
      var max = 0;
      files.forEach(function (f) {
        if (f.name.indexOf(slotId + '_') === 0) {
          var num = parseInt(f.name.split('_')[1], 10);
          if (!isNaN(num) && num > max) max = num;
        }
      });
      return max + 1;
    });
  }

  function buildMultipart(boundary, metadata, blob) {
    var delimiter = '\r\n--' + boundary + '\r\n';
    var closeDelim = '\r\n--' + boundary + '--';
    var metaPart = delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata);
    var mediaHeader = delimiter + 'Content-Type: image/jpeg\r\n\r\n';
    return new Blob([metaPart, mediaHeader, blob, closeDelim],
      { type: 'multipart/related; boundary=' + boundary });
  }

  function uploadPhoto(well, slotId, blob) {
    var folderId, n, name;
    return getOrCreateWellFolder(well).then(function (fid) {
      folderId = fid;
      return nextIndexFor(folderId, slotId);
    }).then(function (idx) {
      n = idx;
      name = filenameFor(well, slotId, n);
      var boundary = 'wpl_' + Math.random().toString(36).slice(2);
      var body = buildMultipart(boundary, { name: name, parents: [folderId] }, blob);
      return Auth.withAuthRetry(function (token) {
        return fetch(UPLOAD_BASE + '?uploadType=multipart&fields=id,name', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'multipart/related; boundary=' + boundary
          },
          body: body
        });
      });
    }).then(checkOk).then(function () {
      return { name: name, count: n };
    });
  }

  function folderLink(well) {
    var name = folderNameFor(well);
    var idPromise = folderIdByName[name]
      ? Promise.resolve(folderIdByName[name])
      : getRootFolder().then(function (rid) {
          var q = "name='" + escapeQ(name) + "' and '" + rid + "' in parents " +
            "and mimeType='application/vnd.google-apps.folder' and trashed=false";
          return driveList(q, 'files(id,name)').then(function (files) {
            if (!files.length) return null;
            folderIdByName[name] = files[0].id;
            return files[0].id;
          });
        });
    return idPromise.then(function (id) {
      if (!id) return null;
      return driveFetch(FILES_BASE + '/' + id + '?fields=webViewLink').then(checkOk).then(function (json) {
        return json.webViewLink;
      });
    });
  }

  return {
    fetchStatus: fetchStatus,
    uploadPhoto: uploadPhoto,
    folderLink: folderLink
  };
})();
