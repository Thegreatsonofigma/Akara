const { config } = require("../config");

const BANK_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

let cachedBanks = null;
let cachedBanksAt = 0;

function isCoinProfileEnabled() {
  return Boolean(config.coinProfileApiUrl && config.coinProfileApiKey && config.coinProfileUsername);
}

async function coinProfileRequest(pathname, { method = "GET", body } = {}) {
  if (!isCoinProfileEnabled()) {
    throw new Error(
      "CoinProfile is not configured. Set COIN_PROFILE_API_URL, COIN_PROFILE_API_KEY and COIN_PROFILE_USERNAME in .env."
    );
  }

  const baseUrl = config.coinProfileApiUrl.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-api-user": config.coinProfileUsername,
      "x-api-key": config.coinProfileApiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok || parsed?.success === false) {
    const error = new Error(`CoinProfile ${response.status}: ${parsed?.message || text}`);
    error.statusCode = response.status;
    throw error;
  }

  return parsed;
}

// CoinProfile cannot pay out to these banks, so hide them from bank matching.
const UNSUPPORTED_BANKS = new Set(["Moniepoint Microfinance Bank", "Opay"]);

async function listNigerianBanks() {
  if (cachedBanks && Date.now() - cachedBanksAt < BANK_CACHE_TTL_MS) return cachedBanks;

  const body = await coinProfileRequest("/bank/supported?country=NG");
  const banks = (body?.data || [])
    .filter((bank) => bank?.Name && bank?.Code && !UNSUPPORTED_BANKS.has(bank.Name))
    .map((bank) => ({ name: bank.Name, code: bank.Code }));

  cachedBanks = banks;
  cachedBanksAt = Date.now();
  return cachedBanks;
}

// Common shorthand people type for Nigerian banks, expanded to text that
// appears in CoinProfile's official bank names.
const BANK_ALIASES = {
  gt: "guaranty trust",
  gtb: "guaranty trust",
  gtbank: "guaranty trust",
  gtco: "guaranty trust",
  uba: "united bank for africa",
  fcmb: "first city monument",
  firstbank: "first",
  stanbic: "stanbic ibtc",
  alat: "wema",
  opay: "paycom",
};

// Users know some CoinProfile entries by a different name — Opay is
// registered there as Paycom. Swap in the familiar name for everything the
// user sees; API calls keep using the entry's code.
const BANK_DISPLAY_NAMES = [{ match: "paycom", display: "Opay" }];

function presentBank(bank) {
  const normalized = normalizeBankText(bank.name);
  const known = BANK_DISPLAY_NAMES.find((entry) => normalized.includes(entry.match));
  return known ? { name: known.display, code: bank.code } : bank;
}

function normalizeBankText(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(bank|banks|plc|nigeria|nig|limited|ltd|of|the|microfinance|mfb)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Matches free-form text like "gtb" or "access" against the CoinProfile bank
// list. Returns exact matches first, otherwise partial matches sorted with
// the shortest (most canonical) names on top.
async function findNigerianBanks(input) {
  const raw = normalizeBankText(input);
  if (!raw) return [];
  const alias = BANK_ALIASES[raw.replace(/\s+/g, "")];
  const value = alias ? normalizeBankText(alias) : raw;

  const banks = await listNigerianBanks();
  const normalized = banks.map((bank) => ({ bank, name: normalizeBankText(bank.name) }));

  const exact = normalized.filter((entry) => entry.name === value);
  if (exact.length) return exact.map((entry) => presentBank(entry.bank));

  const partial = normalized.filter(
    (entry) => entry.name.includes(value) || value.includes(entry.name)
  );
  partial.sort((a, b) => a.name.length - b.name.length);
  return partial.map((entry) => presentBank(entry.bank));
}

// Takes an account number and bank code, returns the account holder's name
// straight from the bank. Normalized to { account_name } so callers don't
// depend on CoinProfile's response casing.
async function resolveBankAccount(accountNumber, bankCode) {
  const body = await coinProfileRequest("/bank/resolve", {
    method: "POST",
    body: {
      accountNumber: String(accountNumber),
      bankCode: String(bankCode),
    },
  });

  // CoinProfile nests the payload as data.data, but the holder's name is not
  // always in the nested object — data.data can be the BANK record, whose
  // `name` is the bank itself, while the holder arrives one level up. Read
  // explicit account-name fields from either level, and only trust a bare
  // `name` when it sits beside the account number, so a bank name can never
  // be mistaken for the account holder.

  const info = body?.data?.data || body?.data || null;
  if (!info) return null;

  const accountName = info.accountname || info.accountName || info.name || "";
  return {
    account_name: accountName,
    account_number: info.accountnumber || info.accountNumber || String(accountNumber),
  };
}

module.exports = {
  isCoinProfileEnabled,
  listNigerianBanks,
  findNigerianBanks,
  resolveBankAccount,
};
