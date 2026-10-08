// One vocabulary for every museum. Museums label the same thing many ways ("Impressionist", "Impressionism",
// "Dutch Golden Age painting"), and most records have no movement at all (70% of the National Gallery's, all of
// Cleveland's). The taste model needs consistent words, so this file maps every work to:
//   movement  a canonical movement name, when the museum gave one
//   school    a broader grouping every work gets, from its movement or, failing that, its country and date
//   type      a short list of object types (Painting, Print, Drawing, Sculpture...)
// The art-historical groupings follow standard survey usage; they are a lens for learning taste, not a judgment.

const ALIAS = [
  [/^impressionis[mt]$/, "Impressionism"], [/^post[- ]?impressionis[mt]$/, "Post-Impressionism"], [/^neo[- ]?impressionis[mt]$|pointill/, "Pointillism"],
  [/^expressionis[mt]$|expressionist$/, "Expressionism"], [/^cubis[mt]$/, "Cubism"], [/^fauvis[mt]$|^fauve/, "Fauvism"], [/^futuris[mt]$/, "Futurism"],
  [/^symbolis[mt]$/, "Symbolism"], [/^realis[mt]$/, "Realism"], [/^romantic(ism)?$/, "Romanticism"], [/^neo-?classic(ism|al)?$/, "Neoclassicism"],
  [/^rococo$/, "Rococo"], [/^baroque( art| painting)?$/, "Baroque"], [/dutch golden age/, "Dutch Golden Age"], [/^mannerism$/, "Mannerism"],
  [/^northern renaissance|netherlandish/, "Northern Renaissance"], [/renaissance/, "Renaissance"], [/^gothic( art)?$|international gothic/, "Gothic"],
  [/^byzantine/, "Byzantine"], [/^romanesque/, "Romanesque"], [/pre-?raphaelite/, "Pre-Raphaelite"], [/^art nouveau|jugendstil/, "Art Nouveau"],
  [/secession/, "Vienna Secession"], [/blaue reiter|blue rider/, "Der Blaue Reiter"], [/arts and crafts/, "Arts and Crafts"], [/^academic( art)?$/, "Academic art"],
  [/barbizon/, "Barbizon school"], [/hudson river/, "Hudson River School"], [/^tonalis[mt]$/, "Tonalism"], [/^luminis[mt]$/, "Luminism"],
  [/^precisionis[mt]$/, "Precisionism"], [/^surrealis[mt]$/, "Surrealism"], [/^dada/, "Dada"], [/naive art|^naïve|^folk art/, "Folk and naive art"],
  [/ukiyo/, "Ukiyo-e"], [/^orientalis[mt]$/, "Orientalism"], [/biedermeier/, "Biedermeier"], [/danish golden age/, "Danish Golden Age"],
  [/^japonisme$/, "Japonisme"], [/^victorian$/, "Victorian"], [/^aestheticism|aesthetic movement/, "Aestheticism"], [/^nabis?$/, "Les Nabis"],
];
// Chinese reign and dynasty names fold into their dynasty.
const DYNASTY = [[/qing|yongzheng|qianlong|kangxi|guangxu|jiaqing|daoguang/, "Qing dynasty"], [/ming|wanli|xuande|jiajing|chenghua|yongle/, "Ming dynasty"],
  [/song/, "Song dynasty"], [/yuan/, "Yuan dynasty"], [/tang/, "Tang dynasty"], [/^han\b|han dynasty/, "Han dynasty"], [/^jin\b|^liao\b/, "Jin and Liao dynasties"]];

export function canonMovement(m) {
  const s = String(m || "").trim(); if (!s) return null;
  const k = s.toLowerCase().replace(/\s+/g, " ");
  for (const [re, name] of DYNASTY) if (re.test(k)) return name;
  for (const [re, name] of ALIAS) if (re.test(k)) return name;
  return s.replace(/\b\w/g, (c) => c.toUpperCase());   // unknown labels pass through, tidied
}

