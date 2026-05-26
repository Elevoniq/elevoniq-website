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
