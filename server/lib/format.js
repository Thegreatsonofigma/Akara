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

function fieldBlock(label, value) {
  return `${caption(label)}\n${title(value)}`;
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

module.exports = {
  formatMoney,
  title,
  caption,
  action,
  labeled,
  fieldBlock,
  normalizeShortText,
  moneyNumber,
  positiveMoney,
  digitsOnly,
  formatCooldown,
};
