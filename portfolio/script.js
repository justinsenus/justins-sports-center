const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('#site-nav');
const siteHeader = document.querySelector('[data-header]');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

['work.css', 'polish.css'].forEach((href) => {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = href;
  document.head.appendChild(stylesheet);
});

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

  if (updateHash) {
    history.replaceState(null, '', targetId === 'past-jobs' ? '#past-jobs' : '#work');
  }
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

const wixImage = (file) => `https://static.wixstatic.com/media/${file}`;

const portfolioProjects = {
  designs: [
    {
      id: 'celebrity-kennels',
      type: 'Brand Identity / Logo',
      title: 'Celebrity Kennels — New England',
      description: 'Custom breeder identity for a New England American Bulldog and pit bull program, built around a bold illustrative mark.',
      images: [
        wixImage('69fcba_01e90945ef594ddaa7f348c626b55773~mv2.jpg'),
        wixImage('69fcba_e019b30718bc491897c40d1dbe0207fd~mv2.jpg'),
        wixImage('69fcba_a4f060af8a5843ea88faaace5508c8b0~mv2.jpg')
      ]
    },
    {
      id: 'balls-of-fury',
      type: 'Brand Identity / Logo',
      title: 'Balls of Fury — Ball Pythons',
      description: 'Logo and social-first brand identity for an exotic ball python breeder. Supporting content helped grow the Instagram audience to 11.4K followers in under six months.',
      images: [
        wixImage('69fcba_a37dc6448cf54c768102b64948210329~mv2.png'),
        wixImage('69fcba_2f1507d29ef5492fa5153280ef7657ee~mv2.png'),
        wixImage('69fcba_6ef7944e802c4e54a046b92696dcccc7~mv2.jpg')
      ]
    },
    {
      id: 'cdg-dave',
      type: 'Brand Identity / Digital',
      title: 'Twitch Rebrand — CDG Dave',
      description: 'A modern gaming identity for Twitch streamer CDG Dave, developed from sketch exploration through the final mark.',
      images: [
        wixImage('69fcba_b9b8b932e6c5467a84a6963b1308add6~mv2.jpg'),
        wixImage('69fcba_8e999a80ba0047f9a95b4dd5478f8367~mv2.jpg'),
        wixImage('69fcba_366204dbad914568b9145b27a54ead18~mv2.jpg')
      ]
    },
    {
      id: 'we-motivate',
      type: 'Brand Identity / Logo',
      title: 'We Motivate',
      description: 'Identity concept for a motivation-focused platform built around momentum, ambition, and community.',
      images: [
        wixImage('69fcba_0abd10c7cfce477995e0e5ecb5567343~mv2.png'),
        wixImage('69fcba_99b574f93b514405bbbda2d632ee0fd1~mv2.jpg'),
        wixImage('69fcba_5b016d2fead4463ea206b9a083585a9f~mv2.jpg')
      ]
    },
    {
      id: 'main-st-barbershop',
      type: 'Brand Identity / Logo',
      title: 'Main St. Barbershop',
      description: 'Logo refresh for a Coventry, Rhode Island barbershop, designed to feel sharper, more current, and usable across signage and apparel.',
      images: [
        wixImage('69fcba_91d4f86b0d404ea09edd221fa2a52143~mv2_d_12455_12455_s_6_4_3.jpg'),
        wixImage('69fcba_e341b5a402e04ea4a2f103a5300d2626~mv2_d_12455_12455_s_6_4_3.jpg'),
        wixImage('69fcba_339287b598a14ba4bd2fbc0d08cc97c3~mv2_d_7386_7022_s_4_2.jpg')
      ]
    },
    {
      id: 'troy-baseball-expos',
      type: 'Brand Identity / Sports',
      title: 'Troy Baseball Expos',
      description: 'Team identity refresh for a Troy, New York baseball program coached by former professional pitcher Eric Beaulac.',
      images: [
        wixImage('69fcba_e59f8d81ed27406f820bf8027f6d6742~mv2_d_3300_3300_s_4_2.jpg'),
        wixImage('69fcba_da30f0786f644d6cb97544fa87419c6f~mv2_d_3300_3300_s_4_2.jpg'),
        wixImage('69fcba_49e43da9d451453e86c44bef7d2665b5~mv2.jpg')
      ]
    },
    {
      id: 'variance-health',
      type: 'Brand Identity / Health',
      title: 'Variance Health',
      description: 'Healthcare startup identity concept focused on making prescription access feel simpler and more approachable.',
      images: [
        wixImage('69fcba_6a6d7d758c5b4a7789e1643b9284af76~mv2.jpg'),
        wixImage('69fcba_5fbfd1ac2e224e3d806229577f29c284~mv2.jpg'),
        wixImage('69fcba_c527c08648c84d4ca347ee5944a0ee7e~mv2.jpg')
      ]
    },
    {
      id: 'onehub',
      type: 'Brand Identity / Concepts',
      title: 'OneHub Logo Concepts',
      description: 'Logo exploration for OneHub, an internal intranet application created for PharMerica employees.',
      images: [
        wixImage('69fcba_a177d159f94f45a881e876d5e021b73b~mv2.jpg'),
        wixImage('69fcba_5bfcb2ba1cef4cdc9c9db9e2c7bdabca~mv2.png'),
        wixImage('69fcba_49dbcc6a92e84cfb8697b040b8f40696~mv2.png')
      ]
    },
    {
      id: 'fast-athletics',
      type: 'Brand Identity / Sports',
      title: 'F.A.S.T Athletics',
      description: 'Youth sports identity for an after-school athletics program serving children from Pre-K through middle school.',
      images: [
        wixImage('69fcba_59585e63dc584a4dbb8c212aac67eccc~mv2_d_8356_8357_s_4_2.png'),
        wixImage('69fcba_43d01e4c9d3945b48b75e22dba79caea~mv2_d_6000_5600_s_4_2.jpg'),
        wixImage('69fcba_fc5c9104dd634048820d953df18cb014~mv2_d_8356_8335_s_4_2.png')
      ]
    },
    {
      id: 'acorn-financial',
      type: 'Brand Identity / Financial',
      title: 'Acorn Financial',
      description: 'Brand refresh for a Washington, D.C. financial planning firm, balancing trust with a more contemporary visual direction.',
      images: [
        wixImage('69fcba_4d02015976854743bbc531a98b84941d~mv2.jpg'),
        wixImage('69fcba_882847fcf31942cd829cfd6932b2638e~mv2.jpg'),
        wixImage('69fcba_1cd58c4ecbc04999bc479a9b522829b7~mv2.jpg')
      ]
    },
    {
      id: 'worcester-sga',
      type: 'Brand Identity / Institutional',
      title: 'Worcester Student Government Association',
      description: 'Identity update designed for clearer recognition across Worcester Student Government Association communications.',
      images: [
        wixImage('69fcba_627746b02c85482cae43aae79bd2f7fc~mv2_d_1920_1920_s_2.jpg'),
        wixImage('69fcba_1e18f7f081bc43e280ba985b35443eb5~mv2_d_2530_1345_s_2.png')
      ]
    },
    {
      id: 'lupos',
      type: 'Brand Identity / Entertainment',
      title: 'Lupo’s Heartbreak Hotel',
      description: 'Logo redesign concept for Lupo’s Heartbreak Hotel, a music venue in Providence, Rhode Island.',
      images: [
        wixImage('69fcba_be49e76507ca42babf4b9d88ea5c1ea7~mv2.jpg'),
        wixImage('69fcba_e781f0aa35664546b548a932ae4be31f~mv2.jpg'),
        wixImage('69fcba_d12b682ca85f4c669b6114ce7912d941~mv2_d_7000_6000_s_4_2.jpg')
      ]
    },
    {
      id: 'event-postcard',
      type: 'Graphic Design / Social',
      title: 'Event & Social Graphics',
      description: 'A collection of social graphics, infographics, and seasonal posts designed for fast, clear digital communication.',
      images: [
        wixImage('69fcba_ff12cbf013184ba9967336595813c69c~mv2.jpg'),
        wixImage('69fcba_d0667739e936432c9dfdfcfe0bce727c~mv2.jpg'),
        wixImage('69fcba_6fbecc56c4944b5a89c497a34d146115~mv2.jpg')
      ]
    },
    {
      id: 'california-taco',
      type: 'Graphic Design / Environmental',
      title: 'California Taco Food Truck',
      description: 'Full vehicle-wrap concept for a Rhode Island taco chain, turning the truck into a moving brand touchpoint.',
      images: [
        wixImage('69fcba_99308d51e73b4e93a00087eade697830~mv2.jpg'),
        wixImage('69fcba_35120c9da2b14fb8a634ed532230719e~mv2.jpg'),
        wixImage('69fcba_8f008acfac214713beffb31bddcfdc5f~mv2.jpg')
      ]
    },
    {
      id: 'quest-magazine',
      type: 'Editorial Design / Study',
      title: 'Quest Magazine',
      description: 'Editorial design study for a travel magazine, focused on hierarchy, pacing, photography, and spread composition.',
      images: [
        wixImage('69fcba_abf6b4067ff64901acc5d377ebb3c950~mv2_d_3304_3304_s_4_2.jpg'),
        wixImage('69fcba_d4d1fa59c7114a039bf0b45e3ec0c44e~mv2.png'),
        wixImage('69fcba_186a4a5c038341cf8044e987b276c0be~mv2.png')
      ]
    },
    {
      id: '50words-camden-yards',
      type: 'Graphic Design / Promotion',
      title: '50Words Giveaway — Camden Yards',
      description: 'Promotional giveaway postcard for 50 Words and Marketing At The Yards at Camden Yards.',
      images: [
        wixImage('69fcba_abb998b3f75348be98015453db858308~mv2.jpg'),
        wixImage('69fcba_d1fbbda33e71487a9e288b49cbe716f5~mv2.jpg'),
        wixImage('69fcba_3df03396ab5c47dbb702a6921ffc70e2~mv2.jpg')
      ]
    },
    {
      id: 'worcester-art-festival',
      type: 'Graphic Design / Print',
      title: 'Worcester Art Festival',
      description: 'Event postcard created for a student art show in Worcester, Massachusetts.',
      images: [wixImage('69fcba_34d7acccbf084a23ab0bb76d37b45d68~mv2.png')]
    },
    {
      id: 'calendar-design',
      type: 'Graphic Design / Study',
      title: 'Calendar Design',
      description: 'Calendar design study exploring typography, layout, and a more playful visual system.',
      images: [wixImage('69fcba_04e88ca85cfa47b493ea0277b49e09e5~mv2_d_2500_3547_s_4_2.jpg')]
    },
    {
      id: 'art-festival-poster',
      type: 'Graphic Design / Poster',
      title: 'Art Festival Poster',
      description: 'Poster design for the Worcester Public Schools student art festival.',
      images: [wixImage('69fcba_0a8da0f4146e4efea0d4602a8151b339~mv2_d_1584_2448_s_2.jpg')]
    },
    {
      id: 'website-redesign',
      type: 'Digital Design / Web',
      title: 'Website Redesign',
      description: 'Website redesign concept for Justin’s Lawn & Landscape, focused on a cleaner, more contemporary customer experience.',
      images: [wixImage('69fcba_cbf21a7465b440f6a1e502e57fdc413c~mv2.jpg')]
    }
  ],
  illustrations: [
    {
      id: 'cartoon-boneheads',
      type: 'Illustration / Character',
      title: 'Cartoon Boneheads',
      description: 'Character illustration series translating friends and personalities into a consistent stylized visual language.',
      images: [
        wixImage('69fcba_3d22f714d2804026a79f80cc33a6ab6d~mv2_d_11820_5018_s_4_2.png'),
        wixImage('69fcba_c604aae510e74e1fbd27e0b2a6e456f6~mv2_d_3300_3300_s_4_2.png'),
        wixImage('69fcba_69144c93a0db413aa8080be79cbf9691~mv2_d_3300_3300_s_4_2.png')
      ]
    },
    {
      id: 'amc-mascot',
      type: 'Illustration / Mascot',
      title: 'Anna Maria College Mascot',
      description: 'Mascot concept for Anna Maria College, exploring a more distinctive and energetic interpretation of the school character.',
      images: [
        wixImage('69fcba_96ac0841dc87488d83d7cb465f6f9749~mv2_d_24721_13465_s_5_4.png'),
        wixImage('69fcba_f48493ad60d14e35b8724744fb02c01e~mv2.jpg'),
        wixImage('69fcba_a9603ba6c68246159aae3fc7f2c44750~mv2.png')
      ]
    },
    {
      id: 'genie',
      type: 'Illustration / Archive',
      title: 'Genie Illustration',
      description: 'An early illustration from high school that shows the hand-drawn foundation behind the later digital work.',
      images: [
        wixImage('69fcba_62b5fc22b3b141b4ae3ad70391aac334~mv2.png'),
        wixImage('69fcba_1227d56f5292471d88e01b8f9b44a4fb~mv2_d_2448_3264_s_4_2.jpg')
      ]
    }
  ],
  typography: [
    {
      id: 'imagine-type',
      type: 'Typography / Process',
      title: '“Imagine” Type Speed Art',
      description: 'A process-focused lettering piece showing how the composition develops from initial type exploration to the finished artwork.',
      images: ['https://i.ytimg.com/vi/u7CvF-PK0HQ/hqdefault.jpg'],
      video: 'https://www.youtube.com/embed/u7CvF-PK0HQ?rel=0'
    },
    {
      id: 'amc-geotag',
      type: 'Typography / Lettering',
      title: 'Anna Maria College Geotag',
      description: 'Custom geotag lettering created for visitors and social content at Anna Maria College.',
      images: [wixImage('69fcba_a9603ba6c68246159aae3fc7f2c44750~mv2.png')]
    },
    {
      id: 'good-vibes',
      type: 'Typography / Type Study',
      title: '“Good Vibes” Type Project',
      description: 'Expressive typography study focused on lettering form, composition, rhythm, and visual personality.',
      images: [
        wixImage('69fcba_768cd0f87b844ceabbd9effdd23918ef~mv2.jpg'),
        wixImage('69fcba_972fde3eff7c447c967a51bf0e83dbb7~mv2_d_5351_3056_s_4_2.jpg')
      ]
    },
    {
      id: 'rule-of-thumb',
      type: 'Typography / Hand Lettering',
      title: 'Rule of Thumb',
      description: 'Pencil lettering study exploring the phrase “Rule of Thumb” through hand-built letterforms.',
      images: [wixImage('69fcba_a0c76c159bc64bd8aa1e1fa3ddff43a0~mv2.jpg')]
    }
  ]
};

