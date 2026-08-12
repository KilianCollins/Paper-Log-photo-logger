// Well Photo Log — Google Identity Services token-client auth.
// Token lives in memory only. Never persisted to localStorage/IndexedDB/cookies.

var Auth = (function () {
  var tokenClient = null;
  var accessToken = null;
  var signedIn = false;

  function ensureClient() {
    if (tokenClient) return tokenClient;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: CONFIG.DRIVE_SCOPE,
      callback: function () {} // overridden per-call below
    });
    return tokenClient;
  }

  // Requests a token. opts.interactive=false attempts a silent grant
  // (prompt:'') which succeeds with no UI if the user has an active Google
  // session and has consented before. Returns a Promise<string|null>.
  function requestToken(opts) {
    opts = opts || {};
    var interactive = !!opts.interactive;
    return new Promise(function (resolve) {
      var client;
      try {
        client = ensureClient();
      } catch (e) {
        resolve(null); // GIS script failed to load (offline, blocked, etc.)
        return;
      }
      client.callback = function (resp) {
        if (resp && resp.access_token) {
          accessToken = resp.access_token;
          signedIn = true;
          resolve(accessToken);
        } else {
          resolve(null);
        }
      };
      client.error_callback = function () {
        resolve(null);
      };
      try {
        // Silent: prompt:'' asks for a token with no UI at all. Interactive:
        // omit prompt and let Google decide (account chooser, and consent
        // only the first time) rather than forcing the consent screen on
        // every sign-in.
        client.requestAccessToken(interactive ? {} : { prompt: '' });
      } catch (e) {
        resolve(null);
      }
    });
  }

  // Attempted once on page load. Resolves true if a token was acquired
  // silently, false otherwise (caller should show the sign-in screen).
  function trySilent() {
    return requestToken({ interactive: false }).then(function (tok) {
      return !!tok;
    });
  }

  // Called from a user gesture (the sign-in button) since browsers may
  // otherwise block the consent popup.
  function signIn() {
    return requestToken({ interactive: true }).then(function (tok) {
      return !!tok;
    });
  }

  function getToken() {
    return accessToken;
  }

  function isSignedIn() {
    return signedIn;
  }

  // Wraps a Drive call. `fn(token)` must return a fetch Promise<Response>.
  // On a 401 (expired access token — they last one hour), requests a fresh
  // token once, silently, and retries. If refresh also fails, rejects.
  function withAuthRetry(fn) {
    if (!accessToken) {
      return requestToken({ interactive: false }).then(function (tok) {
        if (!tok) return Promise.reject(new Error('Not signed in.'));
        return fn(tok);
      }).then(checkAndMaybeRetry);
    }
    return fn(accessToken).then(checkAndMaybeRetry);

    function checkAndMaybeRetry(res) {
      if (res.status !== 401) return res;
      return requestToken({ interactive: false }).then(function (tok) {
        if (!tok) throw new Error('Your Google sign-in expired. Reload and sign in again.');
        return fn(tok);
      });
    }
  }

  return {
    trySilent: trySilent,
    signIn: signIn,
    getToken: getToken,
    isSignedIn: isSignedIn,
    withAuthRetry: withAuthRetry
  };
})();
