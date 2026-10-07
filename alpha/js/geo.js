// Where a work was made, as a modern country. Museums describe place many ways ("French", "France, 19th century",
// "Mughal India, court of Akbar", "Venetian", a Wikidata country, an SMK nationality); this maps them to ISO codes.
// Modern borders are a lens, not history: a Mughal miniature lands in India, a Byzantine icon in Turkey.
// Unknown places return null rather than a guess.

// [iso, continent, ...names and adjectives, lowercase without accents]
const TABLE = [
  ["FR", "EU", "strasbourg", "limoges", "saint porchaire", "france", "french", "paris", "parisian", "lyon", "burgundian", "burgundy", "normandy", "provence"],
  ["IT", "EU", "mantuan", "mantua", "emilian", "gubbio", "parmese", "urbino", "deruta", "vicenza", "lucchese", "lucca", "turin", "pisan", "pisa", "rimini", "bergamo", "italy", "italian", "florence", "florentine", "venice", "venetian", "rome", "roman", "ancient rome", "siena", "sienese", "milan", "milanese",
    "bologna", "bolognese", "naples", "neapolitan", "genoa", "genoese", "lombard", "lombardy", "umbria", "umbrian", "ferrara", "ferrarese", "tuscany", "tuscan",
    "marchigian", "etruscan", "papal states", "padua", "paduan", "verona", "veronese", "parma", "sicily", "sicilian", "piedmont"],
  ["BE", "EU", "mosan", "belgium", "belgian", "flemish", "flanders", "antwerp", "brussels", "bruges", "ghent", "netherlandish", "southern netherlands", "low countries", "brabant", "liege"],
  ["NL", "EU", "netherlands", "the netherlands", "kingdom of the netherlands", "dutch", "holland", "amsterdam", "haarlem", "utrecht", "delft", "leiden", "dutch republic", "northern netherlands"],
  ["GB", "EU", "united kingdom", "great britain", "britain", "british", "england", "english", "scotland", "scottish", "wales", "welsh", "london", "staffordshire", "anglo-saxon"],
  ["IE", "EU", "ireland", "irish", "dublin"],
  ["DE", "EU", "germany", "german", "prussia", "prussian", "bavaria", "bavarian", "saxony", "saxon", "dresden", "munich", "berlin", "nuremberg", "cologne",
    "augsburg", "meissen", "holy roman empire", "rhineland", "franconia", "swabia", "swabian", "westphalia"],
  ["AT", "EU", "austria", "austrian", "vienna", "viennese", "austria hungary", "salzburg", "tyrol", "tyrolean"],
  ["CH", "EU", "switzerland", "swiss", "basel", "zurich", "geneva"],
  ["ES", "EU", "spain", "spanish", "madrid", "seville", "sevillian", "catalan", "catalonia", "barcelona", "toledo", "andalusia", "andalusian", "castile", "castilian", "valencia", "aragon"],
  ["PT", "EU", "portugal", "portuguese", "lisbon"],
  ["DK", "EU", "denmark", "danish", "copenhagen"],
  ["NO", "EU", "norway", "norwegian", "oslo"],
  ["SE", "EU", "sweden", "swedish", "stockholm"],
  ["FI", "EU", "finland", "finnish", "helsinki"],
  ["IS", "EU", "iceland", "icelandic"],
  ["PL", "EU", "poland", "polish", "krakow", "warsaw"],
  ["CZ", "EU", "czechoslovakia", "czech republic", "czechia", "czech", "bohemia", "bohemian", "prague", "moravia", "moravian"],
  ["SK", "EU", "slovakia", "slovak"],
  ["HU", "EU", "hungary", "hungarian", "budapest"],
  ["RO", "EU", "romania", "romanian"],
  ["BG", "EU", "bulgaria", "bulgarian"],
  ["RS", "EU", "serbia", "serbian"],
  ["HR", "EU", "croatia", "croatian", "dalmatia", "dalmatian"],
  ["SI", "EU", "slovenia", "slovenian"],
  ["RU", "EU", "dagestan", "russia", "russian", "russian empire", "soviet union", "ussr", "moscow", "st petersburg", "saint petersburg", "novgorod"],
  ["UA", "EU", "ukraine", "ukrainian", "kyiv", "kiev", "scythian"],
  ["BY", "EU", "belarus", "belarusian"],
  ["LT", "EU", "lithuania", "lithuanian"],
  ["LV", "EU", "latvia", "latvian"],
  ["EE", "EU", "estonia", "estonian"],
  ["GR", "EU", "greece", "greek", "ancient greece", "athens", "athenian", "attic", "attica", "corinth", "corinthian", "boeotia", "boeotian", "hellenistic", "cycladic",
    "minoan", "mycenaean", "crete", "cretan", "macedonian", "laconian", "euboean", "rhodes", "rhodian"],
  ["CY", "EU", "cyprus", "cypriot", "cypriote"],
  ["MT", "EU", "malta", "maltese"],
  ["TR", "AS", "turkey", "turkish", "ottoman", "ottoman empire", "istanbul", "constantinople", "byzantine", "byzantium", "anatolia", "anatolian", "iznik", "hittite", "phrygian", "lydian"],
  ["EG", "AF", "fayum", "egypt", "egyptian", "ancient egypt", "coptic", "thebes", "memphis", "alexandria", "fatimid", "mamluk"],
  ["IR", "AS", "parthian", "parthian empire", "iran", "iranian", "persia", "persian", "safavid", "qajar", "isfahan", "tabriz", "shiraz", "achaemenid", "sasanian", "sassanian", "timurid", "seljuk", "kashan"],
  ["IQ", "AS", "iraq", "iraqi", "mesopotamia", "mesopotamian", "assyria", "assyrian", "babylon", "babylonian", "sumer", "sumerian", "baghdad", "abbasid", "akkadian", "nimrud"],
  ["SY", "AS", "syria", "syrian", "damascus", "palmyra", "palmyrene"],
  ["LB", "AS", "lebanon", "lebanese", "phoenicia", "phoenician"],
  ["IL", "AS", "israel", "israeli"],
  ["JO", "AS", "jordan", "jordanian", "petra"],
  ["SA", "AS", "saudi arabia", "arabia", "arabian"],
  ["YE", "AS", "yemen", "yemeni", "south arabian"],
  ["AM", "AS", "armenia", "armenian"],
  ["GE", "AS", "georgia (country)", "georgian kingdom"],
  ["AZ", "AS", "azerbaijan", "azerbaijani"],
  ["UZ", "AS", "uzbekistan", "uzbek", "samarkand", "bukhara"],
  ["AF", "AS", "afghanistan", "afghan", "herat"],
  ["PK", "AS", "pakistan", "pakistani", "gandhara", "lahore", "sindh"],
  ["IN", "AS", "india", "indian", "mughal", "mughal india", "rajput", "rajasthan", "rajasthani", "deccan", "deccani", "bengal", "bengali", "pahari", "punjab", "punjabi",
    "kashmir", "kashmiri", "gujarat", "gujarati", "mysore", "tamil nadu", "chola", "kerala", "orissa", "odisha", "mewar", "bundi", "kota", "kangra", "basohli", "lucknow", "delhi", "agra", "hyderabad", "golconda", "bijapur"],
  ["NP", "AS", "nepal", "nepalese", "nepali", "kathmandu"],
  ["LK", "AS", "sri lanka", "sri lankan", "ceylon"],
  ["BD", "AS", "bangladesh"],
  ["CN", "AS", "china", "chinese", "ming", "ming dynasty", "qing", "qing dynasty", "tang", "tang dynasty", "song dynasty", "northern song", "southern song", "yuan dynasty",
    "han dynasty", "shang dynasty", "zhou dynasty", "jingdezhen", "beijing", "peking", "tibet", "tibetan", "canton", "guangzhou", "suzhou"],
  ["MN", "AS", "mongolia", "mongolian"],
  ["JP", "AS", "japan", "japanese", "edo", "edo period", "kyoto", "tokyo", "osaka", "meiji", "meiji period", "heian", "kamakura", "momoyama", "muromachi", "nara period", "arita", "kutani", "satsuma"],
  ["KR", "AS", "korea", "korean", "south korea", "joseon", "goryeo", "silla", "choson", "koryo"],
  ["VN", "AS", "vietnam", "vietnamese", "dong son"],
  ["TH", "AS", "thailand", "thai", "siam", "siamese", "ayutthaya", "sukhothai"],
  ["KH", "AS", "cambodia", "cambodian", "khmer", "angkor"],
  ["LA", "AS", "laos", "lao"],
  ["MM", "AS", "myanmar", "burma", "burmese"],
  ["ID", "AS", "indonesia", "indonesian", "java", "javanese", "bali", "balinese", "sumatra", "borneo"],
  ["PH", "AS", "philippines", "filipino", "philippine"],
  ["MY", "AS", "malaysia", "malay"],
  ["US", "NA", "african american", "america", "northwest coast", "tlingit", "haida", "makah", "anishinaabe", "ojibwe", "lakota", "navajo", "hopi", "pueblo", "aleut", "great lakes region", "united states", "united states of america", "usa", "u s", "american", "new york", "boston", "philadelphia", "new england", "california", "native american", "hawaii", "hawaiian", "chicago", "pennsylvania", "virginia"],
  ["CA", "NA", "canada", "canadian", "quebec", "inuit"],
  ["MX", "NA", "mexico", "mexican", "aztec", "maya", "mayan", "olmec", "west mexico", "teotihuacan", "zapotec", "mixtec", "veracruz", "colima", "jalisco", "nayarit", "new spain", "toltec", "huastec"],
  ["GT", "NA", "guatemala", "guatemalan"],
  ["HN", "NA", "honduras", "honduran"],
  ["CR", "NA", "costa rica", "costa rican"],
  ["PA", "NA", "panama", "panamanian", "cocle"],
  ["CU", "NA", "cuba", "cuban"],
  ["HT", "NA", "haiti", "haitian"],
  ["PE", "SA", "peru", "peruvian", "inca", "inka", "moche", "nazca", "nasca", "chimu", "wari", "huari", "paracas", "chancay", "chavin", "cusco", "cuzco", "lima"],
  ["CO", "SA", "colombia", "colombian", "tairona", "quimbaya", "muisca", "calima"],
  ["EC", "SA", "ecuador", "ecuadorian", "valdivia", "jama coaque", "quito"],
  ["BO", "SA", "bolivia", "bolivian", "tiwanaku", "potosi"],
  ["AR", "SA", "argentina", "argentine", "argentinian"],
  ["BR", "SA", "brazil", "brazilian"],
  ["CL", "SA", "chile", "chilean"],
  ["VE", "SA", "venezuela", "venezuelan"],
  ["AU", "OC", "australia", "australian", "aboriginal"],
  ["NZ", "OC", "new zealand", "maori"],
  ["PG", "OC", "papua new guinea", "new guinea", "sepik", "asmat"],
  ["FJ", "OC", "fiji", "fijian"],
  ["NG", "AF", "nigeria", "nigerian", "yoruba", "igbo", "benin kingdom", "kingdom of benin", "court of benin", "nok", "ife", "edo peoples"],
  ["CD", "AF", "democratic republic of the congo", "congo", "congolese", "kongo", "kuba", "luba", "songye", "pende", "yaka", "lega", "mangbetu"],
  ["CI", "AF", "cote d ivoire", "ivory coast", "ivorian", "baule", "senufo", "guro"],
  ["ML", "AF", "mali", "malian", "bamana", "dogon", "djenne"],
  ["BF", "AF", "burkina faso", "mossi", "bwa"],
  ["GH", "AF", "ghana", "ghanaian", "asante", "ashanti", "akan"],
  ["CM", "AF", "cameroon", "cameroonian", "bamileke", "bamum"],
  ["GA", "AF", "gabon", "gabonese", "fang", "punu", "kota peoples"],
  ["ET", "AF", "ethiopia", "ethiopian", "abyssinia", "abyssinian"],
  ["SD", "AF", "sudan", "sudanese", "nubia", "nubian", "kush", "kushite", "meroe", "meroitic"],
  ["MA", "AF", "morocco", "moroccan", "fez", "marrakesh"],
  ["DZ", "AF", "algeria", "algerian"],
  ["TN", "AF", "tunisia", "tunisian", "carthage", "carthaginian"],
  ["LY", "AF", "libya", "libyan"],
  ["ZA", "AF", "south africa", "south african", "zulu"],
  ["KE", "AF", "kenya", "kenyan"],
  ["TZ", "AF", "tanzania", "tanzanian", "makonde"],
  ["AO", "AF", "angola", "angolan", "chokwe"],
  ["SN", "AF", "senegal", "senegalese"],
  ["SL", "AF", "sierra leone", "mende"],
  ["LR", "AF", "liberia", "liberian"],
  ["MG", "AF", "madagascar", "malagasy"],
];
const CONTINENT_ONLY = { "africa": "AF", "west africa": "AF", "central africa": "AF", "sub saharan africa": "AF", "east africa": "AF", "southern africa": "AF",
  "asia": "AS", "east asia": "AS", "southeast asia": "AS", "south asia": "AS", "central asia": "AS", "middle east": "AS", "near east": "AS",
  "europe": "EU", "balkans": "EU", "arctic": "NA", "oceania": "OC", "polynesia": "OC", "polynesian": "OC", "melanesia": "OC", "melanesian": "OC", "micronesia": "OC",
  "south america": "SA", "south american": "SA", "latin america": "SA", "latin american": "SA", "african": "AF", "north american": "NA", "central america": "NA", "central american": "NA", "asian": "AS", "european": "EU", "andes": "SA", "andean": "SA", "mesoamerica": "NA", "mesoamerican": "NA", "north america": "NA", "caribbean": "NA" };

