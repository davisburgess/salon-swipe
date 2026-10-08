// Where a work is "from": the maker's nationality first, then the museum's place of origin. A depicted place never counts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { geoOf } from "../alpha/js/geo.js";
import { normalizeMet } from "../alpha/js/sources.js";
import { matches, newQuest } from "../alpha/js/quests.js";

const iso = (a) => geoOf(a)?.iso;

test("maker's nationality wins over where the work was made", () => {
  // Real Cleveland records: a European at the Qing court, and a Chinese photographer the museum lists as "England".
  assert.equal(iso({ artistBio: "Italian, 1688–1766", place: "China, Qing dynasty (1644–1911), Qianlong reign (1736–95)" }), "IT");
  assert.equal(iso({ artistBio: "Afong Studio) (Chinese, c. 1839–1890", place: "England, 19th century" }), "CN");
  assert.equal(iso({ artistBio: "British, active Ceylon, 1876–1895", place: "India, 19th century" }), "GB");
  // Anonymous works and sources without a nationality keep the museum's place.
  assert.equal(iso({ artistBio: null, place: "China, Ming dynasty (1368–1644)" }), "CN");
  assert.equal(iso({ artistBio: "active 1600s", place: "Chinese" }), "CN");
});

test("the Met's depicted places don't make a work from there", () => {
  const raw = { objectID: 1, isPublicDomain: true, primaryImageSmall: "x.jpg", title: "View of Canton", artistDisplayName: "", artistNationality: "",
    artistDisplayBio: "", culture: "", country: "China", region: "", geographyType: "Depicted", objectBeginDate: 1800 };
  assert.equal(normalizeMet(raw).place, null);
  assert.equal(normalizeMet({ ...raw, geographyType: "Made in" }).place, "China");
  assert.equal(normalizeMet({ ...raw, culture: "China" }).place, "China");
});

test("a China quest takes Chinese makers, not Europeans who painted China", () => {
  const q = newQuest({ swipes: [] }, { iso: "CN" }, 20);
  assert.ok(matches(q, { artistBio: null, place: "China, Qing dynasty (1644–1911)" }));
  assert.ok(!matches(q, { artistBio: "English, 1774–1852", place: "China" }));
});
