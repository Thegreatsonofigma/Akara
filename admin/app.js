const state = {
  view: "overview",
  token: localStorage.getItem("akaraAdminToken") || "local-admin",
  data: {},
};

const titles = {
  overview: ["Overview", ""],
  users: ["Users", ""],
  verifications: ["Verifications", ""],
  listings: ["Offers", ""],
  deals: ["Deals", ""],
  disputes: ["Reports", ""],
  support: ["Support", ""],
  integrity: ["Integrity", ""],
};

const statusTone = {
  active: "good",
  verified_auto: "good",
  verified_manual: "good",
  closed: "good",
  resolved: "good",
  completed_pending_fee: "good",
  pending_review: "warn",
  pending_input: "warn",
  reserved: "warn",
  under_review: "warn",
  waiting_for_user: "warn",
  disputed: "bad",
  rejected: "bad",
  suspended: "bad",
  cancelled: "bad",
  flagged: "bad",
  overdue: "bad",
};

const statusLabels = {
  active: "Live",
  paused: "Paused",
  flagged: "Flagged",
  cancelled: "Cancelled",
  expired: "Expired",
  reserved: "Reserved",
  maker_sent: "Maker payment sent",
  taker_sent: "Taker payment sent",
  partially_confirmed: "Partially confirmed",
  completed_pending_fee: "Completed, fee pending",
  closed: "Completed",
  disputed: "Disputed",
  pending_input: "Needs user input",
  pending_review: "In review",
  verified_auto: "Verified",
  verified_manual: "Verified",
  rejected: "Rejected",
  suspended: "Suspended",
  under_review: "Under review",
  waiting_for_user: "Waiting for user",
  resolved: "Resolved",
  normal: "Normal",
  watch: "Watch",
  limited: "Limited",
  open: "Open",
  in_review: "In review",
  flagged_user: "Flagged user",
  verification: "Verification",
  dispute: "Dispute",
  anchored: "Anchored",
  batched: "Batched",
  pending: "Pending",
  failed: "Failed",
  confirmed: "Confirmed",
};

const disputeOutcomes = {
  none: "No trade change",
  keep_reviewing: "Keep paused",
  resume_trade: "Resume trade",
  close_refunded: "Close as refunded",
  close_completed: "Close as completed",
};

function $(selector) {
  return document.querySelector(selector);
}

function showNotice(message, isError = false) {
  const notice = $("#notice");
  notice.textContent = message;
  notice.hidden = false;
  notice.classList.toggle("is-error", isError);
}

function hideNotice() {
  $("#notice").hidden = true;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-akara-admin-token": state.token,
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(body.error || "Request failed");
  }
  return body.data;
}

function money(amount, currency) {
  return `${Number(amount || 0).toLocaleString()} ${currency || ""}`.trim();
}

