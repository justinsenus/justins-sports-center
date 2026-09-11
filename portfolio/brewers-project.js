(() => {
  const project = {
    id: 'brewers-trading-cards',
    type: 'Sports Design / Trading Cards',
    title: 'Brewers Trading Cards',
    description: 'A custom player trading-card series created for the Merrimack Brewers baseball team, combining action photography, expressive script typography, team branding, player storytelling, and collectible-style presentation across roster graphics and promotional content.',
    images: [
      'https://static.wixstatic.com/media/69fcba_7ad215d014ac49428b21740dfdc00c17~mv2.jpg',
      'https://static.wixstatic.com/media/69fcba_f5700714dd8b489592d25c3dc4594e1f~mv2.jpg',
      'https://static.wixstatic.com/media/69fcba_bf2a5c3482254c28af8fb559f6582915~mv2.jpg',
      'https://static.wixstatic.com/media/69fcba_ead8ff81d34841a4a17a8bd0c5d289a3~mv2.jpg',
      'https://static.wixstatic.com/media/69fcba_812afa3747ed4698b7b8eaf290018b0f~mv2.png',
      'https://static.wixstatic.com/media/69fcba_b2d7c587258e4230bfca3cec7579678d~mv2.png',
      'https://static.wixstatic.com/media/69fcba_22274ac8cc374d17899bfe89d9205ef2~mv2.png',
      'https://static.wixstatic.com/media/69fcba_5e3a5f8e9b7c4e8d936094c0d0500447~mv2.jpg',
      'https://static.wixstatic.com/media/69fcba_81097eec831c43b189d1d085adf7afb0~mv2.jpg',
      'https://static.wixstatic.com/media/69fcba_18f0480b23f04d60a7e4922f06bd688f~mv2.jpg',
      'https://static.wixstatic.com/media/69fcba_9298ee572625415bb012a707d480e4f8~mv2.jpg'
    ],
    videoAsset: 'https://video.wixstatic.com/video/69fcba_8913c178d55e4477b652d4263b15a114/file'
  };

  if (!portfolioProjects.designs.some((item) => item.id === project.id)) {
    portfolioProjects.designs.unshift(project);
  }
  projectsById[project.id] = project;

  const originalProjectCard = projectCard;
  projectCard = function (item, index) {
    const html = originalProjectCard(item, index);
    if (!item.videoAsset) return html;
    const total = item.images.length + 1;
    return html.replace(
      `${item.images.length} images`,
      `${total} pieces`
    );
  };

  const originalUpdateModalVisual = updateModalVisual;
  updateModalVisual = function () {
    if (!activeProject?.videoAsset) {
      originalUpdateModalVisual();
      return;
    }

    modal.querySelector('.project-modal__eyebrow').textContent = activeProject.type;
    modal.querySelector('.project-modal__info h3').textContent = activeProject.title;
    modal.querySelector('.project-modal__description').textContent = activeProject.description;

    const total = activeProject.images.length + 1;
    const showingVideo = activeImageIndex === activeProject.images.length;

    if (showingVideo) {
      modalVisual.innerHTML = `<video class="project-modal__video project-modal__video--portrait" src="${activeProject.videoAsset}" title="${activeProject.title} process video" controls autoplay playsinline preload="metadata"></video>`;
    } else {
      modalVisual.innerHTML = `<img src="${activeProject.images[activeImageIndex]}" alt="${activeProject.title} — image ${activeImageIndex + 1}" />`;
    }

    modalPrev.hidden = false;
    modalNext.hidden = false;
    modal.querySelector('.project-modal__counter').textContent = showingVideo
      ? `${String(total).padStart(2, '0')} / ${String(total).padStart(2, '0')} · Process video`
      : `${String(activeImageIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  };

  const originalMoveProjectImage = moveProjectImage;
  moveProjectImage = function (direction) {
    if (!activeProject?.videoAsset) {
      originalMoveProjectImage(direction);
      return;
    }
    const total = activeProject.images.length + 1;
    activeImageIndex = (activeImageIndex + direction + total) % total;
    updateModalVisual();
  };

  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'brewers-project.css';
  document.head.appendChild(style);

  renderPortfolio();
  observeRevealElements();

  const contactEmail = document.querySelector('.contact-email');
  if (contactEmail) {
    contactEmail.href = 'mailto:justinsenus@gmail.com';
    contactEmail.innerHTML = 'justinsenus@gmail.com <span aria-hidden="true">↗</span>';
  }
})();