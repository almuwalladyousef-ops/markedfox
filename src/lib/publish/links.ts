// Detects an external link in caption text.
//
// This exists for one reason: X bills $0.20 for a post containing a link and
// $0.015 for one without — 13x. Every plan sets x_links_allowed = false, and
// canUserDo refuses `publish_post` for X when `hasExternalLink` is true. This
// function is what computes that flag, on the server, so the guard is never a
// UI-only check (CLAUDE.md, locked decisions).
//
// It errs toward flagging. X auto-links anything that looks like a domain, not
// just strings with a scheme, and a false positive costs the user a rewrite
// while a false negative costs real money on every repeat. So besides
// `https://…` and `www.…` it also catches bare domains whose last label is a
// TLD X would recognise — but not "node.js", "e.g." or "v2.0.1", which X
// leaves as plain text.

// Every ISO 3166 ccTLD plus the generic TLDs that turn up in real captions.
// twitter-text's own list is the full IANA set; this is the subset worth the
// bytes. Missing one only means a rare domain slips through unflagged.
const TLDS = new Set([
  // ccTLDs
  "ac", "ad", "ae", "af", "ag", "ai", "al", "am", "ao", "aq", "ar", "as", "at",
  "au", "aw", "ax", "az", "ba", "bb", "bd", "be", "bf", "bg", "bh", "bi", "bj",
  "bm", "bn", "bo", "br", "bs", "bt", "bw", "by", "bz", "ca", "cc", "cd", "cf",
  "cg", "ch", "ci", "ck", "cl", "cm", "cn", "co", "cr", "cu", "cv", "cw", "cx",
  "cy", "cz", "de", "dj", "dk", "dm", "do", "dz", "ec", "ee", "eg", "er", "es",
  "et", "eu", "fi", "fj", "fk", "fm", "fo", "fr", "ga", "gd", "ge", "gf", "gg",
  "gh", "gi", "gl", "gm", "gn", "gp", "gq", "gr", "gs", "gt", "gu", "gw", "gy",
  "hk", "hm", "hn", "hr", "ht", "hu", "id", "ie", "il", "im", "in", "io", "iq",
  "ir", "is", "it", "je", "jm", "jo", "jp", "ke", "kg", "kh", "ki", "km", "kn",
  "kp", "kr", "kw", "ky", "kz", "la", "lb", "lc", "li", "lk", "lr", "ls", "lt",
  "lu", "lv", "ly", "ma", "mc", "md", "me", "mg", "mh", "mk", "ml", "mm", "mn",
  "mo", "mp", "mq", "mr", "ms", "mt", "mu", "mv", "mw", "mx", "my", "mz", "na",
  "nc", "ne", "nf", "ng", "ni", "nl", "no", "np", "nr", "nu", "nz", "om", "pa",
  "pe", "pf", "pg", "ph", "pk", "pl", "pm", "pn", "pr", "ps", "pt", "pw", "py",
  "qa", "re", "ro", "rs", "ru", "rw", "sa", "sb", "sc", "sd", "se", "sg", "sh",
  "si", "sk", "sl", "sm", "sn", "so", "sr", "ss", "st", "su", "sv", "sx", "sy",
  "sz", "tc", "td", "tf", "tg", "th", "tj", "tk", "tl", "tm", "tn", "to", "tr",
  "tt", "tv", "tw", "tz", "ua", "ug", "uk", "us", "uy", "uz", "va", "vc", "ve",
  "vg", "vi", "vn", "vu", "wf", "ws", "ye", "yt", "za", "zm", "zw",
  // generic
  "com", "net", "org", "info", "biz", "edu", "gov", "mil", "int", "app", "dev",
  "xyz", "site", "online", "store", "shop", "blog", "news", "live", "page",
  "link", "club", "studio", "space", "world", "today", "life", "media",
  "social", "video", "cloud", "digital", "network", "tech", "tools", "works",
  "run", "fyi", "one", "top", "vip", "pro", "name", "mobi", "email", "chat",
  "wiki", "guru", "ninja", "rocks", "cool", "fun", "games", "codes", "design",
  "art", "photo", "pics", "zone", "systems", "solutions", "agency", "company",
  "group", "team", "money", "cash", "finance", "market", "sale", "deals",
  "buy", "shopping", "fashion", "style", "beauty", "health", "care", "fitness",
  "yoga", "food", "cafe", "bar", "wine", "beer", "coffee", "kitchen",
  "recipes", "restaurant", "travel", "tours", "hotel", "land", "house",
  "homes", "estate", "rent", "supply", "energy", "eco", "farm", "garden",
  "pet", "dog", "school", "academy", "university", "college", "institute",
  "education", "training", "courses", "software", "computer", "hosting",
  "domains", "website", "web", "internet", "data", "ai", "bot", "apps",
  "mobile", "phone", "audio", "radio", "music", "band", "film", "movie",
  "show", "theater", "dance", "actor", "photography", "gallery", "book",
  "books", "author", "press", "publishing", "magazine", "report", "reviews",
  "guide", "tips", "help", "support", "faq", "forum", "community", "dating",
  "love", "wedding", "family", "baby", "kids", "toys", "party", "events",
  "tickets", "gift", "gifts", "cards", "photos", "pictures", "graphics", "ink",
  "tattoo", "hair", "salon", "spa", "makeup", "skin", "jewelry", "watch",
  "gold", "luxury", "lol", "wtf", "sucks", "fail", "win", "bid", "red", "blue",
  "black", "pink", "green", "click", "download", "stream", "tube", "porn",
  "sex", "xxx", "adult", "casino", "bet", "poker", "lotto", "game", "play",
  "how", "now", "ltd", "llc", "inc", "co", "capital", "ventures", "partners",
  "consulting", "management", "marketing", "promo", "brand", "expert",
  "coach", "ceo", "startup", "career", "jobs", "work", "legal", "law",
  "lawyer", "attorney", "accountant", "tax", "insurance", "bank", "loan",
  "credit", "trade", "exchange", "crypto", "nft", "coin", "wallet", "gg",
  "sh", "so", "is", "be", "at", "it", "to", "me", "ly", "cc", "fm", "am",
]);

// A scheme or www. prefix is a link no matter what follows.
const SCHEME_OR_WWW = /(?:^|[^A-Za-z0-9@.])(?:https?:\/\/|ftp:\/\/|www\.)[^\s]+/i;

// Bare domain: two or more dot-separated labels, last label 2–24 letters. The
// leading boundary excludes `@` (so @markedfox.official is a handle, and
// hi@example.com an email — X links neither), `.` and `-` (so it cannot start
// mid-token), and letters/digits. The trailing boundary allows any punctuation,
// including the full stop that ends "visit example.com."
const BARE_DOMAIN =
  /(?:^|[^A-Za-z0-9@.\-_])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,24}))(?=$|[^A-Za-z0-9\-_])/gi;

export function containsExternalLink(text: string): boolean {
  if (!text) return false;
  if (SCHEME_OR_WWW.test(text)) return true;

  BARE_DOMAIN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BARE_DOMAIN.exec(text)) !== null) {
    const tld = match[2].toLowerCase();
    if (TLDS.has(tld)) return true;
  }
  return false;
}
