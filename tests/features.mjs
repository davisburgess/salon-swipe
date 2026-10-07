// Every user-facing feature of the alpha, where it lives, and what proves it works.
// `where`: file paths, or "app.js#Section" for a section of alpha/js/app.js (its /* ---------- X ---------- */ markers).
// `checks`: automated checks. "unit:<test name>" lives in tests/*.test.mjs; "e2e:<id>" is a named check in tests/e2e.mjs;
//           "live:<museum>" runs nightly against the real museum APIs.
// `phone`: what to eyeball on a real phone when this feature is touched, because a headless browser can't judge it.

export const FEATURES = [
  // Looking
  { id: "look.opening", name: "Opening hang: 34 traditions in order, labelled, never skipped", where: ["alpha/js/deck.js", "alpha/js/curation.js", "app.js#the stage", "app.js#decisions"],
    checks: ["unit:opening hang delivers one work per tradition, in order, labelled", "e2e:look.opening"] },
  { id: "look.gestures", name: "Drag right/left/up/down to keep, pass, love, later", where: ["app.js#gestures", "alpha/app.css"],
    checks: ["e2e:look.gestures"], phone: "Drag a card each way, slowly and fast; the right edge label appears and the card flies off." },
  { id: "look.buttons", name: "Buttons and keyboard shortcuts for every action", where: ["app.js#decisions", "alpha/index.html"], checks: ["e2e:look.buttons"] },
  { id: "look.why", name: "Reasons chips after a Love", where: ["app.js#why chips"], checks: ["e2e:look.why"] },
  { id: "look.later", name: "Later: returns 15–25 decisions on, second look opens wall text, third Later is undecided", where: ["alpha/js/deck.js", "app.js#decisions", "app.js#the stage"],
    checks: ["unit:Later returns a card 15-25 decisions on; the third deferral is undecided", "e2e:look.later"] },
  { id: "look.undo", name: "Multi-step undo of swipes, Later and New style", where: ["app.js#decisions"], checks: ["e2e:look.undo"] },
  { id: "look.newstyle", name: "New style replaces the current work without a vote", where: ["alpha/js/deck.js", "app.js#decisions"],
    checks: ["unit:New style replaces the current work without recording a decision", "e2e:look.newstyle"] },
  { id: "look.cue", name: "Every card says why it was picked", where: ["app.js#the stage", "alpha/js/model.js"], checks: ["e2e:look.cue"] },
  { id: "look.wall", name: "Wall tint follows each work; art hangs at true proportions above its label", where: ["app.js#wall color", "app.js#the stage", "alpha/app.css"],
    checks: ["e2e:look.wall"], phone: "Glance at three works: art fills the space without cropping, label sits just under it." },
  { id: "look.broken", name: "Works whose image fails are skipped and never return", where: ["app.js#the stage"], checks: ["e2e:look.broken"] },
  { id: "look.outage", name: "Clear message and retry when every museum is down", where: ["app.js#the stage", "alpha/js/sources.js"], checks: ["e2e:look.outage"] },
  { id: "look.norepeat", name: "No repeats, no copies of the same work, artists spaced 6 apart", where: ["alpha/js/deck.js", "alpha/js/util.js"],
    checks: ["unit:no repeats: same id, same work under another record, or within one batch", "unit:artist spacing holds across the queue when alternatives exist", "e2e:look.norepeat"] },

  // Wall text
  { id: "wall.sheet", name: "Wall text: description, artist, on-view status, facts, museum link", where: ["app.js#Tell me more", "alpha/js/sources.js"], checks: ["e2e:wall.sheet"] },
  { id: "wall.scale", name: "Size compared with a 170 cm person", where: ["app.js#Tell me more", "alpha/js/util.js"], checks: ["unit:dimension parsing", "e2e:wall.scale"] },
  { id: "wall.decide", name: "Decide from the wall text: buttons, or swipe the panel left/right; not offered when opened from Kept", where: ["app.js#Tell me more", "alpha/index.html", "alpha/app.css"],
    checks: ["e2e:wall.decide"], phone: "Open the wall text, scroll it, then swipe the panel right: it keeps the work and the next one appears." },
  { id: "wall.zoom", name: "Full-size view with tap to zoom", where: ["app.js#Tell me more"], checks: ["e2e:wall.zoom"], phone: "Open full size, tap to zoom, pan around, close." },
  { id: "wall.reasons", name: "Why you're seeing this", where: ["app.js#Tell me more", "alpha/js/model.js"], checks: ["unit:model learns a clear preference and explains it", "e2e:wall.reasons"] },

  // Taste
  { id: "model.learning", name: "Taste model learns, predicts and reports honest accuracy", where: ["alpha/js/model.js", "alpha/js/vision.js"],
    checks: ["unit:model learns a clear preference and explains it", "unit:fit rebuilds an honest accuracy record and ignores undecided", "unit:vision measures brightness and warmth"] },
  { id: "taste.levels", name: "Levels need range and accuracy; level-up note", where: ["alpha/js/rewards.js", "app.js#progress"],
    checks: ["unit:levels need range and accuracy, not just volume", "e2e:taste.levels"] },
  { id: "taste.notes", name: "Curator's Notes vary, follow the tone, avoid repeats", where: ["alpha/js/rewards.js", "app.js#progress", "app.js#Taste"],
    checks: ["unit:offline note draws only on facts we have", "e2e:taste.notes"] },
  { id: "taste.tone", name: "Tone setting changes the notes", where: ["app.js#Taste", "alpha/js/rewards.js"], checks: ["e2e:taste.tone"] },
  { id: "taste.badges", name: "Badge cabinet: 39 pins, tap for detail and wall label", where: ["alpha/js/badges.js", "app.js#Taste", "app.js#progress"],
    checks: ["unit:cabinet: 46 pins, unique ids, every rule runs on an empty history", "unit:lineages, secrets and dates come from real-looking history", "e2e:taste.badges"] },
  { id: "badges.tiers", name: "Tiers earned early stay sealed until your level arrives", where: ["alpha/js/badges.js", "app.js#progress"],
    checks: ["unit:tiers earned beyond your level stay sealed until the level arrives"] },
  { id: "taste.recalibrate", name: "A changed level ladder re-reads your level once, and can demote", where: ["app.js#level recalibration", "alpha/js/rewards.js"], checks: ["e2e:taste.recalibrate"] },
  { id: "badges.ceremony", name: "Existing history earns its pins in one welcome-back moment", where: ["app.js#progress", "alpha/js/badges.js"], checks: ["e2e:badges.ceremony"] },
  { id: "taste.app", name: "How well we know you: the app's own score, scored fairly, never gating", where: ["alpha/js/badges.js", "app.js#Taste", "app.js#decisions", "alpha/js/rewards.js"],
    checks: ["unit:the app is scored fairly: its matches against everything else, never your level", "unit:levels ignore prediction accuracy entirely", "e2e:taste.portrait"] },
  { id: "badges.pattern", name: "Your pattern: steady or shifting, generous or selective, slow or quick", where: ["alpha/js/badges.js"], checks: ["unit:pattern pins: both ends of a trait earn a pin"] },
  { id: "taste.portrait", name: "Your eye as a title, traits, Called it", where: ["alpha/js/badges.js", "app.js#Taste", "app.js#decisions"],
    checks: ["unit:eye traits need a clear lean and enough looking; the title follows", "e2e:taste.portrait"] },
  { id: "taste.jump", name: "Sticky jump bar scrolls to sections and follows your scroll", where: ["app.js#Taste", "alpha/app.css"], checks: ["e2e:taste.jump"] },
  { id: "geo.places", name: "Places mapped to modern countries", where: ["alpha/js/geo.js"], checks: ["unit:place lexicon maps how museums describe place to modern countries"] },
  { id: "app.shell", name: "Offline shell includes every module", where: ["alpha/sw.js"], checks: ["unit:offline shell lists every module the app imports", "e2e:app.offline"] },
  { id: "taste.leanings", name: "What you respond to, reasons, undecided list", where: ["app.js#Taste", "alpha/js/model.js"], checks: ["e2e:taste.leanings"] },

  // Kept
  { id: "kept.grid", name: "Kept grid with All / Loved / On view in Chicago filters", where: ["app.js#Kept"], checks: ["e2e:kept.grid"] },
  { id: "kept.love", name: "Star to love or unlove from Kept and the wall text", where: ["app.js#Loved (favorites) from Kept and the wall text"], checks: ["e2e:kept.love"] },

  // Settings and data
  { id: "settings.discovery", name: "Discovery slider is saved", where: ["app.js#Settings"], checks: ["e2e:settings.discovery"] },
  { id: "settings.museums", name: "Turning a museum off stops its works", where: ["app.js#Settings", "alpha/js/deck.js"], checks: ["e2e:settings.museums"] },
  { id: "data.backup", name: "Backup file and restore (Picture Plane and Salon Swipe formats)", where: ["app.js#backup, restore, import", "alpha/js/store.js"],
    checks: ["unit:backups round-trip and merges keep the newest record", "unit:Salon Swipe history converts and trains the model", "e2e:data.backup"] },
  { id: "data.import", name: "One-tap import of Salon Swipe history on first run", where: ["app.js#first run", "app.js#backup, restore, import", "alpha/js/store.js"], checks: ["e2e:data.import"] },
  { id: "data.reset", name: "Erase this device", where: ["app.js#Settings"], checks: ["e2e:data.reset"] },
  { id: "sync.devices", name: "Sync on, pairing link, two devices converge", where: ["alpha/js/sync.js", "app.js#pairing from a link", "app.js#Settings", "worker/src/index.js"],
    checks: ["unit:two devices converge; newest decision wins; other keys see nothing", "e2e:sync.devices"] },
  { id: "sync.notes", name: "Claude-written notes through the backend", where: ["worker/src/index.js", "alpha/js/sync.js", "app.js#progress"],
    checks: ["unit:notes call Claude with the taste summary, parse JSON, and are rate limited", "e2e:sync.notes"] },
  { id: "sync.delete", name: "Delete synced data", where: ["worker/src/index.js", "app.js#Settings"], checks: ["unit:account deletion erases everything for that key only"] },

  // App shell
  { id: "app.onboarding", name: "First-run welcome", where: ["app.js#first run"], checks: ["e2e:app.onboarding"] },
  { id: "app.offline", name: "Opens offline after first visit", where: ["alpha/sw.js", "app.js#boot"], checks: ["e2e:app.offline"], phone: "Add to Home Screen once; open it in airplane mode." },
  { id: "app.install", name: "Installable: manifest and icons", where: ["alpha/manifest.webmanifest", "alpha/icons/", "alpha/index.html"], checks: ["e2e:app.install"] },
  { id: "app.privacy", name: "Privacy page and credits", where: ["alpha/privacy.html", "app.js#Settings"], checks: ["e2e:app.privacy"] },
  { id: "app.errors", name: "No script errors anywhere in a full session", where: ["alpha/js/"], checks: ["e2e:app.errors"] },

  // Content sources
  { id: "sources.chicago", name: "Art Institute of Chicago works", where: ["alpha/js/sources.js"], checks: ["unit:Chicago normalizer", "live:aic"] },
  { id: "sources.met", name: "The Met works", where: ["alpha/js/sources.js"], checks: ["unit:Met normalizer keeps only public-domain works with images", "live:met"] },
  { id: "sources.cleveland", name: "Cleveland Museum of Art works (static, rebuilt monthly; its API blocks browsers)", where: ["alpha/js/sources.js", "tools/build_cma.py", "alpha/data/cma/"],
    checks: ["unit:Cleveland normalizer", "unit:Cleveland normalizer on a real record prefers wall text and real image", "unit:static collections: term search and browse over shards", "live:cma"] },
  { id: "sources.nga", name: "National Gallery of Art works (static, rebuilt monthly)", where: ["alpha/js/sources.js", "tools/build_nga.py", "alpha/data/nga/"],
    checks: ["unit:static collections: term search and browse over shards", "e2e:sources.mix", "live:nga"] },
  { id: "sources.wikidata", name: "Wikidata and Wikimedia Commons paintings", where: ["alpha/js/sources.js"], checks: ["unit:Wikidata normalizer on a real SPARQL response", "e2e:sources.mix", "live:wd"] },
  { id: "sources.vam", name: "Victoria and Albert Museum works and wall text", where: ["alpha/js/sources.js"], checks: ["unit:V&A normalizer on a real search response", "e2e:sources.mix", "live:vam"] },
  { id: "sources.smk", name: "SMK (National Gallery of Denmark) works", where: ["alpha/js/sources.js"], checks: ["unit:SMK normalizer on a real search response", "e2e:sources.mix", "live:smk"] },
];
