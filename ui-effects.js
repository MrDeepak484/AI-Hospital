// ==========================================
// PRESENTATION-ONLY UI EFFECTS
// Pure visual polish — no business logic, no API calls, no state.
// Safe to remove without affecting app functionality.
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  setupScrollReveal();
  setupSpotlightCards();
  setupMagneticButtons();
  setupHeroParallax();
  setupCounters();
  setupDashboardTilt();
});

// Fade + slide in elements with class "reveal-up" as they enter the viewport
function setupScrollReveal() {
  const targets = document.querySelectorAll('.reveal-up');
  if (!targets.length) return;

  // Respect reduced-motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    targets.forEach(el => el.classList.add('is-visible'));
    return;
  }

  if (!('IntersectionObserver' in window)) {
    targets.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  targets.forEach(el => observer.observe(el));
}

// Cursor-reactive spotlight glow on cards (Stripe/Linear-style).
// Sets --mx/--my custom properties consumed by a ::after radial-gradient in style.css.
function setupSpotlightCards() {
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if (isTouch) return;

  const cards = document.querySelectorAll('.why-card, .feature-card, .pricing-card, .testimonial-card, .ecosystem-card, .module-card');
  if (!cards.length) return;

  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--mx', `${x}%`);
      card.style.setProperty('--my', `${y}%`);
    });
  });
}

// Subtle magnetic pull on primary/secondary buttons toward the cursor.
function setupMagneticButtons() {
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if (isTouch) return;

  const buttons = document.querySelectorAll('.btn-primary, .btn-secondary, .btn-white, .btn-outline-white');
  if (!buttons.length) return;

  buttons.forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const relX = e.clientX - rect.left - rect.width / 2;
      const relY = e.clientY - rect.top - rect.height / 2;
      // Keep the existing CSS hover lift (-2px) and add a gentle magnetic offset on top
      btn.style.transform = `translateY(-2px) translate(${relX * 0.12}px, ${relY * 0.22}px)`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
    });
  });
}

// Gentle mouse-parallax drift for the hero's floating medical icons.
// Applied to the wrapper container only, so each icon's own float keyframe animation is untouched.
function setupHeroParallax() {
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if (isTouch) return;

  const hero = document.querySelector('.hero');
  const iconsContainer = document.querySelector('.floating-icons-container');
  if (!hero || !iconsContainer) return;

  hero.addEventListener('mousemove', (e) => {
    const rect = hero.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width - 0.5;
    const relY = (e.clientY - rect.top) / rect.height - 0.5;
    iconsContainer.style.transform = `translate(${relX * 18}px, ${relY * 18}px)`;
  });
}

// Subtle 3D tilt on the hero dashboard mockup, following the cursor within the hero section
function setupDashboardTilt() {
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if (isTouch) return;

  const hero = document.querySelector('.hero');
  const wrapper = document.querySelector('.dashboard-wrapper');
  if (!hero || !wrapper) return;

  hero.addEventListener('mousemove', (e) => {
    const rect = hero.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width - 0.5;
    const relY = (e.clientY - rect.top) / rect.height - 0.5;
    const rotateY = relX * 10;
    const rotateX = relY * -8;
    wrapper.style.transform = `rotateY(${rotateY}deg) rotateX(${rotateX}deg)`;
  });
  hero.addEventListener('mouseleave', () => {
    wrapper.style.transform = 'rotateY(0deg) rotateX(0deg)';
  });
}

// Count-up animation for stat numbers (hero overlay cards, "Why Us" stats, dashboard KPIs)
// as they scroll into view. Parses numbers out of the existing text so formatting
// (%, commas, "x", " / ", suffixes like "Acc.") is fully preserved.
function setupCounters() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || !('IntersectionObserver' in window)) return;

  const targets = document.querySelectorAll('.card-value, .why-stat-num, .stat-value');
  if (!targets.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCountUp(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4 });

  targets.forEach(el => observer.observe(el));
}

function animateCountUp(el) {
  const original = el.textContent;
  const regex = /\d[\d,]*\.?\d*/g;
  const matches = [];
  let m;
  while ((m = regex.exec(original)) !== null) {
    matches.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  if (!matches.length) return;

  const parsed = matches.map(mt => {
    const hasComma = mt.text.includes(',');
    const decimalMatch = mt.text.match(/\.(\d+)/);
    const decimals = decimalMatch ? decimalMatch[1].length : 0;
    const target = parseFloat(mt.text.replace(/,/g, ''));
    return { ...mt, hasComma, decimals, target };
  });

  const duration = 1400;
  const start = performance.now();

  function frame(now) {
    const elapsed = now - start;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic

    let result = '';
    let cursor = 0;
    parsed.forEach(p => {
      result += original.slice(cursor, p.start);
      const current = p.target * eased;
      let formatted = p.decimals > 0 ? current.toFixed(p.decimals) : Math.round(current).toString();
      if (p.hasComma) {
        const parts = formatted.split('.');
        parts[0] = parseInt(parts[0], 10).toLocaleString('en-US');
        formatted = parts.join('.');
      }
      result += formatted;
      cursor = p.end;
    });
    result += original.slice(cursor);
    el.textContent = result;

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      el.textContent = original; // snap to exact original text at the end
    }
  }
  requestAnimationFrame(frame);
}