function date(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function chip(value) {
  const text = value || "-";
  const tone = statusTone[text] || "";
  const label = statusLabels[text] || text.replaceAll("_", " ");
  return `<span class="chip ${tone}">${escapeHtml(label)}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function rowText(row) {
  return Object.values(row).join(" ").toLowerCase();
}

function renderTable(targetId, columns, rows) {
  const table = document.getElementById(targetId);
  table.dataset.rows = JSON.stringify(rows);
  table.dataset.columns = JSON.stringify(columns);

  const head = `<thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead>`;
  const body = rows.length
    ? rows.map((row) => `<tr>${columns.map((column) => `<td>${column.render(row)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${columns.length}">No records yet.</td></tr>`;

  table.innerHTML = head + `<tbody>${body}</tbody>`;
}

function applyFilter(input) {
  const table = document.getElementById(input.dataset.filter);
  const rows = JSON.parse(table.dataset.rows || "[]");
  const columns = JSON.parse(table.dataset.columns || "[]");
  const query = input.value.trim().toLowerCase();
  const filtered = query ? rows.filter((row) => rowText(row).includes(query)) : rows;
  const originalColumns = table._columns;
  renderTable(input.dataset.filter, originalColumns, filtered);
}

function attachTable(targetId, columns, rows) {
  const table = document.getElementById(targetId);
  table._columns = columns;
  renderTable(targetId, columns, rows);
}

function renderOverview(data) {
  $("#metric-users").textContent = data.totals.users;
  $("#metric-listings").textContent = data.totals.activeListings;
  $("#metric-deals").textContent = data.totals.deals;
  $("#metric-completed").textContent = data.totals.completedDeals;
  $("#metric-verifications").textContent = data.totals.pendingVerifications;
  renderNavBadge("#nav-verifications-badge", data.totals.pendingVerifications);
  renderNavBadge("#nav-users-badge", data.totals.flaggedUsers);
  $("#metric-disputes").textContent = data.totals.openDisputes;
  renderNavBadge("#nav-disputes-badge", data.totals.openDisputes);
  renderNavBadge("#nav-support-badge", data.totals.openSupportRequests);
  renderLineChart("#activity-chart", data.charts?.activity || [], "deals");
  renderDonutChart("#offer-status-chart", data.charts?.offerStatus || {});
  renderVerticalBarChart("#deal-status-chart", data.charts?.dealStatus || {});
  renderVerticalBarChart("#corridor-chart", data.charts?.corridors || {});
  renderHorizontalBarChart("#verification-chart", data.charts?.verificationStatus || {});
  renderHorizontalBarChart("#report-chart", {
    open: data.totals.openDisputes || 0,
    clear: Math.max(0, (data.totals.deals || 0) - (data.totals.openDisputes || 0)),
  });

  $("#recent-deals").innerHTML = listRows(data.recent.deals, (deal) => ({
    title: deal.status,
    meta: `${money(deal.have_amount, deal.have_currency)} -> ${money(deal.want_amount, deal.want_currency)} · ${date(deal.created_at)}`,
  }));

  $("#review-queue").innerHTML = listRows(data.recent.reviewQueue || [], (item) => {
    if (item.queue_type === "verification") {
      return {
        title: "Verification review",
        meta: `${statusLabels[item.status] || item.status} · ${date(item.created_at)}`,
      };
    }
    if (item.queue_type === "dispute") {
      return {
        title: "Open dispute",
        meta: `${statusLabels[item.status] || item.status} · ${date(item.created_at)}`,
      };
    }
    if (item.queue_type === "support") {
      return {
        title: item.reference || "Support request",
        meta: `${statusLabels[item.status] || item.status} · ${date(item.created_at)}`,
      };
    }
    return {
      title: "Flagged user",
      meta: `${statusLabels[item.risk_status] || item.risk_status} · ${date(item.created_at)}`,
    };
  });

  $("#recent-listings").innerHTML = listRows(data.recent.listings, (listing) => ({
    title: listing.status,
    meta: `${money(listing.have_amount, listing.have_currency)} -> ${money(listing.want_amount, listing.want_currency)} · ${date(listing.created_at)}`,
  }));
}

function renderNavBadge(selector, count) {
  const badge = $(selector);
  if (!badge) return;
  const value = Number(count || 0);
  badge.textContent = value > 99 ? "99+" : String(value);
  badge.hidden = value <= 0;
}

function renderLineChart(selector, rows, key) {
  const container = $(selector);
  if (!rows.length) {
    container.innerHTML = emptyChart();
    return;
  }

  const width = 280;
  const height = 112;
  const padding = { top: 12, right: 10, bottom: 24, left: 26 };
  const values = rows.map((row) => Number(row[key] || 0));
  const max = Math.max(1, ...values);
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const points = values.map((value, index) => {
    const x = padding.left + (rows.length === 1 ? 0 : (index / (rows.length - 1)) * innerWidth);
    const y = padding.top + innerHeight - (value / max) * innerHeight;
    return { x, y, value, label: rows[index].label };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padding.left},${padding.top + innerHeight} ${line} ${padding.left + innerWidth},${padding.top + innerHeight}`;

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Seven day ${key} trend">
      <line class="chart-grid" x1="${padding.left}" y1="${padding.top}" x2="${padding.left + innerWidth}" y2="${padding.top}" />
      <line class="chart-grid" x1="${padding.left}" y1="${padding.top + innerHeight / 2}" x2="${padding.left + innerWidth}" y2="${padding.top + innerHeight / 2}" />
      <line class="chart-axis" x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${padding.left + innerWidth}" y2="${padding.top + innerHeight}" />
      <polygon class="chart-area" points="${area}" />
      <polyline class="chart-line" points="${line}" />
      ${points.map((point) => `<circle class="chart-dot" cx="${point.x}" cy="${point.y}" r="3"><title>${escapeHtml(point.label)}: ${point.value}</title></circle>`).join("")}
      ${points.map((point, index) => index % 2 === 0 ? `<text class="chart-label" x="${point.x}" y="${height - 6}" text-anchor="middle">${escapeHtml(point.label)}</text>` : "").join("")}
      <text class="chart-label" x="4" y="${padding.top + 3}">${max}</text>
      <text class="chart-label" x="4" y="${padding.top + innerHeight + 3}">0</text>
    </svg>
  `;
}

function renderDonutChart(selector, counts) {
  const container = $(selector);
  const entries = sortedEntries(counts).slice(0, 4);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (!total) {
    container.innerHTML = emptyChart();
    return;
  }

  const circumference = 2 * Math.PI * 34;
  let offset = 0;
  const colors = ["#2563eb", "#0f9f6e", "#0891b2", "#dc3f5f"];
  const segments = entries.map(([label, value], index) => {
    const dash = (value / total) * circumference;
    const segment = `<circle class="donut-segment" cx="48" cy="48" r="34" stroke="${colors[index]}" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}"><title>${escapeHtml(label)}: ${value}</title></circle>`;
    offset += dash;
    return segment;
  }).join("");

  container.innerHTML = `
    <svg viewBox="0 0 96 96" role="img" aria-label="Offer status donut chart">
      <circle class="donut-bg" cx="48" cy="48" r="34"></circle>
      ${segments}
      <text x="48" y="45" text-anchor="middle" font-size="18" font-weight="800" fill="#171717">${total}</text>
      <text x="48" y="60" text-anchor="middle" font-size="10" fill="#777777">offers</text>
    </svg>
    <div class="chart-legend">
      ${entries.map(([label, value], index) => legendRow(label, value, colors[index])).join("")}
    </div>
  `;
}

function renderVerticalBarChart(selector, counts) {
  const container = $(selector);
  const entries = sortedEntries(counts).slice(0, 6);
  if (!entries.length) {
    container.innerHTML = emptyChart();
    return;
  }

  const width = 280;
  const height = 112;
  const padding = { top: 12, right: 8, bottom: 28, left: 26 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const max = Math.max(1, ...entries.map(([, value]) => value));
  const gap = 8;
  const barWidth = (innerWidth - gap * (entries.length - 1)) / entries.length;

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Status bar chart">
      <line class="chart-grid" x1="${padding.left}" y1="${padding.top}" x2="${padding.left + innerWidth}" y2="${padding.top}" />
      <line class="chart-grid" x1="${padding.left}" y1="${padding.top + innerHeight / 2}" x2="${padding.left + innerWidth}" y2="${padding.top + innerHeight / 2}" />
      <line class="chart-axis" x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${padding.left + innerWidth}" y2="${padding.top + innerHeight}" />
      ${entries.map(([label, value], index) => {
        const barHeight = (value / max) * innerHeight;
        const x = padding.left + index * (barWidth + gap);
        const y = padding.top + innerHeight - barHeight;
        return `
          <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="${index === 0 ? "#2563eb" : "#bfdbfe"}">
            <title>${escapeHtml(label)}: ${value}</title>
          </rect>
          <text class="chart-label" x="${x + barWidth / 2}" y="${height - 8}" text-anchor="middle">${escapeHtml(shortLabel(label))}</text>
        `;
      }).join("")}
      <text class="chart-label" x="4" y="${padding.top + 3}">${max}</text>
      <text class="chart-label" x="4" y="${padding.top + innerHeight + 3}">0</text>
    </svg>
  `;
}

function renderHorizontalBarChart(selector, counts) {
  const container = $(selector);
  const entries = sortedEntries(counts).slice(0, 5);
  const max = Math.max(1, ...entries.map(([, value]) => value));
  if (!entries.length) {
    container.innerHTML = emptyChart();
    return;
  }

  container.innerHTML = entries.map(([label, value], index) => {
    const color = index === 0 ? "#2563eb" : index === 1 ? "#0f9f6e" : "#0891b2";
    const width = Math.max(4, Math.round((value / max) * 100));
    return `
      <div class="hbar-row">
        <span class="legend-label">${escapeHtml(label.replaceAll("_", " "))}</span>
        <span class="hbar-track"><span class="hbar-fill" style="--w: ${width}%; --c: ${color}"></span></span>
        <strong>${value}</strong>
      </div>
    `;
  }).join("");
}

function sortedEntries(counts) {
  return Object.entries(counts || {})
    .map(([label, value]) => [label, Number(value || 0)])
    .filter(([, value]) => value >= 0)
    .sort((a, b) => b[1] - a[1]);
}

function legendRow(label, value, color) {
  return `
    <div class="legend-row">
      <span class="legend-dot" style="--dot: ${color}"></span>
      <span class="legend-label">${escapeHtml(label.replaceAll("_", " "))}</span>
      <span class="legend-value">${value}</span>
    </div>
  `;
}

function shortLabel(label) {
  const clean = String(label).replaceAll("_", " ");
  if (clean.includes("-")) return clean;
  return clean.split(" ").map((part) => part[0]).join("").slice(0, 4).toUpperCase();
}

function emptyChart() {
  return `<div class="chart-empty">No data yet</div>`;
}

function listRows(rows, mapRow) {
  if (!rows.length) return `<div class="list-row"><span class="row-meta">No recent activity.</span></div>`;
  return rows.map((row) => {
    const mapped = mapRow(row);
    return `
      <div class="list-row">
        <div class="row-title">${escapeHtml(mapped.title)}</div>
        <div class="row-meta">${escapeHtml(mapped.meta)}</div>
      </div>
    `;
  }).join("");
}

function renderUsers(rows) {
  attachTable("users-table", [
    { label: "Name", render: (row) => escapeHtml(row.legal_name || row.display_name || "-") },
    { label: "Phone", render: (row) => escapeHtml(row.whatsapp_phone) },
    { label: "Verification", render: (row) => chip(row.verification_status) },
    { label: "Risk", render: (row) => chip(row.risk_status) },
    { label: "Completed", render: (row) => escapeHtml(row.completed_deals_count) },
    { label: "Cancels", render: (row) => escapeHtml(row.total_cancelled_deals) },
    { label: "Disputes", render: (row) => escapeHtml(row.dispute_count) },
    { label: "Payouts", render: (row) => payoutSummary(row.payment_profiles || []) },
    { label: "Joined", render: (row) => escapeHtml(date(row.created_at)) },
    {
      label: "Action",
      render: (row) => `
        <div class="inline-actions">
          ${select("verification_status", row.id, row.verification_status, ["unverified", "pending_review", "verified_manual", "rejected", "suspended"], "user")}
          ${select("risk_status", row.id, row.risk_status, ["normal", "watch", "limited", "suspended"], "user")}
          <button class="mini-button danger" data-user-suspend="${escapeHtml(row.id)}">Suspend</button>
        </div>
      `,
    },
  ], rows);
}

function payoutSummary(profiles) {
  if (!profiles.length) return `<span class="row-meta">None</span>`;
  return `
    <div class="payout-pills">
      ${profiles.map((profile) => {
        const label = profile.method === "bank"
          ? `${profile.currency} bank`
          : `${profile.currency} ${profile.momo_network || "mobile"}`;
        const name = profile.account_name ? ` title="${escapeHtml(profile.account_name)}"` : "";
        return `<span class="payout-pill"${name}>${escapeHtml(label)}</span>`;
      }).join("")}
    </div>
  `;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return escapeHtml(String(value));
  return `${Math.round(numeric * 100)}%`;
}

function reviewCheck(value) {
  if (value === true) return `<span class="check-pass">Pass</span>`;
  if (value === false) return `<span class="check-fail">Review</span>`;
  return `<span class="row-meta">Pending</span>`;
}

function renderVerificationOcr(row) {
  const reasons = Array.isArray(row.document_ocr_reasons)
    ? row.document_ocr_reasons
    : (row.document_ocr_reasons ? [row.document_ocr_reasons] : []);
  const flags = Array.isArray(row.risk_flags)
    ? row.risk_flags
    : (row.risk_flags ? [row.risk_flags] : []);
  const rawText = row.document_ocr_text
    || (row.document_ocr_raw && typeof row.document_ocr_raw === "object" ? row.document_ocr_raw.text : "")
    || "";

  return `
    <div class="stacked-cell ocr-cell">
      <div><strong>${escapeHtml(row.document_ocr_status || "not checked")}</strong>${row.document_ocr_engine ? ` <span class="row-meta">${escapeHtml(row.document_ocr_engine)}</span>` : ""}</div>
      <div class="row-meta">Confidence: ${formatPercent(row.document_ocr_confidence)}</div>
      <div>Name: <strong>${escapeHtml(row.document_ocr_name || "-")}</strong></div>
      <div>Country: ${escapeHtml(row.document_ocr_country || "-")} · Type: ${escapeHtml(row.document_ocr_type || "-")}</div>
      <div class="ocr-checks">
        <span>Name ${reviewCheck(row.document_name_match)}</span>
        <span>Country ${reviewCheck(row.document_country_match)}</span>
        <span>ID ${reviewCheck(row.document_type_match)}</span>
        <span>Face ${reviewCheck(row.document_face_match)}</span>
        <span>Payout ${reviewCheck(row.payout_name_match)}</span>
      </div>
      ${flags.length ? `<div class="row-meta">Flags: ${escapeHtml(flags.join(", "))}</div>` : ""}
      ${reasons.length ? `<div class="row-meta">Notes: ${escapeHtml(reasons.join("; "))}</div>` : ""}
      ${rawText ? `<details><summary>OCR text</summary><pre>${escapeHtml(rawText)}</pre></details>` : ""}
    </div>
  `;
}

function renderVerifications(rows) {
  attachTable("verifications-table", [
    { label: "User", render: (row) => escapeHtml(row.users?.legal_name || row.users?.display_name || row.users?.whatsapp_phone || "-") },
    { label: "Phone", render: (row) => escapeHtml(row.users?.whatsapp_phone || "-") },
    { label: "Status", render: (row) => chip(row.status) },
    { label: "Review", render: (row) => renderVerificationOcr(row) },
    { label: "Priority", render: (row) => chip(row.review_priority || "normal") },
    { label: "ID Type", render: (row) => escapeHtml(row.id_type || "-") },
    { label: "Country", render: (row) => escapeHtml(row.id_country || "-") },
    {
      label: "Profile",
      render: (row) => escapeHtml([
        row.users?.nationality,
        row.users?.residence_country,
        row.users?.city,
      ].filter(Boolean).join(" / ") || "-"),
    },
    {
      label: "Docs",
      render: (row) => `
        <div class="inline-actions">
          ${docButton(row.document_front_path, "ID", "verification-documents")}
          ${docButton(row.selfie_path, "Selfie", "verification-documents")}
        </div>
      `,
    },
    { label: "Auto", render: (row) => escapeHtml(row.automated_decision || "-") },
    { label: "Reason", render: (row) => escapeHtml(row.automated_reason || "-") },
    { label: "Created", render: (row) => escapeHtml(date(row.created_at)) },
    {
      label: "Action",
      render: (row) => `
        <div class="inline-actions">
          <button class="mini-button" data-decision="approve" data-id="${escapeHtml(row.id)}">Approve</button>
          <button class="mini-button danger" data-decision="reject" data-id="${escapeHtml(row.id)}">Reject</button>
        </div>
      `,
    },
  ], rows);
}

function docButton(path, label, bucket) {
  if (!path) return `<button class="mini-button" disabled>${escapeHtml(label)}</button>`;
  return `<button class="mini-button" data-doc-path="${escapeHtml(path)}" data-doc-bucket="${escapeHtml(bucket)}">${escapeHtml(label)}</button>`;
}

function proofButtons(proofs = []) {
  if (!proofs.length) return `<span class="row-meta">No receipts</span>`;
  return `
    <div class="inline-actions">
      ${proofs.map((proof, index) => {
        const owner = proof.users?.display_name || proof.users?.whatsapp_phone || `Receipt ${index + 1}`;
        return docButton(proof.proof_path, `${index + 1}. ${owner}`, "deal-proofs");
      }).join("")}
    </div>
  `;
}

function renderListings(rows) {
  attachTable("listings-table", [
    { label: "Reference", render: (row) => escapeHtml(row.listing_code) },
    { label: "Owner", render: (row) => escapeHtml(row.users?.display_name || row.users?.whatsapp_phone || "-") },
    { label: "Amount", render: (row) => escapeHtml(`${money(row.have_amount, row.have_currency)} -> ${money(row.want_amount, row.want_currency)}`) },
    { label: "Rate", render: (row) => escapeHtml(Number(row.rate).toFixed(4)) },
    { label: "Type", render: (row) => escapeHtml(row.listing_type) },
    { label: "Status", render: (row) => chip(row.status) },
    { label: "Created", render: (row) => escapeHtml(date(row.created_at)) },
    {
      label: "Action",
      render: (row) => select("status", row.id, row.status, ["active", "paused", "flagged", "cancelled", "expired"], "listing"),
    },
  ], rows);
}

function renderDeals(rows) {
  attachTable("deals-table", [
    { label: "Reference", render: (row) => escapeHtml(row.deal_code) },
    { label: "Maker", render: (row) => escapeHtml(row.maker?.display_name || row.maker?.whatsapp_phone || "-") },
    { label: "Taker", render: (row) => escapeHtml(row.taker?.display_name || row.taker?.whatsapp_phone || "-") },
    { label: "Amount", render: (row) => escapeHtml(`${money(row.have_amount, row.have_currency)} -> ${money(row.want_amount, row.want_currency)}`) },
    { label: "Status", render: (row) => chip(row.status) },
    { label: "Receipts", render: (row) => proofButtons(row.proofs || []) },
    { label: "Reserved", render: (row) => escapeHtml(date(row.reservation_expires_at)) },
    { label: "Created", render: (row) => escapeHtml(date(row.created_at)) },
  ], rows);
}

function renderDisputes(rows) {
  attachTable("disputes-table", [
    { label: "Deal", render: (row) => escapeHtml(row.deals?.deal_code || "-") },
    { label: "Deal status", render: (row) => chip(row.deals?.status) },
    { label: "Opened By", render: (row) => escapeHtml(row.users?.display_name || row.users?.whatsapp_phone || "-") },
    { label: "Category", render: (row) => escapeHtml(row.category) },
    { label: "Status", render: (row) => chip(row.status) },
    { label: "Description", render: (row) => escapeHtml(row.description || "-") },
    { label: "Evidence", render: (row) => proofButtons(row.proofs || []) },
    { label: "Resolution", render: (row) => escapeHtml(row.resolution || "-") },
    { label: "Created", render: (row) => escapeHtml(date(row.created_at)) },
    {
      label: "Action",
      render: (row) => disputeControls(row),
    },
  ], rows);
}

function renderSupport(rows) {
  attachTable("support-table", [
    { label: "Reference", render: (row) => `<code>${escapeHtml(row.reference || "-")}</code>` },
    { label: "User", render: (row) => escapeHtml(row.user?.legal_name || row.user?.display_name || row.whatsapp_phone || "-") },
    { label: "Phone", render: (row) => escapeHtml(row.user?.whatsapp_phone || row.whatsapp_phone || "-") },
    { label: "Category", render: (row) => escapeHtml(row.category || "general") },
    { label: "Status", render: (row) => chip(row.status || "open") },
    { label: "Message", render: (row) => escapeHtml(row.description || "-") },
    { label: "Trade", render: (row) => escapeHtml(row.deal_code || "-") },
    { label: "Created", render: (row) => escapeHtml(date(row.created_at)) },
    {
      label: "Action",
      render: (row) => `
        <div class="dispute-actions" data-support-id="${escapeHtml(row.id)}">
          ${select("status", row.id, row.status || "open", ["open", "in_review", "resolved"], "support-draft")}
          <textarea data-support-note="${escapeHtml(row.id)}" placeholder="Reply or resolution note">${escapeHtml(row.admin_note || "")}</textarea>
          <button class="mini-button" data-support-apply="${escapeHtml(row.id)}">Update</button>
        </div>
      `,
    },
  ], rows);
}

function shortHash(value) {
  const text = String(value || "");
  if (!text) return "-";
  return `${text.slice(0, 8)}...${text.slice(-8)}`;
}

function integrityAction(row) {
  if (row.status !== "anchored" || !row.batch?.transaction_hash) return "-";
  return `
    <div class="integrity-actions">
      <button class="mini-button" data-integrity-verify="${escapeHtml(row.id)}">Verify</button>
      <a class="mini-link" href="${escapeHtml(row.batch.explorer_url || "#")}" target="_blank" rel="noopener">Ledger</a>
    </div>
  `;
}

function renderIntegrity(data) {
  const summary = $("#integrity-summary");
  if (!data.schemaReady) {
    summary.innerHTML = `<div class="notice is-error">${escapeHtml(data.warning || "Integrity migration is required.")}</div>`;
    attachTable("integrity-table", [], []);
    attachTable("trust-liquidity-table", [], []);
    return;
  }

  summary.innerHTML = `
    <div class="status-strip">
      <div><span>Network</span><strong>${escapeHtml(data.network)}</strong></div>
      <div><span>Anchoring</span><strong>${data.enabled ? "On" : "Off"}</strong></div>
      <div><span>Anchored</span><strong>${escapeHtml(data.totals.anchored)}</strong></div>
      <div><span>Pending</span><strong>${escapeHtml(data.totals.pending)}</strong></div>
      <div><span>Failed batches</span><strong>${escapeHtml(data.totals.failedBatches)}</strong></div>
    </div>
    <div class="status-strip trust-primitives">
      <div><span>Rate snapshots</span><strong>${escapeHtml(data.totals.rateSnapshots || 0)}</strong></div>
      <div><span>Locked quotes</span><strong>${escapeHtml(data.totals.lockedQuotes || 0)}</strong></div>
      <div><span>Trust records</span><strong>${escapeHtml(data.totals.activeCredentials || 0)}</strong></div>
      <div><span>Split routes</span><strong>${escapeHtml(data.totals.routePlans || 0)}</strong></div>
    </div>
  `;

  attachTable("integrity-table", [
    { label: "Record", render: (row) => escapeHtml(row.record_type.replaceAll("_", " ")) },
    { label: "Subject", render: (row) => `<code title="${escapeHtml(row.subject_ref)}">${escapeHtml(shortHash(row.subject_ref))}</code>` },
    {
      label: "Reputation",
      render: (row) => row.reputation
        ? escapeHtml(`${row.reputation.reputation_band} · ${row.reputation.completed_trades} completed · ${row.reputation.completion_rate}%`)
        : "-",
    },
    { label: "Commitment", render: (row) => `<code title="${escapeHtml(row.commitment_hash)}">${escapeHtml(shortHash(row.commitment_hash))}</code>` },
    { label: "Status", render: (row) => chip(row.status) },
    { label: "Network", render: (row) => escapeHtml(row.batch?.network || "-") },
    { label: "Anchored", render: (row) => escapeHtml(date(row.anchored_at)) },
    { label: "Action", render: integrityAction },
  ], data.records || []);

  const activity = [
    ...(data.marketRates || []).map((row) => ({
      kind: "Market rate",
      reference: row.corridor_key,
      detail: `1 ${row.send_currency} = ${Number(row.weighted_rate).toFixed(4)} ${row.receive_currency}`,
      status: `${row.active_listing_count} live · ${row.completed_trade_count} completed`,
      created_at: row.created_at,
    })),
    ...(data.lockedQuotes || []).map((row) => ({
      kind: "Locked quote",
      reference: row.quote_code,
      detail: `${money(row.send_amount, row.send_currency)} → ${money(row.receive_amount, row.receive_currency)}`,
      status: row.status,
      created_at: row.created_at,
    })),
    ...(data.credentials || []).map((row) => ({
      kind: "Trust record",
      reference: row.credential_code,
      detail: `${row.reputation_band} · ${row.claims?.completed_trades || 0} completed`,
      status: row.status,
      created_at: row.created_at,
    })),
    ...(data.routes || []).map((row) => ({
      kind: "Split route",
      reference: row.route_code,
      detail: `${money(row.planned_send_amount, row.send_currency)} → ${money(row.planned_receive_amount, row.receive_currency)}`,
      status: `${row.coverage_percent}% · ${row.leg_count} legs · ${row.status}`,
      created_at: row.created_at,
    })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  attachTable("trust-liquidity-table", [
    { label: "Type", render: (row) => escapeHtml(row.kind) },
    { label: "Reference", render: (row) => `<code>${escapeHtml(row.reference)}</code>` },
    { label: "Details", render: (row) => escapeHtml(row.detail) },
    { label: "Status", render: (row) => escapeHtml(row.status) },
    { label: "Created", render: (row) => escapeHtml(date(row.created_at)) },
  ], activity);
}

function disputeControls(row) {
  return `
    <div class="dispute-actions" data-dispute-id="${escapeHtml(row.id)}">
      ${select("status", row.id, row.status, ["open", "waiting_for_user", "under_review", "resolved", "rejected"], "dispute-draft")}
      <select data-dispute-outcome="${escapeHtml(row.id)}">
        ${Object.entries(disputeOutcomes).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("")}
      </select>
      <textarea data-dispute-resolution="${escapeHtml(row.id)}" placeholder="Resolution note">${escapeHtml(row.resolution || "")}</textarea>
      <button class="mini-button" data-dispute-apply="${escapeHtml(row.id)}">Apply</button>
    </div>
  `;
}

function select(field, id, value, options, type) {
  return `
    <select data-type="${type}" data-field="${field}" data-id="${id}">
      ${options.map((option) => `<option value="${option}" ${option === value ? "selected" : ""}>${option.replaceAll("_", " ")}</option>`).join("")}
    </select>
  `;
}

async function loadView(view = state.view) {
  hideNotice();
  if (view === "overview") {
    const data = await api("/admin/api/overview");
    state.data.overview = data;
    renderOverview(data);
    return;
  }

  const data = await api(`/admin/api/${view}`);
  state.data[view] = data;
  if (view === "users") renderUsers(data);
  if (view === "verifications") renderVerifications(data);
  if (view === "listings") renderListings(data);
  if (view === "deals") renderDeals(data);
  if (view === "disputes") renderDisputes(data);
  if (view === "support") renderSupport(data);
  if (view === "integrity") renderIntegrity(data);
}

function setView(view) {
  state.view = view;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
  document.querySelectorAll(".view").forEach((item) => item.classList.toggle("is-active", item.id === view));
  $("#view-title").textContent = titles[view][0];
  loadView(view).catch((error) => showNotice(error.message, true));
}

async function updateStatus(selectElement) {
  const type = selectElement.dataset.type;
  const id = selectElement.dataset.id;
  const field = selectElement.dataset.field;
  const value = selectElement.value;

  if (type === "user") {
    await api(`/admin/api/users/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ [field]: value }),
    });
  }

  if (type === "listing") {
    await api(`/admin/api/listings/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: value }),
    });
  }

  if (type === "dispute") {
    await api(`/admin/api/disputes/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: value }),
    });
  }

  showNotice("Status updated.");
  await loadView(state.view);
}

