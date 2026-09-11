(() => {
  const applyContactEmail = () => {
    const contactEmail = document.querySelector('.contact-email');
    if (!contactEmail) return;
    contactEmail.href = 'mailto:justinsenus@gmail.com';
    contactEmail.innerHTML = 'justinsenus@gmail.com <span aria-hidden="true">↗</span>';
  };

  const loadMobilePolish = () => {
    if (document.querySelector('link[href^="mobile.css"]')) return;
    const mobileStyles = document.createElement('link');
    mobileStyles.rel = 'stylesheet';
    mobileStyles.href = 'mobile.css?v=7d3a9bb5';
    document.head.appendChild(mobileStyles);
  };

  const base = document.createElement('script');
  base.src = 'https://cdn.jsdelivr.net/gh/justinsenus/justins-sports-center@9ee54f480f1690eaf00daa7bbe4b7a80395615e2/portfolio/script.js';
  base.onload = () => {
    applyContactEmail();

    const brewersProject = document.createElement('script');
    brewersProject.src = 'brewers-project.js?v=687fdca5';
    brewersProject.onload = () => {
      applyContactEmail();
      loadMobilePolish();
    };
    document.body.appendChild(brewersProject);
  };
  base.onerror = () => {
    applyContactEmail();
    loadMobilePolish();
    console.error('Portfolio base script failed to load.');
  };
  document.head.appendChild(base);
})();