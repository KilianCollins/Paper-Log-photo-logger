// Well Photo Log — in-page live camera.
// Runs getUserMedia inside the page so nothing backgrounds to the Android
// camera app and nothing gets killed. Stays open across shots so a user can
// photograph several sheets per well without re-entering. Always stops every
// track on exit (Done, close, or page hide) so nothing drains the battery.

var Camera = (function () {
  var overlay = null, stream = null, track = null, torchOn = false;
  var captures = []; // { blob, url, name }
  var seq = 0;

  function stopTracks() {
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    track = null;
    window.removeEventListener('pagehide', stopTracks);
  }

  function teardown() {
    stopTracks();
    captures.forEach(function (c) { URL.revokeObjectURL(c.url); });
    captures = [];
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  function renderStrip() {
    var strip = overlay.querySelector('#camStrip');
    strip.innerHTML = captures.map(function (c) {
      return '<img src="' + c.url + '" class="camthumb" alt="">';
    }).join('');
    overlay.querySelector('#camCount').textContent =
      captures.length + ' photo' + (captures.length === 1 ? '' : 's') + ' captured';
    overlay.querySelector('#camDone').disabled = captures.length === 0;
  }

  function shoot() {
    var video = overlay.querySelector('#camvideo');
    Resize.shrinkFrame(video).then(function (blob) {
      seq++;
      captures.push({ blob: blob, url: URL.createObjectURL(blob), name: 'camera_' + Date.now() + '_' + seq + '.jpg' });
      renderStrip();
    }).catch(function () {
      // Extremely unlikely (canvas encode failure) — just skip the shot silently,
      // the user can retake it immediately since the viewfinder stays open.
    });
  }

  function setupTorch() {
    var btn = overlay.querySelector('#camTorch');
    var caps = (track.getCapabilities && track.getCapabilities()) || {};
    if (!caps.torch) { btn.hidden = true; return; }
    btn.hidden = false;
    torchOn = false;
    btn.addEventListener('click', function () {
      track.applyConstraints({ advanced: [{ torch: !torchOn }] }).then(function () {
        torchOn = !torchOn;
        btn.classList.toggle('on', torchOn);
      }).catch(function () { /* torch toggle failed — leave state as-is */ });
    });
  }

  // open(onDone, onFallback)
  // onDone(items)      items = [{ blob, name }] already resized, ready to review
  // onFallback(message) camera unavailable — caller should fall back to file inputs
  function open(onDone, onFallback) {
    captures = []; seq = 0;

    overlay = document.createElement('div');
    overlay.className = 'camwrap';
    overlay.innerHTML =
      '<video id="camvideo" autoplay playsinline muted></video>' +
      '<div class="camtop">' +
        '<button class="camback" id="camClose">&larr; Cancel</button>' +
        '<button class="camtorch" id="camTorch" hidden>Torch</button>' +
      '</div>' +
      '<div class="cambottom">' +
        '<div class="camstrip" id="camStrip"></div>' +
        '<div class="camcount" id="camCount">0 photos captured</div>' +
        '<div class="camrow">' +
          '<button class="camshutter" id="camShutter" aria-label="Capture"></button>' +
          '<button class="send camdone" id="camDone" disabled>Done</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#camClose').addEventListener('click', function () {
      teardown();
    });
    overlay.querySelector('#camShutter').addEventListener('click', shoot);
    overlay.querySelector('#camDone').addEventListener('click', function () {
      var items = captures.map(function (c) { return { blob: c.blob, name: c.name }; });
      stopTracks();
      captures = [];
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
      onDone(items);
    });

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      teardown();
      onFallback('This browser does not support the in-page camera (getUserMedia unavailable).');
      return;
    }

    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 4096 },
        height: { ideal: 3072 }
      },
      audio: false
    }).then(function (s) {
      if (!overlay) { s.getTracks().forEach(function (t) { t.stop(); }); return; } // closed before it resolved
      stream = s;
      track = stream.getVideoTracks()[0];
      overlay.querySelector('#camvideo').srcObject = stream;
      window.addEventListener('pagehide', stopTracks);
      setupTorch();
    }).catch(function (err) {
      var msg = (err && err.message) ? err.message : String(err);
      teardown();
      onFallback('Could not open the camera: ' + msg);
    });
  }

  return { open: open };
})();
