/* A2B Lift — main.js */

// ─── Nav auth state: show user name + logout on all pages ─────────────────
(function initNavAuth() {
  const token = localStorage.getItem('a2b_token');
  if (!token) return;
  let user = null;
  try { user = JSON.parse(localStorage.getItem('a2b_user') || 'null'); } catch(e) {}
  if (!user) return;

  const firstName = (user.name || user.username || '').split(' ')[0] || 'Account';

  const logoutHTML = `<button class="btn btn-ghost btn-sm" onclick="(function(){localStorage.removeItem('a2b_token');localStorage.removeItem('a2b_user');window.location.href='index.html';})()">Log out</button>`;
  const accountHTML = `<a href="dashboard.html" class="btn btn-ghost btn-sm">Hi, ${firstName}</a>`;

  // Desktop nav-actions: replace any "Log in" link
  const navActions = document.querySelector('.nav-actions');
  if (navActions) {
    const loginLink = navActions.querySelector('a[href="login.html"]');
    if (loginLink) {
      loginLink.outerHTML = accountHTML + logoutHTML;
    }
  }

  // Mobile nav: replace "Log in" link in mobile-cta
  const mobileCta = document.querySelector('.mobile-cta');
  if (mobileCta) {
    const mobileLogin = mobileCta.querySelector('a[href="login.html"]');
    if (mobileLogin) {
      mobileLogin.outerHTML = `<a href="dashboard.html" class="btn btn-ghost">Hi, ${firstName}</a><button class="btn btn-primary" onclick="(function(){localStorage.removeItem('a2b_token');localStorage.removeItem('a2b_user');window.location.href='index.html';})()">Log out</button>`;
    }
  }
})();

// ─── Nav scroll shadow ────────────────────────────────────────────────────
const navEl = document.getElementById('nav');
if (navEl) {
  window.addEventListener('scroll', () => {
    navEl.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });
}

// ─── Hamburger / mobile nav ───────────────────────────────────────────────
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobileNav');

if (hamburger && mobileNav) {
  hamburger.addEventListener('click', () => {
    const isOpen = mobileNav.classList.toggle('open');
    document.body.style.overflow = isOpen ? 'hidden' : '';
    hamburger.setAttribute('aria-expanded', String(isOpen));
  });

  // Close on any link click inside mobile nav
  mobileNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mobileNav.classList.remove('open');
      document.body.style.overflow = '';
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });
}

// ─── Fade-in on scroll ────────────────────────────────────────────────────
if ('IntersectionObserver' in window) {
  const fadeEls = document.querySelectorAll(
    '.service-card, .feature-card, .step-card, .earn-card, .route-card, ' +
    '.blog-card, .stat-item, .step, .split'
  );

  const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        fadeObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  fadeEls.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    fadeObserver.observe(el);
  });
}

// ─── Smooth scroll for in-page hash links ────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const id = this.getAttribute('href').slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
