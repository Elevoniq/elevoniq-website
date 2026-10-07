/* ElevonIQ – Web-Entwicklung | 2026-05-26 */
document.addEventListener('DOMContentLoaded', function() {
  // Mobile nav toggle
  var hamburger = document.getElementById('nav-hamburger');
  var overlay = document.getElementById('mobile-nav-overlay');
  var closeBtn = document.getElementById('mobile-nav-close');

  if (hamburger && overlay) {
    hamburger.addEventListener('click', function() {
      var open = overlay.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    });
  }
  if (closeBtn && overlay) {
    closeBtn.addEventListener('click', function() {
      overlay.classList.remove('open');
      if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  }

  // Click-to-open Dropdown
  function closeAllDropdowns() {
    document.querySelectorAll('.nav-dropdown.is-open').forEach(function(d) {
      d.classList.remove('is-open');
      var btn = d.querySelector('.nav-dropdown-toggle');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  document.querySelectorAll('.nav-dropdown').forEach(function(dropdown) {
    var toggleBtn = dropdown.querySelector('.nav-dropdown-toggle');

    // Toggle beim Klick auf den Button (auch per Enter/Space da das nativ click auslöst)
    dropdown.addEventListener('click', function(e) {
      e.stopPropagation();
      var isOpen = dropdown.classList.contains('is-open');

      // Alle anderen Dropdowns schliessen
      closeAllDropdowns();

      if (!isOpen) {
        dropdown.classList.add('is-open');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
      }
    });

    // Space-Taste: Browser scrollt standardmässig – das verhinden wir nur wenn der Button fokussiert ist
    if (toggleBtn) {
      toggleBtn.addEventListener('keydown', function(e) {
        if (e.key === ' ') {
          e.preventDefault();
          toggleBtn.click();
        }
      });
    }
  });

  // Escape schliesst alle Dropdowns
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeAllDropdowns();
    }
  });

  // Klick ausserhalb schliesst alle Dropdowns
  document.addEventListener('click', function() {
    closeAllDropdowns();
  });

  // Transparent nav (Variant C)
  var nav = document.querySelector('nav.nav-transparent');
  if (nav) {
    function handleScroll() {
      nav.classList.toggle('scrolled', window.scrollY > 100);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
  }

  // Reveal on scroll
  var revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function(el) { observer.observe(el); });
  } else {
    revealEls.forEach(function(el) { el.classList.add('visible'); });
  }

  // ROI Calculator (Variant B)
  var roiForm = document.getElementById('roi-form');
  if (roiForm) {
    roiForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var count = parseFloat(document.getElementById('roi-count').value) || 0;
      var monthly = parseFloat(document.getElementById('roi-monthly').value) || 0;
      var savings = count * monthly * 12 * 0.18;
      var resultEl = document.getElementById('roi-result');
      var savingsEl = document.getElementById('roi-savings-number');
      if (resultEl && savingsEl) {
        savingsEl.textContent = savings.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
        resultEl.classList.add('visible');
      }
    });
  }

  // Counter Animation for Trust Metrics
  var counters = document.querySelectorAll('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    var countObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          countObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    counters.forEach(function(el) { countObserver.observe(el); });
  }

  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count'));
    var suffix = el.getAttribute('data-suffix') || '';
    var duration = 1600;
    var startTime = null;
    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var elapsed = timestamp - startTime;
      var progress = Math.min(elapsed / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(target * eased).toLocaleString('de-DE') + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
});

