(() => {
  "use strict";

  // The catalog is intentionally explicit: the dashboard reports which sources
  // are live instead of implying that an unavailable/paywalled site was scraped.
  window.FANTASY_SOURCE_CATALOG = [
    { id: "fantasypros", name: "FantasyPros", type: "projection", access: "api" },
    { id: "rotowire", name: "RotoWire", type: "projection", access: "subscription" },
    { id: "rotoballer", name: "RotoBaller", type: "projection", access: "public" },
    { id: "nfl-fantasy", name: "NFL Fantasy", type: "projection", access: "public" },
    { id: "espn", name: "ESPN Fantasy", type: "projection", access: "public" },
    { id: "sleeper", name: "Sleeper", type: "projection", access: "public" },
    { id: "yahoo", name: "Yahoo Fantasy", type: "projection", access: "api" },
    { id: "cbs", name: "CBS Sports", type: "projection", access: "public" },
    { id: "nbc-edge", name: "NBC Sports Edge", type: "projection", access: "public" },
    { id: "fantasy-points", name: "Fantasy Points", type: "projection", access: "subscription" },
    { id: "pff", name: "PFF Fantasy", type: "projection", access: "subscription" },
    { id: "4for4", name: "4for4", type: "projection", access: "subscription" },
    { id: "footballguys", name: "Footballguys", type: "projection", access: "subscription" },
    { id: "numberfire", name: "NumberFire", type: "projection", access: "public" },
    { id: "fantasy-life", name: "Fantasy Life", type: "projection", access: "public" },
    { id: "playerprofiler", name: "PlayerProfiler", type: "projection", access: "public" },
    { id: "fantasy-alarm", name: "Fantasy Alarm", type: "projection", access: "public" },
    { id: "draftsharks", name: "Draft Sharks", type: "projection", access: "public" },
    { id: "razzball", name: "Razzball", type: "projection", access: "public" },
    { id: "fftoday", name: "FFToday", type: "projection", access: "public" },
    { id: "fantasy-six-pack", name: "Fantasy Six Pack", type: "projection", access: "public" },
    { id: "pfn", name: "Pro Football Network", type: "projection", access: "public" },
    { id: "action-network", name: "Action Network", type: "projection", access: "public" },
    { id: "establish-the-run", name: "Establish The Run", type: "projection", access: "subscription" },
    { id: "sportsline", name: "SportsLine", type: "projection", access: "subscription" },
    { id: "fantasy-guru", name: "Fantasy Guru", type: "projection", access: "subscription" },
    { id: "draftkings", name: "DraftKings Fantasy", type: "projection", access: "public" },
    { id: "underdog", name: "Underdog Fantasy", type: "projection", access: "public" },
    { id: "sports-game-odds", name: "SportsGameOdds", type: "odds", access: "api" },
    { id: "the-odds-api", name: "The Odds API", type: "odds", access: "api" }
  ];
})();