async function applyDisputeUpdate(button) {
  const id = button.dataset.disputeApply;
  const container = button.closest(".dispute-actions");
  const status = container.querySelector("select[data-type='dispute-draft']").value;
  const dealOutcome = container.querySelector("select[data-dispute-outcome]").value;
  const resolution = container.querySelector("textarea[data-dispute-resolution]").value.trim();

  if (["resolved", "rejected"].includes(status) && !resolution) {
    throw new Error("Add a short resolution note before closing a report.");
  }

  if (status === "resolved" && dealOutcome === "none") {
    throw new Error("Choose what should happen to the trade before marking this report resolved.");
  }

  if (!["resolved", "rejected"].includes(status) && !["none", "keep_reviewing"].includes(dealOutcome)) {
    throw new Error("Move the report to resolved before closing or resuming the trade.");
  }

  await api(`/admin/api/disputes/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      deal_outcome: dealOutcome,
      resolution,
    }),
  });

  showNotice("Report updated and users notified.");
  await loadView(state.view);
}

async function applySupportUpdate(button) {
  const id = button.dataset.supportApply;
  const container = button.closest(".dispute-actions");
  const status = container.querySelector("select[data-type='support-draft']").value;
  const adminNote = container.querySelector("textarea[data-support-note]").value.trim();

  if (status === "resolved" && !adminNote) {
    throw new Error("Add a short resolution note before resolving this support request.");
  }

  await api(`/admin/api/support/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      admin_note: adminNote,
    }),
  });

  showNotice("Support request updated and the user was notified.");
  await loadView(state.view);
}