export const COUNTRY = {};   // iso -> { continent, name }
const LEX = new Map();       // phrase -> { iso, continent }
for (const [iso, cont, ...names] of TABLE) {
  COUNTRY[iso] = { continent: cont, name: names[0].replace(/\b\w/g, (c) => c.toUpperCase()) };
  for (const n of names) if (!LEX.has(n)) LEX.set(n, { iso, continent: cont });
}
for (const [n, c] of Object.entries(CONTINENT_ONLY)) if (!LEX.has(n)) LEX.set(n, { iso: null, continent: c });
export const CONTINENTS = { AF: "Africa", AS: "Asia", EU: "Europe", NA: "North America", SA: "South America", OC: "Oceania" };

const clean = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();

// First match, reading left to right, longest phrase first ("American, born England" is American).
export function placeOf(text) {
  const w = clean(text).split(" ").filter(Boolean);
  for (let i = 0; i < w.length; i++) {
    for (let n = Math.min(5, w.length - i); n >= 1; n--) {
      const hit = LEX.get(w.slice(i, i + n).join(" "));
      if (hit) return hit;
    }
  }
  return null;
}

// Best available place for a work: where it was made, then the maker's nationality, then the place token in its features.
export function geoOf(a, f) {
  const fromF = (f || []).find((t) => t.startsWith("place|"));
  return placeOf(a && a.place) || placeOf(a && a.artistBio) || (fromF ? placeOf(fromF.slice(6)) : null);
}
