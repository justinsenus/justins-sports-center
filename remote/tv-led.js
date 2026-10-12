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
    return '<section class="glass-panel tv-stock"><div class="tv-panel-title"><h2>League stock</h2><span>' + data.series.length + ' teams · ' + (model.leagueStarted ? 'points' : 'projections') + '</span></div>' + charts.rangeControls() + '<div class="tv-stock-body"><div class="tv-stock-chart">' + charts.chart(data.series, data.raw, {league: true, projected: !model.leagueStarted, title: 'All league teams on one shared points scale'}) + '</div>' + legend(charts.rankSeries(data.series)) + '</div></section>';
  }

  function overview(model) {
    const events = tv.page(model.events || [], 2).items;
    return '<div class="led-overview">' + tv.roster(model, 'own') + '<div class="led-plots">' + momentum(model) + stock(model) + '</div>' + tv.roster(model, 'opponent') + '<div class="led-support">' + tv.injuries(model) + '<div class="led-support-right">' + fantasyStrip(model) + tv.feed({...model, events}) + '</div></div></div>';
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

  glass.render = () => {
    baseRender();
    const model = app.model();
    if (model.loading || !model.league.ready) return;
    if (!model.ui.playerId && ['overview', 'matchups'].includes(model.ui.view)) {
      patch(document.getElementById('workspace'), overview(model));
      fitRosters();
    }
    // Fantasy totals live beside injuries on the home screen. Retain the
    // complete fantasy ribbon on every other scene and the NFL ribbon always.
    const home = !model.ui.playerId && ['overview', 'matchups'].includes(model.ui.view);
    patch(document.getElementById('scoreStrips'), home ? '<div class="tv-score-strips led-nfl-only">' + tv.nflStrip(model) + '</div>' : tv.strips(model));
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

  window.FantasyLED = {overview, momentum, stock, legend, fantasyStrip};
  app.render();
})();
