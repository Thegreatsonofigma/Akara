// Chat shorthand, pidgin, and common typos are expanded before any intent or
// amount parsing so the rest of the pipeline only deals with plain phrasing.
const SLANG_REPLACEMENTS = [
  // Chat shorthand
  [/\bpls\b|\bplz\b|\bplss\b/g, "please"],
  [/\bu\b/g, "you"],
  [/\bur\b/g, "your"],
  [/\bhw\b/g, "how"],
  [/\bwat\b|\bwot\b/g, "what"],
  [/\bwanna\b/g, "want to"],
  [/\bgimme\b/g, "give me"],
  [/\blemme\b/g, "let me"],
  [/\btnx\b|\bthx\b|\btanks\b|\btnks\b/g, "thanks"],
  [/\bdnt\b/g, "dont"],
  [/\bmk\b/g, "make"],

  // West/East African pidgin and slang
  [/\babeg\b|\bbiko\b/g, "please"],
  [/\bwetin\b/g, "what"],
  [/\bhowfa\b|\bhow fa\b/g, "how far"],
  [/\bwagwan\b/g, "how far"],
  [/\bkudi\b/g, "money"],

  // Frequent typos that block intent matching
  [/\bavai?la?i?ble\b|\bavaialble\b|\bavailble\b|\bavalable\b|\bavailabe\b|\baviable\b|\bavaliable\b/g, "available"],
  [/\brecieve\b|\brecive\b/g, "receive"],
  [/\brecieved\b|\brecived\b/g, "received"],
  [/\bexcahnge\b|\bexchnage\b/g, "exchange"],
  [/\btranfer\b|\btrasfer\b/g, "transfer"],
];

function expandSlang(text) {
  let value = String(text || "");
  for (const [pattern, replacement] of SLANG_REPLACEMENTS) {
    value = value.replace(pattern, replacement);
  }
  return value;
}

// Normalization used by intent regexes: slang expanded, punctuation collapsed.
function compactText(input) {
  return expandSlang(String(input || "").toLowerCase())
    .replace(/[,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Normalization used by amount/currency parsers. Commas are kept because they
// can be thousands separators ("2,000 naira"). Every parser works on this same
// string so match indexes stay aligned across parsers.
function normalizeExchangeText(input) {
  return expandSlang(String(input || "").toLowerCase())
    .replace(/[;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  expandSlang,
  compactText,
  normalizeExchangeText,
};
