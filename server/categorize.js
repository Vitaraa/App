// Transaction categorization.
//
// Two layers, checked in order:
//   1. Learned rules  — merchant tokens the user has corrected before
//      (passed in from the category_rules table). Highest priority.
//   2. Built-in rules — a keyword map covering common merchants/keywords.
//
// If nothing matches we return { category: "Uncategorized", confident: false }
// so the caller can flag the transaction for manual review.

// Built-in keyword -> category map. Keys are matched as substrings against the
// normalized (uppercased) description, so keep them uppercase and distinctive.
const KEYWORD_RULES = [
  // Groceries
  ["Groceries", ["WHOLEFDS", "WHOLE FOODS", "TRADER JOE", "SAFEWAY", "KROGER", "ALDI", "COSTCO", "WALMART", "WAL-MART", "PUBLIX", "WEGMANS", "SPROUTS", "H-E-B", "HEB ", "GROCERY", "SUPERMARKET", "FOOD LION", "GIANT"]],
  // Dining / coffee
  ["Dining", ["STARBUCKS", "MCDONALD", "CHIPOTLE", "DOORDASH", "UBER EATS", "UBEREATS", "GRUBHUB", "POSTMATES", "RESTAURANT", "PIZZA", "CHICK-FIL-A", "CHICKFILA", "TACO BELL", "BURGER KING", "WENDY", "DUNKIN", "PANERA", "CAFE", "COFFEE", "SUBWAY", "DOMINO", "KFC", "POPEYE", "SHAKE SHACK", "DENNY", "IHOP", "BAR & GRILL", "BISTRO", "DELI"]],
  // Transport / rideshare / fuel
  ["Transport", ["UBER", "LYFT", "SHELL", "CHEVRON", "EXXON", "MOBIL", "BP ", "TEXACO", "ARCO", "VALERO", "76 ", "CITGO", "GAS ", "FUEL", "PARKING", "TOLL", "MTA", "METRO", "TRANSIT", "BART", "AMTRAK", "DELTA AIR", "UNITED AIR", "AMERICAN AIR", "SOUTHWEST", "AIRLINE", "AIRLINES"]],
  // Subscriptions / streaming / software
  ["Subscriptions", ["NETFLIX", "SPOTIFY", "HULU", "DISNEY+", "DISNEYPLUS", "HBO", "MAX ", "YOUTUBE PREMIUM", "PRIME VIDEO", "APPLE.COM/BILL", "APPLE.COM", "GOOGLE *", "ADOBE", "MICROSOFT", "DROPBOX", "ICLOUD", "PATREON", "AUDIBLE", "PEACOCK", "PARAMOUNT+", "NYTIMES", "WSJ", "OPENAI", "CHATGPT", "NOTION", "GITHUB"]],
  // Shopping / retail
  ["Shopping", ["AMAZON", "AMZN", "TARGET", "BEST BUY", "BESTBUY", "EBAY", "ETSY", "IKEA", "HOME DEPOT", "LOWE'S", "LOWES", "MACY", "NORDSTROM", "NIKE", "ADIDAS", "GAP ", "OLD NAVY", "H&M", "ZARA", "SEPHORA", "ULTA", "WAYFAIR", "B_H", "NEWEGG"]],
  // Utilities / telecom / internet
  ["Utilities", ["COMCAST", "XFINITY", "VERIZON", "AT&T", "ATT ", "T-MOBILE", "TMOBILE", "SPECTRUM", "PG&E", "PGE ", "CON ED", "CONED", "DUKE ENERGY", "NATIONAL GRID", "WATER", "ELECTRIC", "UTILITY", "UTILITIES", "SEWER", "WASTE", "INTERNET", "BROADBAND"]],
  // Housing / rent / mortgage
  ["Housing", ["RENT", "MORTGAGE", "ZILLOW", "APARTMENT", "PROPERTY MGMT", "PROPERTY MANAGEMENT", "HOA ", "LEASING"]],
  // Health / pharmacy / fitness
  ["Health", ["CVS", "WALGREENS", "RITE AID", "PHARMACY", "DRUG", "DOCTOR", "DENTAL", "CLINIC", "HOSPITAL", "MEDICAL", "PLANET FITNESS", "LA FITNESS", "EQUINOX", "GYM", "FITNESS", "PELOTON", "OPTUM", "KAISER"]],
  // Insurance
  ["Insurance", ["GEICO", "STATE FARM", "STATEFARM", "PROGRESSIVE", "ALLSTATE", "USAA", "INSURANCE", "LIBERTY MUTUAL", "NATIONWIDE", "METLIFE", "AETNA", "CIGNA", "BLUE CROSS", "BLUECROSS"]],
  // Entertainment / leisure
  ["Entertainment", ["CINEMA", "AMC ", "REGAL", "MOVIE", "THEATER", "THEATRE", "STEAM GAMES", "PLAYSTATION", "XBOX", "NINTENDO", "TICKETMASTER", "STUBHUB", "FANDANGO", "CONCERT", "SPIRIT HALLOWEEN"]],
  // Income
  ["Income", ["PAYROLL", "DIRECT DEP", "DIRECTDEP", "DIR DEP", "DEPOSIT", "SALARY", "ACH CREDIT", "INTEREST PAID", "DIVIDEND", "REFUND", "VENMO CASHOUT", "ZELLE FROM", "IRS TREAS", "TAX REF"]],
  // Transfers / payments / cash
  ["Transfers", ["TRANSFER", "ZELLE", "VENMO", "PAYPAL", "CASH APP", "CASHAPP", "ATM", "WITHDRAWAL", "WIRE", "ACH DEBIT", "ONLINE PMT", "BILL PAY", "AUTOPAY", "CREDIT CARD PAYMENT", "CC PAYMENT", "PAYMENT THANK YOU", "ROBINHOOD", "COINBASE"]],
  // Fees
  ["Fees", ["OVERDRAFT", "SERVICE FEE", "SERVICE CHARGE", "ATM FEE", "FOREIGN TRANS", "LATE FEE", "MAINTENANCE FEE", "ANNUAL FEE", "FINANCE CHARGE", "NSF "]],
  // Education
  ["Education", ["TUITION", "UNIVERSITY", "COLLEGE", "BOOKSTORE", "COURSERA", "UDEMY", "STUDENT LOAN", "SALLIE MAE", "NELNET", "CHEGG", "SCHOOL"]],
];