// Movement -> school.
const MOVEMENT_SCHOOL = {
  "Antiquity": ["Etruscan", "Ancient Egypt", "Ancient Greece", "Ancient Rome", "Ancient Americas"],
  "Medieval": ["Byzantine", "Romanesque", "Gothic", "Medieval"],
  "Renaissance": ["Renaissance", "Northern Renaissance", "Mannerism", "Italian Renaissance"],
  "Baroque and Golden Age": ["Baroque", "Dutch Golden Age"],
  "Eighteenth century": ["Rococo", "Neoclassicism"],
  "Romantic and Realist": ["Romanticism", "Realism", "Academic art", "Barbizon school", "Hudson River School", "Biedermeier", "Danish Golden Age", "Pre-Raphaelite", "Orientalism", "Victorian", "Luminism"],
  "Impressionism and after": ["Impressionism", "Post-Impressionism", "Pointillism", "Tonalism", "Symbolism", "Les Nabis", "Japonisme", "Aestheticism", "Art Nouveau", "Arts and Crafts", "Vienna Secession"],
  "Early modern": ["Fauvism", "Expressionism", "Cubism", "Futurism", "Der Blaue Reiter", "Dada", "Surrealism", "Precisionism", "Modernist", "Bauhaus"],
  "East Asian traditions": ["Ukiyo-e", "Qing dynasty", "Ming dynasty", "Song dynasty", "Yuan dynasty", "Tang dynasty", "Han dynasty", "Jin and Liao dynasties", "Edo"],
  "Folk and naive": ["Folk and naive art"],
};
const M2S = {}; for (const [s, list] of Object.entries(MOVEMENT_SCHOOL)) for (const m of list) M2S[m] = s;
// Opening-hang labels the deck writes onto seed cards.
const SEED_SCHOOL = { "Ancient Egypt": "Antiquity", "Ancient Greece": "Antiquity", "Ancient Rome": "Antiquity", "Ancient Americas": "Ancient Americas",
  "Art of Africa": "Arts of Africa", "Art of the Islamic world": "Islamic world", "Mughal painting": "South Asian traditions", "Ming dynasty China": "East Asian traditions",
  "Qing dynasty China": "East Asian traditions", "Japanese screens": "East Asian traditions", "Italian Renaissance": "Renaissance", "American folk art": "Folk and naive" };

const EUROPEISH = new Set(["EU", "NA"]);
// No movement: infer the school from where and when.
function schoolFromPlace(iso, cont, y) {
  if (y != null && y < 400 && cont !== "NA" && cont !== "SA" && iso !== "MX") return "Antiquity";
  if (iso === "MX" || iso === "PE" || iso === "GT" || iso === "CO" || iso === "EC" || iso === "BO" || cont === "SA") return y != null && y < 1530 ? "Ancient Americas" : "Latin American art";
  if (cont === "AF" && iso !== "EG") return "Arts of Africa";
  if (iso === "EG") return y != null && y < 640 ? "Antiquity" : "Islamic world";
  if (["IR", "IQ", "SY", "TR", "AF", "UZ", "SA", "YE", "MA", "DZ", "TN"].includes(iso) && (y == null || y >= 640)) return iso === "TR" && y != null && y < 1453 ? "Medieval" : "Islamic world";
  if (["IN", "PK", "NP", "LK", "BD"].includes(iso)) return "South Asian traditions";
  if (["CN", "JP", "KR", "MN"].includes(iso)) return "East Asian traditions";
  if (["TH", "KH", "VN", "ID", "MM", "LA", "PH", "MY"].includes(iso)) return "Southeast Asian traditions";
  if (cont === "OC") return "Oceanic art";
  if (!EUROPEISH.has(cont) || y == null) return null;
  if (y < 1400) return "Medieval";
  if (y < 1600) return "Renaissance";
  if (y < 1700) return "Baroque and Golden Age";
  if (y < 1790) return "Eighteenth century";
  if (y < 1860) return "Romantic and Realist";
  if (y < 1905) return "Impressionism and after";
  return "Early modern";
}
export function schoolOf(movement, geo, year) {
  const m = canonMovement(movement);
  if (m && SEED_SCHOOL[movement]) return SEED_SCHOOL[movement];
  if (m && M2S[m]) return M2S[m];
  return schoolFromPlace(geo && geo.iso, geo && geo.continent, Number.isFinite(year) ? year : null);
}
export const SCHOOLS = [...new Set([...Object.keys(MOVEMENT_SCHOOL), ...Object.values(SEED_SCHOOL), "Islamic world", "South Asian traditions", "Southeast Asian traditions",
  "Latin American art", "Oceanic art", "Ancient Americas", "Arts of Africa"])];

