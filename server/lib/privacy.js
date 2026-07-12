function last(value = "", visible = 4) {
  const text = String(value || "").replace(/\s+/g, "");
  if (!text) return "";
  if (text.length <= visible) return "*".repeat(text.length);
  return `${"*".repeat(Math.max(0, text.length - visible))}${text.slice(-visible)}`;
}

function redactPhone(value) {
  const text = String(value || "");
  if (!text) return "";
  const compact = text.replace(/\D/g, "");
  return compact ? `+${last(compact, 4)}` : "";
}

function redactAccountNumber(value) {
  return last(value, 4);
}

function redactMomoNumber(value) {
  return redactPhone(value);
}

function redactEmail(value) {
  const text = String(value || "");
  const [name, domain] = text.split("@");
  if (!name || !domain) return "";
  return `${name.slice(0, 2)}***@${domain}`;
}

function redactSensitiveText(value) {
  return String(value || "")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (match) => redactPhone(match))
    .replace(/\b\d{8,14}\b/g, (match) => redactAccountNumber(match))
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (match) => redactEmail(match));
}

function privacySafeUser(user = {}) {
  return {
    id: user.id,
    display_name: user.display_name,
    legal_name: user.legal_name,
    whatsapp_phone: redactPhone(user.whatsapp_phone),
    nationality: user.nationality,
    residence_country: user.residence_country,
    city: user.city,
    verification_status: user.verification_status,
    risk_status: user.risk_status,
    completed_deals_count: user.completed_deals_count,
    created_at: user.created_at,
  };
}

module.exports = {
  redactPhone,
  redactAccountNumber,
  redactMomoNumber,
  redactEmail,
  redactSensitiveText,
  privacySafeUser,
};