async function openVerificationDocument(button) {
  const signed = await api("/admin/api/storage-signed-url", {
    method: "POST",
    body: JSON.stringify({
      bucket: button.dataset.docBucket || "verification-documents",
      path: button.dataset.docPath,
    }),
  });
  window.open(signed.signedUrl, "_blank", "noopener");
}

async function decideVerification(button) {
  const decision = button.dataset.decision;
  const id = button.dataset.id;
  const label = decision === "approve" ? "approve" : "reject";
  if (!window.confirm(`Are you sure you want to ${label} this verification?`)) return;

  const adminNotes = window.prompt(`Optional admin note for this ${label} decision:`, "") || "";
  await api(`/admin/api/verifications/${id}/decision`, {
    method: "PATCH",
    body: JSON.stringify({ decision, admin_notes: adminNotes.trim() }),
  });
  showNotice(`Verification ${decision === "approve" ? "approved" : "rejected"}.`);
  await loadView(state.view);
}

async function verifyIntegrity(button) {
  const id = button.dataset.integrityVerify;
  const result = await api(`/admin/api/integrity/${id}/verify`, {
    method: "POST",
  });
  showNotice(`Verified on Stellar${result.ledgerSequence ? ` at ledger ${result.ledgerSequence}` : ""}.`);
}