// Neighbours: schools a fan of one is likeliest to enjoy next. Used to discover, never to decide.
export const ADJACENT = {
  "Antiquity": ["Eighteenth century", "Medieval", "Islamic world"], "Medieval": ["Renaissance", "Antiquity", "Islamic world"],
  "Renaissance": ["Baroque and Golden Age", "Medieval", "Romantic and Realist"], "Baroque and Golden Age": ["Renaissance", "Eighteenth century", "Romantic and Realist"],
  "Eighteenth century": ["Baroque and Golden Age", "Romantic and Realist", "Antiquity"], "Romantic and Realist": ["Impressionism and after", "Eighteenth century", "Baroque and Golden Age"],
  "Impressionism and after": ["Romantic and Realist", "Early modern", "East Asian traditions"], "Early modern": ["Impressionism and after", "Arts of Africa", "Folk and naive"],
  "East Asian traditions": ["Impressionism and after", "South Asian traditions", "Southeast Asian traditions"], "South Asian traditions": ["Islamic world", "East Asian traditions", "Southeast Asian traditions"],
  "Islamic world": ["South Asian traditions", "Medieval", "Antiquity"], "Arts of Africa": ["Early modern", "Oceanic art", "Ancient Americas"],
  "Ancient Americas": ["Antiquity", "Arts of Africa", "Latin American art"], "Folk and naive": ["Early modern", "Romantic and Realist"],
  "Southeast Asian traditions": ["South Asian traditions", "East Asian traditions"], "Latin American art": ["Ancient Americas", "Early modern"], "Oceanic art": ["Arts of Africa", "Ancient Americas"],
};

// Object types, from whatever the museum called it.
const TYPES = [[/photo|gelatin silver|albumen|daguerreotype|platinum print|salted paper/, "Photograph"], [/paint|oil on|canvas|panel|fresco|tempera/, "Painting"], [/miniature/, "Painting"],
  [/print|woodcut|woodblock|etching|engraving|lithograph|portfolio/, "Print"], [/drawing|watercolou?r|pastel|sketch/, "Drawing"], [/sculpt|statue|figure|relief|bust/, "Sculpture"],
  [/ceramic|porcelain|pottery|stoneware|earthenware|vase|jar|bowl/, "Ceramics"], [/textile|velvet|lace|embroider|garment|costume|carpet|rug|tapestry|silk/, "Textiles"],
  [/manuscript|book|volume|album|calligraph/, "Books and manuscripts"], [/metal|silver|gold|bronze|coin|arms|armor|armour|jewel|enamel/, "Metalwork and jewelry"],
  [/furniture|woodwork|lacquer|glass|jade|ivory|decorative|tool|spindle|funerary/, "Decorative arts"], [/mask/, "Sculpture"]];
export function typeOf(kind, medium) {
  const k = `${kind || ""} ${medium || ""}`.toLowerCase();
  for (const [re, t] of TYPES) if (re.test(k)) return t;
  return kind ? "Other objects" : null;
}

// Search words that find a school at museums whose search is text-only.
export const SCHOOL_QUERY = {
  "Antiquity": ["Greek", "Roman", "Egyptian", "Etruscan"], "Medieval": ["Byzantine", "Gothic", "Romanesque", "medieval"], "Renaissance": ["Renaissance", "Florentine", "Venetian"],
  "Baroque and Golden Age": ["Baroque", "Dutch Golden Age", "Rembrandt", "Flemish"], "Eighteenth century": ["Rococo", "Neoclassicism"],
  "Romantic and Realist": ["Romanticism", "Realism", "Hudson River School", "Barbizon"], "Impressionism and after": ["Impressionism", "Post-Impressionism", "Symbolism", "Art Nouveau"],
  "Early modern": ["Expressionism", "Cubism", "Fauvism", "Futurism"], "East Asian traditions": ["Ukiyo-e", "Ming dynasty", "Qing dynasty", "Japanese screen"],
  "South Asian traditions": ["Mughal", "Rajput", "Pahari"], "Islamic world": ["Islamic", "Persian", "Ottoman"], "Arts of Africa": ["African mask", "Yoruba", "Kongo"],
  "Ancient Americas": ["Pre-Columbian", "Maya", "Inca"], "Folk and naive": ["Naive art", "folk art"], "Southeast Asian traditions": ["Khmer", "Javanese", "Thai"],
  "Latin American art": ["Mexican", "Peruvian"], "Oceanic art": ["Maori", "New Guinea"],
};
