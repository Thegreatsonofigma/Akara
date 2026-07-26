const { moneyNumber, positiveMoney } = require("./format");

function sourceLimitRate(listing) {
  const haveAmount = moneyNumber(listing?.have_amount);
  const wantAmount = moneyNumber(listing?.want_amount);
  if (haveAmount <= 0 || wantAmount <= 0) return 0;
  return wantAmount / haveAmount;
}

function candidateLimitRate(candidate) {
  const haveAmount = moneyNumber(candidate?.have_amount);
  const wantAmount = moneyNumber(candidate?.want_amount);
  if (haveAmount <= 0 || wantAmount <= 0) return 0;
  return haveAmount / wantAmount;
}

function reciprocalPair(candidate, source) {
  return Boolean(
    candidate?.have_currency === source?.want_currency
    && candidate?.want_currency === source?.have_currency
  );
}

function crossedRates(candidate, source) {
  if (!reciprocalPair(candidate, source)) return false;
  const floorRate = sourceLimitRate(source);
  const ceilingRate = candidateLimitRate(candidate);
  return floorRate > 0 && ceilingRate > 0 && ceilingRate + Number.EPSILON >= floorRate;
}

function roundedWithin(value, minimum, maximum) {
  const rounded = positiveMoney(value);
  return positiveMoney(Math.max(minimum, Math.min(maximum, rounded)));
}

function fillAmounts(candidate, source, clearingRate) {
  const sourceAvailable = moneyNumber(source?.have_amount);
  const candidateDemand = moneyNumber(candidate?.want_amount);
  const candidateAvailable = moneyNumber(candidate?.have_amount);
  const candidateAffordableUnits = clearingRate > 0 ? candidateAvailable / clearingRate : 0;
  const sourceUnits = positiveMoney(
    Math.min(sourceAvailable, candidateDemand, candidateAffordableUnits)
  );
  if (!sourceUnits || clearingRate <= 0) return null;

  const sourceMinimum = sourceUnits * sourceLimitRate(source);
  const candidateMaximum = sourceUnits * candidateLimitRate(candidate);
  const reciprocalUnits = roundedWithin(
    sourceUnits * clearingRate,
    Math.min(sourceMinimum, candidateMaximum),
    Math.max(sourceMinimum, candidateMaximum)
  );
  if (!reciprocalUnits) return null;

  const sourceCoverage = sourceAvailable > 0 ? sourceUnits / sourceAvailable : 0;
  const candidateCoverage = candidateDemand > 0 ? sourceUnits / candidateDemand : 0;
  return {
    source_units: sourceUnits,
    reciprocal_units: reciprocalUnits,
    source_minimum: positiveMoney(sourceMinimum),
    candidate_maximum: positiveMoney(candidateMaximum),
    source_coverage: sourceCoverage,
    candidate_coverage: candidateCoverage,
    mutual_fill: Math.min(sourceCoverage, candidateCoverage),
    average_fill: (sourceCoverage + candidateCoverage) / 2,
  };
}

function buildClearingPlan(candidate, source) {
  if (!crossedRates(candidate, source)) return null;
  const floorRate = sourceLimitRate(source);
  const ceilingRate = candidateLimitRate(candidate);
  const clearingRate = Math.sqrt(floorRate * ceilingRate);
  const fill = fillAmounts(candidate, source, clearingRate);
  if (!fill) return null;

  return {
    kind: "clearing",
    candidate,
    source,
    source_limit_rate: floorRate,
    candidate_limit_rate: ceilingRate,
    clearing_rate: clearingRate,
    spread_ratio: ceilingRate / floorRate,
    source_improvement: positiveMoney(fill.reciprocal_units - fill.source_minimum),
    candidate_savings: positiveMoney(fill.candidate_maximum - fill.reciprocal_units),
    ...fill,
  };
}

function buildNegotiationPlan(candidate, source, maximumGapPercent = 20) {
  if (!reciprocalPair(candidate, source)) return null;
  if (candidate?.listing_type !== "negotiable" || source?.listing_type !== "negotiable") return null;

  const floorRate = sourceLimitRate(source);
  const ceilingRate = candidateLimitRate(candidate);
  if (floorRate <= 0 || ceilingRate <= 0 || ceilingRate >= floorRate) return null;

  const gapPercent = ((floorRate - ceilingRate) / floorRate) * 100;
  if (gapPercent > maximumGapPercent) return null;

  const suggestedRate = Math.sqrt(floorRate * ceilingRate);
  const fill = fillAmounts(candidate, source, suggestedRate);
  if (!fill) return null;

  return {
    kind: "negotiation",
    candidate,
    source,
    source_limit_rate: floorRate,
    candidate_limit_rate: ceilingRate,
    suggested_rate: suggestedRate,
    gap_percent: gapPercent,
    ...fill,
  };
}

function trustScore(user = {}) {
  const completed = Math.max(0, moneyNumber(user.completed_deals_count));
  const cancelled = Math.max(0, moneyNumber(user.total_cancelled_deals));
  const disputes = Math.max(0, moneyNumber(user.dispute_count));
  const riskPenalty = {
    normal: 0,
    watch: 20,
    limited: 100,
    suspended: 100,
  }[user.risk_status] ?? 10;
  return Math.max(0, Math.min(100, 50 + Math.min(35, completed * 3) - cancelled * 2 - disputes * 8 - riskPenalty));
}

function planRank(plan, owner = {}) {
  const createdAt = new Date(plan.candidate?.created_at || 0).getTime() || 0;
  const mutualBenefit = plan.kind === "clearing"
    ? Math.max(0, Math.log(Math.max(1, plan.spread_ratio)))
    : 0;
  return {
    mutual_fill: plan.mutual_fill,
    average_fill: plan.average_fill,
    trust: trustScore(owner),
    mutual_benefit: mutualBenefit,
    gap: plan.kind === "negotiation" ? plan.gap_percent : 0,
    created_at: createdAt,
  };
}

function compareClearingPlans(left, right, usersById = {}) {
  const a = planRank(left, usersById[left.candidate.owner_user_id]);
  const b = planRank(right, usersById[right.candidate.owner_user_id]);
  return (
    b.mutual_fill - a.mutual_fill
    || b.average_fill - a.average_fill
    || b.trust - a.trust
    || b.mutual_benefit - a.mutual_benefit
    || a.created_at - b.created_at
  );
}

function compareNegotiationPlans(left, right, usersById = {}) {
  const a = planRank(left, usersById[left.candidate.owner_user_id]);
  const b = planRank(right, usersById[right.candidate.owner_user_id]);
  return (
    a.gap - b.gap
    || b.mutual_fill - a.mutual_fill
    || b.average_fill - a.average_fill
    || b.trust - a.trust
    || a.created_at - b.created_at
  );
}

module.exports = {
  sourceLimitRate,
  candidateLimitRate,
  reciprocalPair,
  crossedRates,
  buildClearingPlan,
  buildNegotiationPlan,
  trustScore,
  compareClearingPlans,
  compareNegotiationPlans,
};
