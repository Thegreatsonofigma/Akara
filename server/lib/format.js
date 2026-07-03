function formatMoney(amount, currency) {
  return `${Number(amount).toLocaleString()} ${currency}`;
}

function title(text) {
  return `*${text}*`;
}

function caption(text) {
  return `_${text}_`;
}

function action(text) {
  return `\`${text}\``;
}

function labeled(label, value) {
  return `*${label}:* ${value}`;
}

function normalizeShortText(input, maxLength = 80) {
  const value = String(input || "").trim().replace(/\s+/g, " ");
  if (!value) return null;
  return value.slice(0, maxLength);
}

function moneyNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function positiveMoney(value) {
  const number = Math.round(moneyNumber(value) * 100) / 100;
  return number > 0 ? number : 0;
}

function digitsOnly(input) {
  return String(input || "").replace(/\D/g, "");
}

function formatCooldown(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

const TITLE_LINE = /^\*[^*].*\*$/;
const CAPTION_LINE = /^_[^_].*_$/;

// Weaves the interpreter's written answer into a built reply so every message
// opens with the model's description of what the user asked for:
// - a reply whose header has a caption gets the answer as that caption;
// - a reply with a header title but no caption gets the answer as the title;
// - a plain single-line reply is replaced by the answer outright;
// - any other reply gets the answer prepended as its head title.
// Replies keep their own copy when the interpreter wrote no answer.
function applyInterpretedAnswer(reply, answer) {
  const note = String(answer || "").trim().replace(/\s*\n+\s*/g, " ");
  if (!note || typeof reply !== "string" || !reply.trim()) return reply;

  const lines = reply.split("\n");

  // Header caption: the first line after the leading title/blank block.
  // Captions further down are body notes and stay untouched.
  let index = 0;
  while (index < lines.length && (!lines[index].trim() || TITLE_LINE.test(lines[index].trim()))) index += 1;
  if (index < lines.length && CAPTION_LINE.test(lines[index].trim())) {
    lines[index] = caption(note);
    return lines.join("\n");
  }

  const headIndex = lines.findIndex((line) => line.trim());
  if (headIndex !== -1 && TITLE_LINE.test(lines[headIndex].trim())) {
    lines[headIndex] = title(note);
    return lines.join("\n");
  }

  if (lines.filter((line) => line.trim()).length === 1) return note;

  return [title(note), "", reply].join("\n");
}

module.exports = {
  formatMoney,
  title,
  caption,
  action,
  labeled,
  normalizeShortText,
  moneyNumber,
  positiveMoney,
  digitsOnly,
  formatCooldown,
  applyInterpretedAnswer,
};
