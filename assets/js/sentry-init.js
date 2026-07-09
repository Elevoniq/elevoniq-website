/* ElevonIQ – Web-Entwicklung | Ben | 2026-06-10 | v1 — DSGVO-konformes Error-Monitoring */
/* Sentry wird ausschliesslich nach explizitem Analytics-Consent geladen.               */
/* DSN-Placeholder muss vor Go-Live durch echten Sentry-DSN ersetzt werden.             */

(function () {
  var SENTRY_DSN = 'SENTRY_DSN_PLACEHOLDER';

  function initSentry() {
    var script = document.createElement('script');
    script.src = 'https://browser.sentry-cdn.com/10.57.0/bundle.tracing.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = function () {
      if (typeof Sentry === 'undefined') return;

      Sentry.init({
        dsn: SENTRY_DSN,
        environment: 'production',
        release: '',
        tracesSampleRate: 0.1,
        beforeSend: function (event) {
          if (!event.event_id) return null;
          if (event.user) {
            delete event.user.ip_address;
          }
          return event;
        }
      });
    };
    document.head.appendChild(script);
  }

  if (typeof window.elevoniqConsent !== 'undefined') {
    window.elevoniqConsent.onAnalyticsAccepted(initSentry);
  } else {
    /* Fallback: warten bis cookie-consent.js bereit ist */
    document.addEventListener('DOMContentLoaded', function () {
      if (typeof window.elevoniqConsent !== 'undefined') {
        window.elevoniqConsent.onAnalyticsAccepted(initSentry);
      }
    });
  }
})();
