/**
 * contact-form.js — ElevonIQ Buchungsformular (inline, produktspezifisch)
 * Zuständig: Ben (ElevonIQ – Web-Entwicklung)
 *
 * Abhängigkeiten: Cloudflare Turnstile (geladen per <script> im HTML), cookie-consent.js
 * Env: funktioniert ohne API-Key, fällt dann auf Mail-Fallback zurück.
 */

(function () {
  'use strict';

  /**
   * Initialiserung — wird für jede .contact-form-section auf der Seite aufgerufen.
   */
  function initContactForm(section) {
    var form    = section.querySelector('.js-contact-form');
    var submit  = section.querySelector('.js-contact-submit');
    var status  = section.querySelector('.js-contact-status');
    var fallback = section.querySelector('.js-contact-fallback');

    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Ladezustand
      setSubmitState(submit, true);
      clearStatus(status);

      var fd = new FormData(form);

      fetch('/api/contact', {
        method: 'POST',
        body: fd,
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (result.ok) {
            var produkt = (form.querySelector('[name="produkt"]') || {}).value || '';
            // GA4-Event — nur nach Analytics-Consent
            trackEvent('form_submit_kontakt', { produkt: produkt });
            // Weiterleitung zur Danke-Seite
            window.location.href = '/danke/?produkt=' + encodeURIComponent(produkt);
          } else {
            var msg = (result.data && result.data.error) ? result.data.error
              : 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es per E-Mail.';
            showStatus(status, msg, 'error');
            showFallback(fallback);
            setSubmitState(submit, false);
          }
        })
        .catch(function () {
          showStatus(
            status,
            'Verbindung fehlgeschlagen. Bitte versuchen Sie es per E-Mail.',
            'error'
          );
          showFallback(fallback);
          setSubmitState(submit, false);
        });
    });
  }

  function setSubmitState(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.setAttribute('aria-busy', loading ? 'true' : 'false');
    if (loading) {
      btn.dataset.originalText = btn.textContent;
      btn.textContent = 'Wird gesendet…';
    } else {
      btn.textContent = btn.dataset.originalText || 'Anfrage senden';
    }
  }

  function showStatus(el, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    el.className = 'js-contact-status contact-form__status contact-form__status--' + type;
    el.setAttribute('role', 'alert');
  }

  function clearStatus(el) {
    if (!el) return;
    el.hidden = true;
    el.textContent = '';
    el.removeAttribute('role');
  }

  function showFallback(el) {
    if (!el) return;
    el.hidden = false;
  }

  function trackEvent(name, params) {
    try {
      if (typeof gtag === 'function') {
        gtag('event', name, params || {});
      }
    } catch (e) {
      // Kein GA4 geladen oder kein Consent — ignorieren
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Smooth-Scroll für Hero-CTAs, die auf #anfragen zeigen
  // ──────────────────────────────────────────────────────────────
  function initAnchorScroll() {
    document.querySelectorAll('a[href="#anfragen"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        var target = document.getElementById('anfragen');
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Focus auf erste sichtbare Eingabe für Barrierefreiheit
        var firstInput = target.querySelector('input:not([type="hidden"]), textarea, select');
        if (firstInput) {
          setTimeout(function () { firstInput.focus(); }, 400);
        }
      });
    });
  }

  // Initialisierung nach DOM-Ready
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.contact-form-section').forEach(initContactForm);
    initAnchorScroll();
  });
})();
