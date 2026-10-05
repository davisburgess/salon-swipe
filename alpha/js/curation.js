// The opening hang: one work from each of these traditions, interleaved so neighbours contrast
// (ancient next to modern, East next to West, paint next to clay). Order is intentional.
// `q` is the search term sent to each museum; `src` is the order of museums to try.
// `why` is a one-line wall text. Each line was checked against standard survey references;
// they state the textbook view, not contested scholarship.

export const OPENING = [
  { id: "impressionism", label: "Impressionism", years: "1860s–1880s", q: "Impressionism", src: ["aic", "met", "cma"],
    why: "Painting perception itself: light changing by the minute, set down in quick, visible strokes." },
  { id: "egypt", label: "Ancient Egypt", years: "c. 3000–30 BCE", q: "Egyptian", src: ["met", "cma", "aic"],
    why: "Much of it was made for eternity rather than for viewers, meant to be sealed in tombs." },
  { id: "ukiyo-e", label: "Ukiyo-e", years: "1600s–1800s", q: "Ukiyo-e", src: ["aic", "met", "cma"],
    why: "Cheap, popular woodblock prints of Edo Japan's 'floating world' that later reshaped European modern art." },
  { id: "baroque", label: "Baroque", years: "c. 1600–1750", q: "Baroque", src: ["aic", "met", "cma"],
    why: "Drama by lighting: hard contrasts of light and dark pull you into the moment of action." },
  { id: "african", label: "Art of Africa", years: "various", q: "African mask figure", src: ["met", "cma", "aic"],
    why: "Many masks and figures were made to be used in performance and ritual, not hung on a wall." },
  { id: "cubism", label: "Cubism", years: "1907–1920s", q: "Cubism", src: ["aic", "met", "cma"],
    why: "Several viewpoints at once, with objects broken into faceted planes." },
  { id: "renaissance", label: "Italian Renaissance", years: "c. 1400–1550", q: "Renaissance", src: ["aic", "met", "cma"],
    why: "Linear perspective turned the flat picture plane into a convincing window." },
  { id: "ming", label: "Ming dynasty China", years: "1368–1644", q: "Ming dynasty", src: ["met", "cma", "aic"],
    why: "Scholar-painters prized brushwork as a trace of the painter's character, not only a picture of something." },
  { id: "hudson", label: "Hudson River School", years: "1825–1870s", q: "Hudson River School", src: ["met", "aic", "cma"],
    why: "America's first homegrown landscape movement, painting wilderness as national identity." },
  { id: "greek", label: "Ancient Greece", years: "c. 800–31 BCE", q: "Greek vase", src: ["met", "cma", "aic"],
    why: "Some vase painters signed their work, among the earliest named artists in the Western tradition." },
  { id: "symbolism", label: "Symbolism", years: "1880s–1910", q: "Symbolism", src: ["aic", "met", "cma"],
    why: "Dreams, myths and moods in place of observed reality." },
  { id: "mughal", label: "Mughal painting", years: "1500s–1800s", q: "Mughal", src: ["met", "cma", "aic"],
    why: "Court painters blended Persian, Indian and European ideas into jewel-like miniatures." },
  { id: "rococo", label: "Rococo", years: "c. 1720–1770", q: "Rococo", src: ["aic", "met", "cma"],
    why: "Lighter, smaller and more playful: art for private salons rather than cathedrals." },
  { id: "expressionism", label: "Expressionism", years: "1905–1920s", q: "Expressionism", src: ["aic", "met", "cma"],
    why: "Distortion and harsh color used to show inner experience instead of outer appearance." },
  { id: "byzantine", label: "Byzantine", years: "330–1453", q: "Byzantine", src: ["met", "cma", "aic"],
    why: "Gold grounds stood for divine light, a space outside ordinary time." },
  { id: "realism", label: "Realism", years: "1840s–1880s", q: "Realism", src: ["aic", "met", "cma"],
    why: "Ordinary people painted at the scale once reserved for kings and saints." },
  { id: "pre-columbian", label: "Ancient Americas", years: "before 1500", q: "Pre-Columbian", src: ["cma", "met", "aic"],
    why: "Ceramics, gold and textiles from cultures that developed with no contact with Europe." },
  { id: "dutch", label: "Dutch Golden Age", years: "c. 1600–1680", q: "Dutch Golden Age", src: ["aic", "met", "cma"],
    why: "A merchant republic bought art for homes, so painters specialized: still lifes, interiors, seascapes." },
  { id: "art-nouveau", label: "Art Nouveau", years: "1890–1910", q: "Art Nouveau", src: ["aic", "cma", "met"],
    why: "Whiplash curves taken from plants, applied to everything from posters to furniture." },
  { id: "post-impressionism", label: "Post-Impressionism", years: "1886–1905", q: "Post-Impressionism", src: ["aic", "met", "cma"],
    why: "Impressionism's color kept, then pushed toward structure, symbol or raw feeling." },
  { id: "roman", label: "Ancient Rome", years: "c. 500 BCE–476 CE", q: "Roman marble", src: ["met", "cma", "aic"],
    why: "Romans copied Greek sculpture so well that many lost Greek originals survive only through them." },
  { id: "neoclassicism", label: "Neoclassicism", years: "c. 1760–1830", q: "Neoclassicism", src: ["aic", "met", "cma"],
    why: "A return to Greek and Roman order, often carrying a message about civic virtue." },
  { id: "islamic", label: "Art of the Islamic world", years: "600s onward", q: "Islamic calligraphy", src: ["met", "cma", "aic"],
    why: "In much religious art, calligraphy and geometric pattern carry the meaning that figures carry elsewhere." },
  { id: "fauvism", label: "Fauvism", years: "1905–1910", q: "Fauvism", src: ["aic", "met", "cma"],
    why: "Color freed from describing things; a critic called the painters 'wild beasts'." },
  { id: "gothic", label: "Gothic", years: "c. 1150–1450", q: "Gothic", src: ["met", "aic", "cma"],
    why: "Gilded panels and carvings made for altars and private devotion." },
  { id: "romanticism", label: "Romanticism", years: "c. 1790–1850", q: "Romanticism", src: ["aic", "met", "cma"],
    why: "Feeling over reason: storms, ruins and the sublime terror of nature." },
  { id: "japanese-screens", label: "Japanese screens", years: "1500s–1800s", q: "Japanese screen", src: ["met", "cma", "aic"],
    why: "Folding screens turned whole rooms into landscapes, often painted on gold leaf." },
  { id: "pointillism", label: "Pointillism", years: "1886–1900s", q: "Pointillism", src: ["aic", "met", "cma"],
    why: "Dots of unmixed color meant to blend in your eye instead of on the palette." },
  { id: "pre-raphaelite", label: "Pre-Raphaelites", years: "1848–1900", q: "Pre-Raphaelite", src: ["aic", "met", "cma"],
    why: "Young English painters who rejected the academy for sharp detail and bright color." },
  { id: "qing", label: "Qing dynasty China", years: "1644–1912", q: "Qing dynasty", src: ["met", "cma", "aic"],
    why: "Imperial workshops produced porcelain, silk and painting of startling technical control." },
  { id: "tonalism", label: "Tonalism", years: "1880–1915", q: "Tonalism", src: ["aic", "met", "cma"],
    why: "Soft, misty American landscapes in a narrow range of color, built for mood." },
  { id: "arts-crafts", label: "Arts and Crafts", years: "1860–1920", q: "Arts and Crafts", src: ["aic", "cma", "met"],
    why: "A protest against factory goods: handmade objects and honest materials." },
  { id: "northern-renaissance", label: "Northern Renaissance", years: "c. 1430–1580", q: "Netherlandish", src: ["met", "aic", "cma"],
    why: "Netherlandish painters pushed oil paint to render single hairs and tiny reflections." },
  { id: "precisionism", label: "Precisionism", years: "1915–1940", q: "Precisionism", src: ["aic", "met", "cma"],
    why: "Factories and bridges reduced to clean, sharp geometry." },
];

// Broad, quality-leaning search terms used when browsing outside the opening hang.
export const BROWSE_TERMS = [
  "portrait", "landscape", "still life", "flowers", "sea", "river", "mountains", "garden", "city", "night",
  "winter", "horse", "bird", "dance", "music", "interior", "mother and child", "self-portrait", "boats",
  "harvest", "storm", "moon", "tiger", "cat", "dog", "fruit", "woman", "saint", "battle", "festival",
];

// Tones offered for Curator's Notes. `voice` is the instruction sent to the writer.
export const TONES = {
  cheeky: { label: "Dry and cheeky", voice: "Dry, witty, gently teasing, like a curator friend who knows too much. Never mean. Short sentences." },
  docent: { label: "Museum docent", voice: "Warm, clear and informative, like a good gallery talk. No jargon without a quick gloss." },
  critic: { label: "Art-school critic", voice: "Direct, formal analysis: composition, color, facture. Precise vocabulary, no flattery." },
  friend: { label: "Enthusiastic friend", voice: "Upbeat and encouraging, like a friend who just discovered art too. Plain words." },
};

export const WHY_CHIPS = ["Color", "Light", "Subject", "Mood", "Technique", "Composition", "Story"];