const categoryCopy = {
  designs: {
    title: 'Designs',
    text: 'Identity systems, logos, campaigns, editorial work, environmental graphics, print, and digital design spanning client work and selected studies.'
  },
  illustrations: {
    title: 'Illustrations',
    text: 'Character work and mascot concepts that show the drawing, shape-building, and visual storytelling behind the broader design practice.'
  },
  typography: {
    title: 'Typography',
    text: 'Lettering, type studies, geotags, and process work built around expressive typography and hand-drawn form.'
  }
};

const selectedWork = document.querySelector('#selected-work');
const workIntro = document.querySelector('#work .section-intro');

function projectCard(project, index) {
  const imageCount = project.video ? 'Watch process' : `${project.images.length} image${project.images.length === 1 ? '' : 's'}`;
  return `
    <article class="project-card" data-project-id="${project.id}">
      <button class="project-card__media-button" type="button" data-project-open="${project.id}" aria-label="View ${project.title}">
        <span class="project-card__media">
          <img src="${project.images[0]}" alt="${project.title}" loading="lazy" decoding="async" />
          <span class="project-card__count">${imageCount}</span>
        </span>
      </button>
      <div class="project-card__body">
        <p class="project-card__type"><span>${project.type}</span><span>${String(index + 1).padStart(2, '0')}</span></p>
        <h4>${project.title}</h4>
        <p>${project.description}</p>
        <button class="project-card__action project-card__media-button" type="button" data-project-open="${project.id}">${project.video ? 'Watch process' : 'View project'}</button>
      </div>
    </article>`;
}

