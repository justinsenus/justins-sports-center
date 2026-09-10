const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('#site-nav');
const siteHeader = document.querySelector('[data-header]');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (menuToggle && siteNav) {
  menuToggle.addEventListener('click', () => {
    const open = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!open));
    siteNav.classList.toggle('is-open', !open);
  });

  siteNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      menuToggle.setAttribute('aria-expanded', 'false');
      siteNav.classList.remove('is-open');
    });
  });
}

const workTabs = [...document.querySelectorAll('[data-tab-target]')];
const panels = [...document.querySelectorAll('.tab-panel')];

function activateTab(targetId, updateHash = false) {
  workTabs.forEach((tab) => {
    const active = tab.dataset.tabTarget === targetId;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });

  panels.forEach((panel) => {
    const active = panel.id === targetId;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  });

  if (updateHash) history.replaceState(null, '', targetId === 'past-jobs' ? '#past-jobs' : '#work');
}

workTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    activateTab(tab.dataset.tabTarget, true);
    document.querySelector('#work')?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  });

  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = workTabs.indexOf(tab);
    const next = event.key === 'ArrowRight' ? (current + 1) % workTabs.length
      : event.key === 'ArrowLeft' ? (current - 1 + workTabs.length) % workTabs.length
      : event.key === 'Home' ? 0 : workTabs.length - 1;
    workTabs[next].focus();
    activateTab(workTabs[next].dataset.tabTarget, true);
  });
});

document.querySelectorAll('[data-tab-link]').forEach((link) => {
  link.addEventListener('click', () => activateTab(link.dataset.tabLink, true));
});

if (window.location.hash === '#past-jobs') activateTab('past-jobs');

const onScroll = () => siteHeader?.classList.toggle('is-scrolled', window.scrollY > 28);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

if (!prefersReducedMotion) {
  const processLayer = document.querySelector('.hero-process');
  const markLayer = document.querySelector('.hero-mark');
  window.addEventListener('scroll', () => {
    const shift = Math.min(window.scrollY * 0.08, 42);
    if (processLayer) processLayer.style.transform = `scale(1.08) translateY(${shift}px)`;
    if (markLayer) markLayer.style.transform = `rotate(-3deg) translateY(${shift * .35}px)`;
  }, { passive: true });
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('is-visible');
  });
}, { threshold: .12 });

document.querySelectorAll('.section-heading, .work-card, .experience-row, .service, .about-image-wrap, .about-copy, .contact-copy').forEach((element) => {
  element.setAttribute('data-reveal', '');
  observer.observe(element);
});

const year = document.querySelector('[data-year]');
if (year) year.textContent = new Date().getFullYear();
