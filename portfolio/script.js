(() => {
  const base = document.createElement('script');
  base.src = 'https://cdn.jsdelivr.net/gh/justinsenus/justins-sports-center@9ee54f480f1690eaf00daa7bbe4b7a80395615e2/portfolio/script.js';
  base.onload = () => {
    const brewersProject = document.createElement('script');
    brewersProject.src = 'brewers-project.js?v=687fdca5';
    document.body.appendChild(brewersProject);
  };
  base.onerror = () => {
    console.error('Portfolio base script failed to load.');
  };
  document.head.appendChild(base);
})();