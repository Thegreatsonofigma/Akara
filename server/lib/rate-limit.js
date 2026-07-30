const buckets = new Map();
let operations = 0;

function clientIp(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

function pruneExpired(now) {
  operations += 1;
  if (operations % 250 !== 0) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function consumeRateLimit(scope, subject, limit, windowMs) {
  const now = Date.now();
  pruneExpired(now);
  const key = `${scope}:${subject || "unknown"}`;
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

function rateLimitResponse(res, result) {
  res.setHeader("retry-after", String(result.retryAfterSeconds));
  res.setHeader("cache-control", "no-store");
  res.writeHead(429, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({
    ok: false,
    code: "RATE_LIMITED",
    error: "Too many requests. Please wait and try again.",
  }));
}

module.exports = {
  clientIp,
  consumeRateLimit,
  rateLimitResponse,
};