/* ─── MAILTO FALLBACK ────────────────────────────────────────────────────
   Injiziert einen dezenten Hinweis unter mailto-CTAs und Outlook-Buchungs-
   links für Besucher ohne installierten Mail-Client.
   Kein Tracking, keine externen Dienste, keine Consent-Abhängigkeit.
   Nur Links mit Button-Klassen erhalten den Hinweis — Inline-Textlinks
   in Footer, Datenschutz oder Impressum werden übersprungen.
   ElevonIQ – Web-Entwicklung | Ben | 2026-10-07
   ──────────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  var BTN_CLASSES  = ['btn-primary', 'btn-secondary', 'btn-white-outline', 'btn-submit'];
  /* Bereiche ohne Fallback-Hinweis: Navigation (Desktop + Mobile-Overlay),
     Footer und alle Overlay-/Drawer-Elemente. */
  var SKIP_SELECTORS = ['footer', 'nav', '.site-footer', '.site-nav',
                        '.mobile-nav-overlay', '#mobile-nav-overlay', '.nav-cta-bar'];
  var DARK_SELECTORS = ['.section-navy', '.section-dark', '.bg-navy'];

  function hasBtnClass(el) {
    return BTN_CLASSES.some(function(c) { return el.classList.contains(c); });
  }

  function isInsideSkipped(el) {
    return SKIP_SELECTORS.some(function(sel) { return !!el.closest(sel); });
  }

  function isOnDark(el) {
    return DARK_SELECTORS.some(function(sel) { return !!el.closest(sel); });
  }

  /* Extrahiert die reine Adresse aus einem mailto:-href.
     link.href liefert den vollständigen absoluten Wert inklusive
     URL-kodierter Query-Parameter. */
  function extractAddr(href) {
    var raw = href.replace(/^mailto:/i, '');
    var q   = raw.indexOf('?');
    return q !== -1 ? raw.substring(0, q) : raw;
  }

  /* Zeigt "Kopiert." für 2 Sekunden, setzt dann Button-Text zurück. */
  function showCopied(liveEl, btnEl) {
    liveEl.textContent = 'Kopiert.';
    btnEl.textContent  = 'Kopiert';
    btnEl.disabled     = true;
    setTimeout(function() {
      liveEl.textContent = '';
      btnEl.textContent  = 'Adresse kopieren';
      btnEl.disabled     = false;
    }, 2000);
  }

  /* Fallback für Browser ohne navigator.clipboard (ältere iOS, in-App-Browser). */
  function legacyCopy(addr, liveEl, btnEl) {
    try {
      var ta = document.createElement('textarea');
      ta.value = addr;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showCopied(liveEl, btnEl);
    } catch (e) {
      /* Kann nicht in Zwischenablage schreiben — Adresse sichtbar machen */
      liveEl.textContent = addr;
    }
  }

  /* Erstellt das .mf-hint-Element für eine gegebene E-Mail-Adresse. */
  function buildHint(addr, dark, hintText) {
    var hint  = document.createElement('div');
    hint.className = 'mf-hint' + (dark ? ' mf-hint--dark' : '');

    var text  = document.createElement('span');
    text.className   = 'mf-hint-text';
    text.textContent = hintText;

    var btn   = document.createElement('button');
    btn.type          = 'button';
    btn.className     = 'mf-copy-btn';
    btn.textContent   = 'Adresse kopieren';
    btn.setAttribute('aria-label', 'E-Mail-Adresse ' + addr + ' in die Zwischenablage kopieren');

    var live  = document.createElement('span');
    live.className = 'mf-copied';
    live.setAttribute('role',      'status');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');

    btn.addEventListener('click', function() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(addr).then(
          function()  { showCopied(live, btn); },
          function()  { legacyCopy(addr, live, btn); }
        );
      } else {
        legacyCopy(addr, live, btn);
      }
    });

    hint.appendChild(text);
    hint.appendChild(btn);
    hint.appendChild(live);
    return hint;
  }

  /* ── 1. mailto:-CTAs ── */
  document.querySelectorAll('a[href^="mailto:"]').forEach(function(link) {
    if (!hasBtnClass(link))      return;
    if (isInsideSkipped(link))   return;

    var addr = extractAddr(link.href);

    /* Nur ElevonIQ-eigene Adressen — keine Drittanbieter (heydata.eu etc.) */
    if (!addr.endsWith('@elevoniq.de')) return;

    var dark = isOnDark(link);
    var hint = buildHint(
      addr,
      dark,
      'Kein Mailprogramm? Schreiben Sie an ' + addr
    );
    link.insertAdjacentElement('afterend', hint);
  });

  /* ── 2. Outlook-Buchungslinks ── */
  document.querySelectorAll('a[href*="outlook.office.com/bookwithme"]').forEach(function(link) {
    if (!hasBtnClass(link))    return;
    if (isInsideSkipped(link)) return;

    /* Verhindert doppelte Hints, wenn zwei Outlook-Links direkt nebeneinander stehen */
    if (link.nextElementSibling && link.nextElementSibling.classList.contains('mf-hint')) return;

    var dark = isOnDark(link);
    var hint = buildHint(
      'anfragen@elevoniq.de',
      dark,
      'Kein Termin buchbar? Schreiben Sie alternativ an anfragen@elevoniq.de'
    );
    link.insertAdjacentElement('afterend', hint);
  });
});
