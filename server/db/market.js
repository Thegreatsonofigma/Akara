const crypto = require("node:crypto");
const { supabaseRequest, filterValue } = require("../lib/supabase");
const { moneyNumber } = require("../lib/format");
const { canonicalize } = require("../lib/integrity-crypto");
const { recordIntegrityEvent } = require("./integrity");

const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const RATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function weightedMedian(samples) {
  if (!samples.length) return 0;
  const sorted = samples.slice().sort((a, b) => a.rate - b.rate);
  const totalWeight = sorted.reduce((sum, sample) => sum + sample.weight, 0);
  let seen = 0;
  for (const sample of sorted) {
    seen += sample.weight;
    if (seen >= totalWeight / 2) return sample.rate;
  }
  return sorted.at(-1).rate;
}

function normalizeRateSample(row, sendCurrency, receiveCurrency) {
  if (row.have_currency !== receiveCurrency || row.want_currency !== sendCurrency) return null;
  const sendAmount = moneyNumber(row.want_amount);
  const receiveAmount = moneyNumber(row.have_amount);
  if (!sendAmount || !receiveAmount) return null;
  return {
    rate: receiveAmount / sendAmount,
    weight: sendAmount,
    source: row.completed_at ? "completed_trade" : "active_listing",
  };
}

function summarizeRateSamples(samples) {
  if (!samples.length) return null;
  const rates = samples.map((sample) => sample.rate);
  const medianWeight = percentile(samples.map((sample) => sample.weight), 0.5);
  const weightCap = Math.max(1, medianWeight * 3);
  const guardedSamples = samples.map((sample) => ({
    ...sample,
    // One oversized listing must not be able to dictate the corridor rate.
    weight: Math.min(sample.weight, weightCap)
      * (sample.source === "completed_trade" ? 1.25 : 1),
  }));
  return {
    median_rate: percentile(rates, 0.5),
    weighted_rate: weightedMedian(guardedSamples),
    low_rate: percentile(rates, 0.25),
    high_rate: percentile(rates, 0.75),
    best_rate: Math.max(...rates),
    total_visible_liquidity: samples
      .filter((sample) => sample.source === "active_listing")
      .reduce((sum, sample) => sum + sample.weight, 0),
  };
}

function corridorKey(sendCurrency, receiveCurrency) {
  return `${sendCurrency}:${receiveCurrency}`;
}

async function recentRateSnapshot(sendCurrency, receiveCurrency) {
  const threshold = new Date(Date.now() - SNAPSHOT_TTL_MS).toISOString();
  const rows = await supabaseRequest(
    [
      "market_rate_snapshots?",
      `send_currency=eq.${filterValue(sendCurrency)}`,
      `&receive_currency=eq.${filterValue(receiveCurrency)}`,
      `&created_at=gte.${filterValue(threshold)}`,
      "&order=created_at.desc",
      "&limit=1",
    ].join("")
  );
  return rows[0] || null;
}

async function calculateMarketRate(sendCurrency, receiveCurrency) {
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const [listings, deals] = await Promise.all([
    supabaseRequest(
      [
        "listings?select=id,have_currency,want_currency,have_amount,want_amount,created_at",
        "status=eq.active",
        `have_currency=eq.${filterValue(receiveCurrency)}`,
        `want_currency=eq.${filterValue(sendCurrency)}`,
        "order=created_at.desc",
        "limit=200",
      ].join("&")
    ),
    supabaseRequest(
      [
        "deals?select=id,have_currency,want_currency,have_amount,want_amount,completed_at",
        `have_currency=eq.${filterValue(receiveCurrency)}`,
        `want_currency=eq.${filterValue(sendCurrency)}`,
        `completed_at=gte.${filterValue(windowStart)}`,
        "order=completed_at.desc",
        "limit=200",
      ].join("&")
    ),
  ]);

  const listingSamples = listings
    .map((row) => normalizeRateSample(row, sendCurrency, receiveCurrency))
    .filter(Boolean);
  const completedSamples = deals
    .map((row) => normalizeRateSample(row, sendCurrency, receiveCurrency))
    .filter(Boolean);
  const summary = summarizeRateSamples([...listingSamples, ...completedSamples]);
  if (!summary) return null;

  return {
    corridor_key: corridorKey(sendCurrency, receiveCurrency),
    send_currency: sendCurrency,
    receive_currency: receiveCurrency,
    ...summary,
    active_listing_count: listingSamples.length,
    completed_trade_count: completedSamples.length,
    source_window_start: windowStart,
    source_window_end: new Date().toISOString(),
    expires_at: new Date(Date.now() + SNAPSHOT_TTL_MS).toISOString(),
  };
}

async function createMarketRateSnapshot(rate) {
  const rows = await supabaseRequest("market_rate_snapshots", {
    method: "POST",
    body: JSON.stringify(rate),
  });
  const snapshot = rows[0] || null;
  if (!snapshot) return null;

  const payload = {
    schema: "akara.market-rate.v1",
    subject: crypto.createHash("sha256").update(snapshot.corridor_key).digest("hex"),
    corridor: snapshot.corridor_key,
    rates: {
      median: Number(snapshot.median_rate),
      weighted: Number(snapshot.weighted_rate),
      low: Number(snapshot.low_rate),
      high: Number(snapshot.high_rate),
      best: Number(snapshot.best_rate),
    },
    sample: {
      active_listings: snapshot.active_listing_count,
      completed_trades: snapshot.completed_trade_count,
      visible_liquidity: Number(snapshot.total_visible_liquidity),
    },
    source_window_start: snapshot.source_window_start,
    source_window_end: snapshot.source_window_end,
    expires_at: snapshot.expires_at,
  };
  const record = await recordIntegrityEvent({
    eventKey: `market:${snapshot.id}:v1`,
    recordType: "market_rate_snapshot",
    entityType: "market_rate",
    entityId: snapshot.id,
    payload,
  });
  if (record) {
    await supabaseRequest(`market_rate_snapshots?id=eq.${filterValue(snapshot.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        commitment_hash: record.commitment_hash,
        integrity_record_id: record.id,
      }),
    }).catch(() => {});
    return { ...snapshot, commitment_hash: record.commitment_hash, integrity_record_id: record.id };
  }
  return snapshot;
}

async function getMarketRate(sendCurrency, receiveCurrency, options = {}) {
  if (!options.refresh) {
    try {
      const cached = await recentRateSnapshot(sendCurrency, receiveCurrency);
      if (cached) return cached;
    } catch (_) {
      // Compatibility while migration 009 is being applied.
    }
  }

  const calculated = await calculateMarketRate(sendCurrency, receiveCurrency);
  if (!calculated) return null;
  try {
    return await createMarketRateSnapshot(calculated);
  } catch (error) {
    if (/(market_rate_snapshots|does not exist|relation|42P01)/i.test(error.message)) {
      return {
        ...calculated,
        id: null,
        commitment_hash: crypto.createHash("sha256").update(canonicalize(calculated)).digest("hex"),
      };
    }
    throw error;
  }
}

function classifyListingRate(listing, snapshot) {
  if (!snapshot) return "Market data building";
  const rate = moneyNumber(listing.have_amount) / moneyNumber(listing.want_amount);
  if (rate < Number(snapshot.low_rate)) return "Below current range";
  if (rate > Number(snapshot.high_rate)) return "Above current range";
  return "Within current range";
}

module.exports = {
  calculateMarketRate,
  getMarketRate,
  classifyListingRate,
  summarizeRateSamples,
};
