(() => {
  'use strict';
  if (document.body.dataset.screen !== 'tv' || document.body.dataset.tvStyle !== 'led') return;

  const app = window.FantasyCenter;
  const glass = window.FantasyGlass;
  const tv = window.FantasyTV;
  const charts = window.FantasyGlassCharts;
  const baseRender = glass.render;
  const esc = app.escape;
  const fmt = app.format;
  const patch = (element, markup) => window.FantasyDOM ? window.FantasyDOM.patch(element, markup) : element.innerHTML = markup;
  const dot = color => '<i class="team-dot" style="--team-color:' + esc(color) + '"></i>';

  function legend(series) {
    return '<div class="tv-chart-legend">' + series.map(item => '<span>' + dot(item.color) + '<b title="' + esc(item.name) + '">' + esc(item.name) + '</b><strong>' + fmt(item.value) + '</strong></span>').join('') + '</div>';
  }

  function momentum(model) {
    const data = glass.dataFor(model);
    return '<section class="glass-panel tv-momentum"><div class="tv-panel-title"><h2>' + (model.started ? 'Matchup scoring' : 'Matchup projections') + '</h2><span>' + (model.started ? 'Fantasy points' : 'Upcoming week') + '</span></div>' + legend(data.series) + charts.rangeControls() + charts.chart(data.series, data.raw, {slim: true, projected: !model.started, title: 'Recorded matchup points for ' + model.league.ownName + ' and ' + model.league.opponentName}) + '</section>';
  }

  function stock(model) {
    const data = glass.dataFor(model, true);
    // Draw ALL teams in the stock chart; page only the ranked text legend.
    const ranked = charts.rankSeries(data.series);
    const leaders = tv.page(ranked, 5);
    return '<section class="glass-panel tv-stock"><div class="tv-panel-title"><h2>League stock</h2><span>' + data.series.length + ' teams · top 5 ' + (leaders.pages > 1 ? leaders.current + '/' + leaders.pages : '') + '</span></div>' + charts.rangeControls() + '<div class="tv-stock-body"><div class="tv-stock-chart">' + charts.chart(data.series, data.raw, {league: true, projected: !model.leagueStarted, title: 'All league teams on one shared points scale'}) + '</div>' + legend(leaders.items) + '</div></section>';
  }

  function overview(model) {
    const events = tv.page(model.events || [], 5).items;
    return '<div class="led-overview">' + tv.roster(model, 'own') + '<div class="led-plots">' + momentum(model) + stock(model) + '</div>' + tv.roster(model, 'opponent') + '<div class="led-support"><div class="led-injury-compact">' + tv.injuries(model) + '</div>' + tv.feed({...model, events}) + '</div></div>';
  }

  function fantasyStrip(model) {
    const visible = tv.page(model.matchups || [], window.innerWidth < 1500 ? 1 : 2);
    return '<section class="glass-panel tv-score-strip tv-fantasy-strip" aria-label="All fantasy matchup scores"><div class="tv-strip-label"><h2>Fantasy scores</h2><span>Week ' + esc(model.league.week) + (visible.pages > 1 ? ' · ' + visible.current + '/' + visible.pages : '') + '</span></div><div class="tv-strip-cards" style="--led-matchups:' + Math.max(1, visible.items.length) + '">' + visible.items.map(matchup => '<article class="tv-strip-matchup" style="--home-color:' + esc(matchup.home.teamColor) + ';--away-color:' + esc(matchup.away.teamColor) + '">' + [matchup.home, matchup.away].map((team, index) => '<div style="--team-color:' + esc(team.teamColor) + '">' + dot(team.teamColor) + '<b>' + esc(team.name) + '</b><strong>' + fmt(model.leagueStarted ? (index ? matchup.awayScore : matchup.homeScore) : team.total ?? 0) + '</strong></div>').join('') + '</article>').join('') + '</div></section>';
  }

  function fitRosters() {
    const layouts = [...document.querySelectorAll('.led-overview .tv-roster')].map(roster => {
      const heights = [...roster.querySelectorAll('.tv-roster-row:not([hidden])')].map(row => row.getBoundingClientRect().height).filter(height => height > 0);
      return {roster, height: heights.length ? Math.max(18, Math.floor(Math.min(...heights) - 2)) : null};
    });
    for (const {roster, height} of layouts) if (height !== null) roster.style.setProperty('--tv-row-height', height + 'px');
  }

  // Record a baseline per league/team/week. Only increases to MY live fantasy
  // points create a celebration; the opponent, projections and first load do not.
  const ownScoreBaselines = new Map();
  let scoreShakeTimer;
  function celebrateOwnScore(model) {
    if (!model || model.loading || !model.league?.ready || !model.started) return;
    const value = model.ownActual;
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return;
    const key = [model.ui?.league || model.league.id || '', model.league.week ?? '', model.league.ownName || ''].join('|');
    const current = Number(value);
    const previous = ownScoreBaselines.get(key);
    ownScoreBaselines.set(key, current);
    if (previous === undefined || current <= previous + 0.001) return;
    const mascot = document.getElementById('headerMascot');
    if (!mascot) return;
    mascot.classList.remove('led-own-scored');
    void mascot.offsetWidth; // restart animation for consecutive scoring plays
    mascot.classList.add('led-own-scored');
    clearTimeout(scoreShakeTimer);
    scoreShakeTimer = setTimeout(() => mascot.classList.remove('led-own-scored'), 1050);
  }

  glass.render = () => {
    baseRender();
    const model = app.model();
    celebrateOwnScore(model);
    if (model.loading || !model.league.ready) return;
    if (!model.ui.playerId && ['overview', 'matchups'].includes(model.ui.view)) {
      patch(document.getElementById('workspace'), overview(model));
      fitRosters();
    }
    // Fantasy matchups and NFL scores share the BOTTOM of every LED scene.
    // The league scoring feed now owns the large supporting area above.
    const home = !model.ui.playerId && ['overview', 'matchups'].includes(model.ui.view);
    patch(document.getElementById('scoreStrips'), '<div class="tv-score-strips led-bottom-scores">' + fantasyStrip(model) + tv.nflStrip(model) + '</div>');
    document.body.dataset.ledScene = home ? 'home' : 'detail';
  };

  // Optional P2.5 pixel-grid guide. The LED wall's real resolution depends
  // on its physical dimensions; the sample assumes a 3.2 m × 1.8 m wall.
  const pitchButton = document.getElementById('ledPitchPreview');
  const pitchReadout = document.getElementById('ledPitchReadout');
  function showPitchGuide(enabled) {
    document.body.classList.toggle('pitch-preview', enabled);
    if (pitchButton) {
      pitchButton.setAttribute('aria-pressed', String(enabled));
      pitchButton.textContent = enabled ? 'P2.5 On' : 'P2.5 Preview';
    }
    if (pitchReadout) pitchReadout.hidden = !enabled;
    try {
      const url = new URL(window.location.href);
      if (enabled) url.searchParams.set('pitch', '2.5');
      else url.searchParams.delete('pitch');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    } catch (_) { /* Preview still works on older TV browsers. */ }
  }
  pitchButton?.addEventListener('click', () => showPitchGuide(!document.body.classList.contains('pitch-preview')));
  let previewFromLink = false;
  try { previewFromLink = new URL(window.location.href).searchParams.get('pitch') === '2.5'; } catch (_) {}
  if (previewFromLink) showPitchGuide(true);

  document.getElementById('ledFullscreen')?.addEventListener('click', async () => {
    const button = document.getElementById('ledFullscreen');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else button.title = 'Use your TV browser’s fullscreen option';
    } catch (_) {
      button.title = 'Use your TV browser’s fullscreen option';
    }
  });
  document.addEventListener('fullscreenchange', () => {
    document.getElementById('ledFullscreen')?.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
    app.render();
  });
  // The shared session handles the join form for either device role. Hide
  // the panel once the join succeeds, including a temporarily offline remote.
  document.addEventListener('fantasy:session', event => {
    if (event.detail?.paired) document.getElementById('pairPanel')?.classList.add('hidden');
  });

  window.FantasyLED = {overview, momentum, stock, legend, fantasyStrip, celebrateOwnScore};
  app.render();
})();
