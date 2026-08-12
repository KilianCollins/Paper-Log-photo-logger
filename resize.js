// Well Photo Log — shared image resize pipeline.
// Same long-edge cap and JPEG quality for every capture source (camera,
// gallery picker, file/Drive picker) so the review screen always shows
// byte-for-byte what gets stored.

var Resize = (function () {
  var MAX_EDGE = 2000, QUALITY = 0.82;

  function drawToBlob(src, w, h) {
    var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    var cw = Math.round(w * scale), ch = Math.round(h * scale);
    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    c.getContext('2d').drawImage(src, 0, 0, cw, ch);
    return new Promise(function (resolve, reject) {
      c.toBlob(function (blob) {
        c.width = 0; c.height = 0;
        if (blob) resolve(blob); else reject(new Error('could not encode image'));
      }, 'image/jpeg', QUALITY);
    });
  }

  // File -> Promise<Blob>. Rejects (with a message naming the problem) for
  // formats the browser cannot decode, e.g. .tif well logs.
  function shrinkFile(file) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file, { imageOrientation: 'from-image' })
        .then(function (bmp) {
          return drawToBlob(bmp, bmp.width, bmp.height).then(function (blob) {
            if (bmp.close) bmp.close();
            return blob;
          });
        })
        .catch(function () { return viaImg(file); });
    }
    return viaImg(file);
  }

  function viaImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        drawToBlob(img, img.naturalWidth, img.naturalHeight)
          .then(resolve, reject)
          .then(function () { URL.revokeObjectURL(url); }, function () { URL.revokeObjectURL(url); });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('not an image the browser can open'));
      };
      img.src = url;
    });
  }

  // Live video frame -> Promise<Blob>, same cap/quality as shrinkFile.
  function shrinkFrame(video) {
    return drawToBlob(video, video.videoWidth, video.videoHeight);
  }

  return { shrinkFile: shrinkFile, shrinkFrame: shrinkFrame, MAX_EDGE: MAX_EDGE, QUALITY: QUALITY };
})();
