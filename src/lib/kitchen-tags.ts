/**
 * Lightweight allergen / dietary detection for kitchen tickets.
 * Menu items have no structured allergen column yet, so tags are derived from
 * item names, descriptions and selected modifier text (Arabic + English).
 */
export type DietTag =
  | "nuts"
  | "dairy"
  | "gluten"
  | "spicy"
  | "seafood"
  | "egg"
  | "vegan"
  | "vegetarian"
  | "halalOnly";

export const TAG_META: Record<DietTag, { icon: string; en: string; ar: string; tone: string }> = {
  nuts: { icon: "🥜", en: "Nuts", ar: "مكسرات", tone: "bg-destructive/15 text-destructive" },
  dairy: { icon: "🥛", en: "Dairy", ar: "حليب", tone: "bg-primary/10 text-foreground" },
  gluten: { icon: "🌾", en: "Gluten", ar: "جلوتين", tone: "bg-warning/25 text-foreground" },
  spicy: { icon: "🌶️", en: "Spicy", ar: "حار", tone: "bg-destructive/15 text-destructive" },
  seafood: { icon: "🦐", en: "Seafood", ar: "بحري", tone: "bg-primary/10 text-foreground" },
  egg: { icon: "🥚", en: "Egg", ar: "بيض", tone: "bg-warning/20 text-foreground" },
  vegan: { icon: "🌱", en: "Vegan", ar: "نباتي صرف", tone: "bg-accent/15 text-accent-foreground" },
  vegetarian: {
    icon: "🥗",
    en: "Vegetarian",
    ar: "نباتي",
    tone: "bg-accent/15 text-accent-foreground",
  },
  halalOnly: { icon: "🚫", en: "No pork", ar: "بدون خنزير", tone: "bg-muted text-foreground" },
};

const KEYWORDS: Record<DietTag, string[]> = {
  nuts: ["nut", "peanut", "almond", "cashew", "pistachio", "walnut", "tahini", "مكسرات", "فستق", "لوز", "طحينة", "كاجو", "جوز"],
  dairy: ["cheese", "milk", "cream", "butter", "yogurt", "labneh", "جبن", "حليب", "كريمة", "زبدة", "لبن", "لبنة"],
  gluten: ["bread", "bun", "wrap", "pasta", "dough", "flour", "khubz", "خبز", "معجنات", "عجين", "طحين", "مكرونة"],
  spicy: ["spicy", "hot sauce", "chili", "chilli", "jalapeno", "harissa", "حار", "شطة", "فلفل حار", "هريسة"],
  seafood: ["fish", "shrimp", "prawn", "crab", "calamari", "tuna", "salmon", "سمك", "روبيان", "جمبري", "سلطعون", "تونا", "سلمون"],
  egg: ["egg", "mayo", "mayonnaise", "aioli", "بيض", "مايونيز"],
  vegan: ["vegan", "نباتي صرف", "فيجن"],
  vegetarian: ["veggie", "vegetarian", "falafel", "hummus", "salad", "نباتي", "فلافل", "حمص", "سلطة"],
  halalOnly: ["no pork", "bacon", "pork", "خنزير", "بيكون"],
};

export function detectTags(...parts: (string | null | undefined)[]): DietTag[] {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  if (!text.trim()) return [];
  const tags: DietTag[] = [];
  for (const key of Object.keys(KEYWORDS) as DietTag[]) {
    if (KEYWORDS[key].some((word) => text.includes(word.toLowerCase()))) tags.push(key);
  }
  // Vegan implies vegetarian; keep the stronger tag only.
  return tags.includes("vegan") ? tags.filter((t) => t !== "vegetarian") : tags;
}