function renderPortfolio() {
  if (!selectedWork) return;

  if (workIntro) {
    workIntro.textContent = 'Selected identity, graphic design, illustration, and typography work spanning client projects, campaigns, and independent studies.';
  }

  selectedWork.innerHTML = `
    <div class="portfolio-browser">
      <div class="portfolio-category-nav" role="tablist" aria-label="Work categories">
        ${Object.keys(portfolioProjects).map((key, index) => `
          <button class="portfolio-category-button${index === 0 ? ' is-active' : ''}" type="button" role="tab" aria-selected="${index === 0}" data-work-category="${key}">
            ${categoryCopy[key].title} <span>${String(portfolioProjects[key].length).padStart(2, '0')}</span>
          </button>`).join('')}
      </div>
      ${Object.keys(portfolioProjects).map((key, categoryIndex) => `
        <section class="portfolio-category-panel" data-work-panel="${key}" ${categoryIndex === 0 ? '' : 'hidden'}>
          <div class="portfolio-category-head">
            <h3>${categoryCopy[key].title}</h3>
            <p>${categoryCopy[key].text}</p>
          </div>
          <div class="project-grid">
            ${portfolioProjects[key].map(projectCard).join('')}
          </div>
        </section>`).join('')}
    </div>`;

  const categoryButtons = [...selectedWork.querySelectorAll('[data-work-category]')];
  const categoryPanels = [...selectedWork.querySelectorAll('[data-work-panel]')];

  const activateCategory = (key) => {
    categoryButtons.forEach((button) => {
      const active = button.dataset.workCategory === key;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    categoryPanels.forEach((panel) => {
      panel.hidden = panel.dataset.workPanel !== key;
    });
  };

  categoryButtons.forEach((button) => {
    button.addEventListener('click', () => activateCategory(button.dataset.workCategory));
  });
}

renderPortfolio();

const projectsById = Object.values(portfolioProjects).flat().reduce((map, project) => {
  map[project.id] = project;
  return map;
}, {});

const modal = document.createElement('div');
modal.className = 'project-modal';
modal.setAttribute('role', 'dialog');
modal.setAttribute('aria-modal', 'true');
modal.setAttribute('aria-hidden', 'true');
modal.innerHTML = `
  <div class="project-modal__stage">
    <button class="project-modal__close" type="button" aria-label="Close project">×</button>
    <button class="project-modal__nav project-modal__nav--prev" type="button" aria-label="Previous image">←</button>
    <div class="project-modal__visual"></div>
    <button class="project-modal__nav project-modal__nav--next" type="button" aria-label="Next image">→</button>
  </div>
  <div class="project-modal__info">
    <p class="project-modal__eyebrow"></p>
    <h3></h3>
    <p class="project-modal__description"></p>
    <p class="project-modal__counter"></p>
  </div>`;
document.body.appendChild(modal);

let activeProject = null;
let activeImageIndex = 0;
const modalVisual = modal.querySelector('.project-modal__visual');
const modalPrev = modal.querySelector('.project-modal__nav--prev');
const modalNext = modal.querySelector('.project-modal__nav--next');

function updateModalVisual() {
  if (!activeProject) return;

  modal.querySelector('.project-modal__eyebrow').textContent = activeProject.type;
  modal.querySelector('.project-modal__info h3').textContent = activeProject.title;
  modal.querySelector('.project-modal__description').textContent = activeProject.description;

  if (activeProject.video) {
    modalVisual.innerHTML = `<iframe class="project-modal__video" src="${activeProject.video}" title="${activeProject.title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    modalPrev.hidden = true;
    modalNext.hidden = true;
    modal.querySelector('.project-modal__counter').textContent = 'Process video';
    return;
  }

  modalVisual.innerHTML = `<img src="${activeProject.images[activeImageIndex]}" alt="${activeProject.title} — image ${activeImageIndex + 1}" />`;
  const multiple = activeProject.images.length > 1;
  modalPrev.hidden = !multiple;
  modalNext.hidden = !multiple;
  modal.querySelector('.project-modal__counter').textContent = `${String(activeImageIndex + 1).padStart(2, '0')} / ${String(activeProject.images.length).padStart(2, '0')}`;
}

function openProject(projectId) {
  activeProject = projectsById[projectId];
  if (!activeProject) return;
  activeImageIndex = 0;
  updateModalVisual();
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  modal.querySelector('.project-modal__close').focus();
}

function closeProject() {
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  modalVisual.innerHTML = '';
  activeProject = null;
}

function moveProjectImage(direction) {
  if (!activeProject || activeProject.video || activeProject.images.length < 2) return;
  activeImageIndex = (activeImageIndex + direction + activeProject.images.length) % activeProject.images.length;
  updateModalVisual();
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-project-open]');
  if (trigger) openProject(trigger.dataset.projectOpen);
  if (event.target === modal) closeProject();
});

modal.querySelector('.project-modal__close').addEventListener('click', closeProject);
modalPrev.addEventListener('click', () => moveProjectImage(-1));
modalNext.addEventListener('click', () => moveProjectImage(1));

document.addEventListener('keydown', (event) => {
  if (!modal.classList.contains('is-open')) return;
  if (event.key === 'Escape') closeProject();
  if (event.key === 'ArrowLeft') moveProjectImage(-1);
  if (event.key === 'ArrowRight') moveProjectImage(1);
});

const onScroll = () => siteHeader?.classList.toggle('is-scrolled', window.scrollY > 28);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

if (!prefersReducedMotion) {
  const processLayer = document.querySelector('.hero-process');
  const markLayer = document.querySelector('.hero-mark-layer');
  window.addEventListener('scroll', () => {
    const shift = Math.min(window.scrollY * 0.08, 42);
    if (processLayer) processLayer.style.transform = `scale(1.08) translateY(${shift}px)`;
    if (markLayer) markLayer.style.transform = `rotate(-2deg) translateY(${shift * .28}px)`;
  }, { passive: true });
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('is-visible');
  });
}, { threshold: .12 });

function observeRevealElements() {
  document.querySelectorAll('.section-heading, .project-card, .portfolio-category-head, .experience-row, .service, .about-image-wrap, .about-copy, .contact-copy').forEach((element) => {
    if (element.hasAttribute('data-reveal')) return;
    element.setAttribute('data-reveal', '');
    observer.observe(element);
  });
}

observeRevealElements();

const year = document.querySelector('[data-year]');
if (year) year.textContent = new Date().getFullYear();