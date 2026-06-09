// Display-only shortening of a raw statement description down to the merchant
// name. The full original is always preserved (shown when a row is clicked).
//
// Examples:
//   "MR. BRO KOREAN BISTRO RICHMOND BC"            -> "MR. BRO"
//   "FOODY WORLD RICHMOND BC Retail and Grocery"   -> "FOODY WORLD"
//   "STARBUCKS #1234 SEATTLE WA"                   -> "STARBUCKS"
//
// This is heuristic — it strips payment-processor prefixes, trailing
// reference/store numbers, "<city> <region-code>" location tails, and cuts the
// name at the first generic business-type / cuisine / category word. The lists
// below are easy to extend if a merchant shortens wrong.

// Leading junk many processors prepend before the real name.
const PROCESSOR_PREFIX =
  /^(sq|tst|py|pp|pos|sp|paypal|visa|mastercard|amex|interac|purchase|payment|debit|web|recurring|pre-?auth|point of sale|retail purchase|dd \*|dd\*)\b[\s*:.-]*/i;

// Once we hit one of these we've passed the brand name into a descriptor.
const DESCRIPTOR_WORDS = new Set([
  // business types
  "RESTAURANT", "RESTAURANTS", "BISTRO", "CAFE", "COFFEE", "GRILL", "KITCHEN",
  "BAR", "PUB", "BAKERY", "DELI", "DINER", "EATERY", "STEAKHOUSE", "BUFFET",
  "SUSHI", "RAMEN", "NOODLE", "NOODLES", "PIZZA", "PIZZERIA", "BBQ", "HOTPOT",
  "TEAHOUSE", "DESSERT", "JUICE", "SMOOTHIE", "MARKET", "SUPERMARKET", "GROCERY",
  "GROCERIES", "FOODS", "FOOD", "RETAIL", "STORE", "MART", "PHARMACY", "LIQUOR",
  "CONVENIENCE", "BOUTIQUE", "SALON", "SPA", "GYM", "FITNESS", "CLINIC",
  "DENTAL", "AUTO", "STATION", "HARDWARE", "SUPPLY", "SUPPLIES", "WHOLESALE",
  // cuisines / adjectives commonly trailing a brand
  "KOREAN", "CHINESE", "JAPANESE", "THAI", "INDIAN", "MEXICAN", "ITALIAN",
  "VIETNAMESE", "GREEK", "FRENCH", "SPANISH", "ASIAN", "CANTONESE", "TAIWANESE",
  "MALAYSIAN", "FILIPINO", "MEDITERRANEAN",
  // connectors / qualifiers
  "AND", "THE",
]);

// 2-letter Canadian provinces + US states — detects a trailing "<city> <CODE>".
const REGIONS = new Set([
  "BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU",
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL",
  "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT",
  "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

export function shortenMerchant(raw, maxWords = 5) {
  if (!raw) return "";
  let s = String(raw).replace(/\s+/g, " ").trim();
  // Some statements glue the store number (and city) onto the name with no
  // space, e.g. "SUPERCENTER#3652RICHMOND". Split a "#" off the preceding
  // letter so the number/city can be stripped below.
  s = s.replace(/([A-Za-z])#/g, "$1 #");

  // Strip a leading processor prefix and any "*token" order/auth cruft
  // (e.g. "AMZN Mktp CA*BJ9PL8JX1" -> "AMZN Mktp CA").
  s = s.replace(PROCESSOR_PREFIX, "").trim();
  s = s.replace(/\*\S*/g, " ").replace(/\s+/g, " ").trim();
  // Drop everything from the first long digit run (store/ref #) onward.
  const numCut = s.replace(/\s+#?\d{3,}.*$/, "").trim();
  if (numCut) s = numCut;

  const words = s.split(" ").filter(Boolean);
  const kept = [];
  for (let i = 0; i < words.length; i++) {
    const bare = words[i].replace(/[^A-Za-z&]/g, "").toUpperCase();
    // Location boundary: a region code ends the name; drop the city word too.
    if (REGIONS.has(bare) && kept.length) {
      kept.pop();
      break;
    }
    // Descriptor/cuisine/category word ends the brand name.
    if (DESCRIPTOR_WORDS.has(bare) && kept.length) break;
    kept.push(words[i]);
    if (kept.length >= maxWords) break;
  }

  let name = (kept.length ? kept : words.slice(0, maxWords)).join(" ").trim();
  name = name.replace(/[\s,;:#*.-]+$/, "").trim(); // tidy trailing punctuation
  return name || s;
}