// Normalize a raw statement description into a comparable, uppercase string,
// stripping store/transaction numbers and noisy punctuation.
export function normalizeDescription(desc) {
  return String(desc || "")
    .toUpperCase()
    .replace(/[#*]/g, " ")
    .replace(/\b\d{3,}\b/g, " ") // long digit runs (store #, ref #)
    .replace(/\s+/g, " ")
    .trim();
}

// Derive a short, stable "merchant token" used as the key for learned rules.
// e.g. "SQ *BLUE BOTTLE COFFEE 0123  SAN FRANCISCO CA" -> "BLUE BOTTLE COFFEE"
export function merchantToken(desc) {
  let s = normalizeDescription(desc)
    .replace(/^(SQ|TST|PY|PP|POS|PURCHASE|DEBIT|CARD|VISA|MASTERCARD|ACH|WEB|RECURRING)\b/g, " ")
    .replace(/\b(SAN FRANCISCO|NEW YORK|LOS ANGELES|US|USA|CA|NY|TX|FL|WA|IL)\b\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Keep the first ~4 meaningful words — enough to identify a merchant.
  const words = s.split(" ").filter(Boolean).slice(0, 4);
  return words.join(" ");
}

// Categorize one description.
//  - learnedRules: array of { pattern, category } (normalized patterns)
//  - fallbackType: 'income' | 'expense' — nudges the default for unmatched rows
// Returns { category, confident }.
export function categorize(description, learnedRules = [], fallbackType = "expense") {
  const norm = normalizeDescription(description);
  if (!norm) {
    return {
      category: fallbackType === "income" ? "Income" : "Uncategorized",
      confident: fallbackType === "income",
    };
  }

  // 1. Learned rules first (user corrections win).
  const token = merchantToken(description);
  for (const r of learnedRules) {
    if (!r.pattern) continue;
    if (token === r.pattern || norm.includes(r.pattern)) {
      return { category: r.category, confident: true };
    }
  }

  // 2. Built-in keyword rules.
  for (const [category, keywords] of KEYWORD_RULES) {
    for (const kw of keywords) {
      if (norm.includes(kw)) {
        // Income keywords should only apply to credits.
        if (category === "Income" && fallbackType === "expense") continue;
        return { category, confident: true };
      }
    }
  }

  // 3. No match -> needs review.
  return {
    category: fallbackType === "income" ? "Income" : "Uncategorized",
    confident: false,
  };
}

export const CATEGORIES = [
  "Groceries", "Dining", "Transport", "Subscriptions", "Shopping",
  "Utilities", "Housing", "Health", "Insurance", "Entertainment",
  "Education", "Income", "Transfers", "Fees", "Other", "Uncategorized",
];
