/* ElevonIQ – Web-Entwicklung | Ben | 2026-05-31 | v2 — analytics category support */
(function() {
  var CONSENT_KEY = 'elevoniq_consent';
  var stored = localStorage.getItem(CONSENT_KEY);

  /* -----------------------------------------------------------------------
   * Public API — used by GA4 loader (see bottom of each HTML page)
   * elevoniqConsent.hasAnalytics() → true if user accepted analytics
   * elevoniqConsent.onAnalyticsAccepted(fn) → call fn when consent is given
   * --------------------------------------------------------------------- */
  window.elevoniqConsent = {
    hasAnalytics: function() {
      return localStorage.getItem(CONSENT_KEY) === 'all';
    },
    _callbacks: [],
    onAnalyticsAccepted: function(fn) {
      if (this.hasAnalytics()) {
        fn();
      } else {
        this._callbacks.push(fn);
      }
    },
    _trigger: function() {
      var cbs = this._callbacks;
      this._callbacks = [];
      for (var i = 0; i < cbs.length; i++) { cbs[i](); }
    }
  };

  /* Already decided — no banner needed */
  if (stored) return;

  var banner = document.createElement('div');
  banner.id = 'cookie-banner';
  banner.setAttribute('role', 'alertdialog');
  banner.setAttribute('aria-label', 'Cookie-Einstellungen');
  banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#1E2761;color:#fff;padding:1.25rem 2rem;display:flex;gap:2rem;align-items:center;flex-wrap:wrap;box-shadow:0 -4px 20px rgba(0,0,0,0.15);font-family:Work Sans,system-ui,sans-serif;font-size:14px;';
  banner.innerHTML = '<div style="flex:1;min-width:200px;">Diese Website verwendet Cookies. Mehr in unserer <a href="/datenschutz/" style="color:#69B0AB;text-decoration:underline;">Datenschutzerklärung</a>.</div><div style="display:flex;gap:1rem;flex-shrink:0;"><button id="cookie-decline" style="background:transparent;border:1px solid rgba(255,255,255,0.4);color:#fff;padding:0.5rem 1rem;border-radius:4px;cursor:pointer;font-size:14px;font-family:inherit;">Nur notwendige</button><button id="cookie-accept" style="background:#E8474A;border:none;color:#fff;padding:0.5rem 1.25rem;border-radius:4px;cursor:pointer;font-size:14px;font-weight:600;font-family:inherit;">Alle akzeptieren</button></div>';
  document.body.appendChild(banner);

  document.getElementById('cookie-accept').addEventListener('click', function() {
    localStorage.setItem(CONSENT_KEY, 'all');
    banner.remove();
    window.elevoniqConsent._trigger(); /* fire deferred analytics callbacks */
  });
  document.getElementById('cookie-decline').addEventListener('click', function() {
    localStorage.setItem(CONSENT_KEY, 'necessary');
    banner.remove();
  });
})();