async function suspendUser(button) {
  const id = button.dataset.userSuspend;
  if (!window.confirm("Suspend this user profile now?")) return;
  await api(`/admin/api/users/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ verification_status: "suspended", risk_status: "suspended" }),
  });
  showNotice("User suspended.");
  await loadView(state.view);
}

function bindEvents() {
  $("#admin-token").value = state.token;
  $("#save-token").addEventListener("click", () => {
    state.token = $("#admin-token").value.trim();
    localStorage.setItem("akaraAdminToken", state.token);
    showNotice("Admin token saved.");
    loadView(state.view).catch((error) => showNotice(error.message, true));
  });

  $("#refresh").addEventListener("click", () => {
    loadView(state.view).catch((error) => showNotice(error.message, true));
  });

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => setView(item.dataset.view));
  });

  document.querySelectorAll(".filter").forEach((input) => {
    input.addEventListener("input", () => applyFilter(input));
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("select[data-type='user'], select[data-type='listing']")) {
      updateStatus(event.target).catch((error) => showNotice(error.message, true));
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target.matches("button[data-doc-path]")) {
      openVerificationDocument(event.target).catch((error) => showNotice(error.message, true));
    }

    if (event.target.matches("button[data-decision]")) {
      decideVerification(event.target).catch((error) => showNotice(error.message, true));
    }

    if (event.target.matches("button[data-dispute-apply]")) {
      applyDisputeUpdate(event.target).catch((error) => showNotice(error.message, true));
    }

    if (event.target.matches("button[data-support-apply]")) {
      applySupportUpdate(event.target).catch((error) => showNotice(error.message, true));
    }

    if (event.target.matches("button[data-user-suspend]")) {
      suspendUser(event.target).catch((error) => showNotice(error.message, true));
    }

    if (event.target.matches("button[data-integrity-verify]")) {
      verifyIntegrity(event.target).catch((error) => showNotice(error.message, true));
    }
  });
}

bindEvents();
loadView().catch((error) => showNotice(error.message, true));
