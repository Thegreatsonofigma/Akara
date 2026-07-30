const state = {
  view: "overview",
  token: localStorage.getItem("akaraAdminToken") || "local-admin",
  data: {},
  sheet: null,
};

let pendingRequests = 0;

const titles = {
  overview: ["Overview", "Monitor activity, risk and exchange operations."],
  users: ["Users", "Identity, trust and payout account controls."],
  verifications: ["Verifications", "Review identity evidence and OCR decisions."],
  listings: ["Offers", "Monitor marketplace liquidity and listing health."],
  deals: ["Trades", "Track active exchange rooms and payment evidence."],
  disputes: ["Disputes", "Review evidence and resolve exchange conflicts."],
  support: ["Support", "Respond to customer requests and escalations."],
  compliance: ["Compliance", "Operate NDPC privacy and accountability controls."],
  integrity: ["Integrity", "Verify privacy-safe records anchored to Stellar."],
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
  unverified: "Unverified",
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
  suspected: "Suspected",
  investigating: "Investigating",
  contained: "Contained",
  complete: "Complete",
  approved: "Approved",
  draft: "Draft",
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

function toast(message, isError = false) {
  const region = $("#toast-region");
  const item = document.createElement("div");
  item.className = `toast${isError ? " is-error" : ""}`;
  item.innerHTML = `<i class="ph ${isError ? "ph-warning-circle" : "ph-check-circle"}"></i><span>${escapeHtml(message)}</span>`;
  region.appendChild(item);
  window.setTimeout(() => item.remove(), 4200);
}

function setLoading(loading) {
  document.body.classList.toggle("is-loading", loading);
  if (!loading) {
    const bar = $("#loading-bar");
    bar.style.width = "100%";
    window.setTimeout(() => {
      bar.style.width = "";
      document.body.classList.remove("is-loading");
    }, 180);
  }
}

async function api(path, options = {}) {
  pendingRequests += 1;
  if (pendingRequests === 1) setLoading(true);
  try {
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
  } finally {
    pendingRequests = Math.max(0, pendingRequests - 1);
    if (pendingRequests === 0) setLoading(false);
  }
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

function renderTable(targetId, columns, rows, rowType = "") {
  const table = document.getElementById(targetId);
  table.dataset.rows = JSON.stringify(rows);
  table.dataset.rowType = rowType;

  const head = `<thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead>`;
  const body = rows.length
    ? rows.map((row, index) => `
      <tr ${rowType ? `data-row-type="${escapeHtml(rowType)}" data-row-index="${index}" tabindex="0"` : ""}>
        ${columns.map((column) => `<td>${column.render(row)}</td>`).join("")}
      </tr>
    `).join("")
    : `<tr><td colspan="${Math.max(1, columns.length)}"><span class="row-meta">No records yet.</span></td></tr>`;

  table.innerHTML = head + `<tbody>${body}</tbody>`;
}

function applyFilter(input) {
  const table = document.getElementById(input.dataset.filter);
  const rows = JSON.parse(table.dataset.rows || "[]");
  const columns = JSON.parse(table.dataset.columns || "[]");
  const query = input.value.trim().toLowerCase();
  const filtered = query ? rows.filter((row) => rowText(row).includes(query)) : rows;
  const originalColumns = table._columns;
  renderTable(input.dataset.filter, originalColumns, filtered, table._rowType);
}

function attachTable(targetId, columns, rows, rowType = "") {
  const table = document.getElementById(targetId);
  table._columns = columns;
  table._rowType = rowType;
  renderTable(targetId, columns, rows, rowType);
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
  renderNavBadge(
    "#nav-compliance-badge",
    Number(data.totals.openBreaches || 0)
      + Number(data.totals.pendingProcessorReviews || 0)
      + Number(data.totals.openComplianceTasks || 0)
  );
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
    icon: "ph-arrows-left-right",
  }));

  $("#review-queue").innerHTML = listRows(data.recent.reviewQueue || [], (item) => {
    if (item.queue_type === "verification") {
      return {
        title: "Verification review",
        meta: `${statusLabels[item.status] || item.status} · ${date(item.created_at)}`,
        icon: "ph-identification-card",
      };
    }
    if (item.queue_type === "dispute") {
      return {
        title: "Open dispute",
        meta: `${statusLabels[item.status] || item.status} · ${date(item.created_at)}`,
        icon: "ph-warning-diamond",
      };
    }
    if (item.queue_type === "support") {
      return {
        title: item.reference || "Support request",
        meta: `${statusLabels[item.status] || item.status} · ${date(item.created_at)}`,
        icon: "ph-lifebuoy",
      };
    }
    if (item.queue_type === "privacy_request") {
      return {
        title: item.request_code || "Privacy request",
        meta: `${statusLabels[item.status] || item.status} · ${date(item.created_at)}`,
        icon: "ph-user-focus",
      };
    }
    if (item.queue_type === "breach") {
      return {
        title: item.summary || "Breach review",
        meta: `${statusLabels[item.status] || item.status} · ${date(item.created_at)}`,
        icon: "ph-siren",
      };
    }
    if (item.queue_type === "processor_review") {
      return {
        title: item.processor_name || "Processor review",
        meta: `${statusLabels[item.dpa_status] || item.dpa_status} · ${date(item.review_due_at)}`,
        icon: "ph-buildings",
      };
    }
    if (item.queue_type === "compliance_task") {
      return {
        title: item.title || "Compliance task",
        meta: `${statusLabels[item.status] || item.status} · ${date(item.due_at)}`,
        icon: "ph-check-square",
      };
    }
    return {
      title: "Flagged user",
      meta: `${statusLabels[item.risk_status] || item.risk_status} · ${date(item.created_at)}`,
      icon: "ph-user-warning",
    };
  });

  $("#recent-listings").innerHTML = listRows(data.recent.listings, (listing) => ({
    title: listing.status,
    meta: `${money(listing.have_amount, listing.have_currency)} -> ${money(listing.want_amount, listing.want_currency)} · ${date(listing.created_at)}`,
    icon: "ph-swap",
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
  const colors = ["#4f8cff", "#9dff1e", "#36c5d9", "#ff526f"];
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
      <text x="48" y="45" text-anchor="middle" font-size="18" font-weight="700" fill="#f5f7fa">${total}</text>
      <text x="48" y="60" text-anchor="middle" font-size="10" fill="#8b97a7">offers</text>
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
          <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="2" fill="${index === 0 ? "#4f8cff" : "#24334a"}">
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
    const color = index === 0 ? "#4f8cff" : index === 1 ? "#9dff1e" : "#36c5d9";
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
      <div class="activity-row">
        <span class="activity-icon"><i class="ph ${escapeHtml(mapped.icon || "ph-clock-counter-clockwise")}"></i></span>
        <div class="activity-copy">
          <div class="row-title">${escapeHtml(mapped.title)}</div>
          <div class="row-meta">${escapeHtml(mapped.meta)}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderUsers(rows) {
  attachTable("users-table", [
    {
      label: "User",
      render: (row) => `<strong>${escapeHtml(row.legal_name || row.display_name || "Unnamed user")}</strong><div class="row-meta">${escapeHtml(row.whatsapp_phone)}</div>`,
    },
    { label: "Verification", render: (row) => chip(row.verification_status) },
    { label: "Risk", render: (row) => chip(row.risk_status) },
    { label: "Completed", render: (row) => escapeHtml(row.completed_deals_count || 0) },
    { label: "Disputes", render: (row) => escapeHtml(row.dispute_count) },
    { label: "Payouts", render: (row) => escapeHtml((row.payment_profiles || []).length) },
    { label: "Joined", render: (row) => escapeHtml(date(row.created_at)) },
    {
      label: "",
      render: () => `<button class="mini-button" data-open-row type="button">Review <i class="ph ph-arrow-right"></i></button>`,
    },
  ], rows, "user");
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
    {
      label: "Applicant",
      render: (row) => `<strong>${escapeHtml(row.users?.legal_name || row.users?.display_name || "Unnamed user")}</strong><div class="row-meta">${escapeHtml(row.users?.whatsapp_phone || "-")}</div>`,
    },
    { label: "Status", render: (row) => chip(row.status) },
    {
      label: "OCR",
      render: (row) => `<strong>${escapeHtml(formatPercent(row.document_ocr_confidence))}</strong><div class="row-meta">${escapeHtml(row.document_ocr_status || "Not checked")}</div>`,
    },
    { label: "Priority", render: (row) => chip(row.review_priority || "normal") },
    { label: "Document", render: (row) => escapeHtml(row.id_type || "-") },
    { label: "Country", render: (row) => escapeHtml(row.id_country || "-") },
    { label: "Auto", render: (row) => escapeHtml(row.automated_decision || "-") },
    { label: "Created", render: (row) => escapeHtml(date(row.created_at)) },
    {
      label: "",
      render: () => `<button class="mini-button" data-open-row type="button">Review <i class="ph ph-arrow-right"></i></button>`,
    },
  ], rows, "verification");
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
    { label: "Reference", render: (row) => `<code>${escapeHtml(row.listing_code)}</code>` },
    {
      label: "Exchange",
      render: (row) => `<strong>${escapeHtml(money(row.have_amount, row.have_currency))}</strong><div class="row-meta">for ${escapeHtml(money(row.want_amount, row.want_currency))}</div>`,
    },
    { label: "Owner", render: (row) => escapeHtml(row.users?.display_name || row.users?.whatsapp_phone || "-") },
    { label: "Rate", render: (row) => escapeHtml(Number(row.rate).toFixed(4)) },
    { label: "Terms", render: (row) => escapeHtml(row.listing_type) },
    { label: "Status", render: (row) => chip(row.status) },
    { label: "Created", render: (row) => escapeHtml(date(row.created_at)) },
    {
      label: "",
      render: () => `<button class="mini-button" data-open-row type="button">Inspect <i class="ph ph-arrow-right"></i></button>`,
    },
  ], rows, "listing");
}

function renderDeals(rows) {
  attachTable("deals-table", [
    { label: "Reference", render: (row) => `<code>${escapeHtml(row.deal_code)}</code>` },
    {
      label: "Exchange",
      render: (row) => `<strong>${escapeHtml(money(row.have_amount, row.have_currency))}</strong><div class="row-meta">for ${escapeHtml(money(row.want_amount, row.want_currency))}</div>`,
    },
    { label: "Maker", render: (row) => escapeHtml(row.maker?.display_name || row.maker?.whatsapp_phone || "-") },
    { label: "Taker", render: (row) => escapeHtml(row.taker?.display_name || row.taker?.whatsapp_phone || "-") },
    { label: "Status", render: (row) => chip(row.status) },
    { label: "Evidence", render: (row) => escapeHtml((row.proofs || []).length) },
    { label: "Reserved", render: (row) => escapeHtml(date(row.reservation_expires_at)) },
    { label: "", render: () => `<button class="mini-button" data-open-row type="button">Inspect <i class="ph ph-arrow-right"></i></button>` },
  ], rows, "deal");
}

function renderDisputes(rows) {
  attachTable("disputes-table", [
    { label: "Trade", render: (row) => `<code>${escapeHtml(row.deals?.deal_code || "-")}</code><div class="row-meta">${escapeHtml(statusLabels[row.deals?.status] || row.deals?.status || "-")}</div>` },
    { label: "Opened By", render: (row) => escapeHtml(row.users?.display_name || row.users?.whatsapp_phone || "-") },
    { label: "Category", render: (row) => escapeHtml(row.category) },
    { label: "Status", render: (row) => chip(row.status) },
    { label: "Evidence", render: (row) => escapeHtml((row.proofs || []).length) },
    { label: "Created", render: (row) => escapeHtml(date(row.created_at)) },
    {
      label: "",
      render: () => `<button class="mini-button" data-open-row type="button">Resolve <i class="ph ph-arrow-right"></i></button>`,
    },
  ], rows, "dispute");
}

function renderSupport(rows) {
  attachTable("support-table", [
    { label: "Reference", render: (row) => `<code>${escapeHtml(row.reference || "-")}</code>` },
    { label: "User", render: (row) => `<strong>${escapeHtml(row.user?.legal_name || row.user?.display_name || "Unknown user")}</strong><div class="row-meta">${escapeHtml(row.user?.whatsapp_phone || row.whatsapp_phone || "-")}</div>` },
    { label: "Category", render: (row) => escapeHtml(row.category || "general") },
    { label: "Status", render: (row) => chip(row.status || "open") },
    { label: "Message", render: (row) => escapeHtml(row.description || "-") },
    { label: "Trade", render: (row) => escapeHtml(row.deal_code || "-") },
    { label: "Created", render: (row) => escapeHtml(date(row.created_at)) },
    {
      label: "",
      render: () => `<button class="mini-button" data-open-row type="button">Respond <i class="ph ph-arrow-right"></i></button>`,
    },
  ], rows, "support");
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

function detailRows(items) {
  return `
    <dl class="detail-list">
      ${items.filter(([, value]) => value !== undefined).map(([label, value]) => `
        <div class="detail-row">
          <dt>${escapeHtml(label)}</dt>
          <dd>${value === null || value === "" ? "-" : value}</dd>
        </div>
      `).join("")}
    </dl>
  `;
}

function sheetSection(titleText, body, action = "") {
  return `
    <section class="sheet-section">
      <div class="sheet-section-head"><h3>${escapeHtml(titleText)}</h3>${action}</div>
      ${body}
    </section>
  `;
}

function evidenceButtons(items = [], fallback = "No evidence uploaded") {
  const available = items.filter((item) => item.path);
  if (!available.length) return `<p class="row-meta">${escapeHtml(fallback)}</p>`;
  return `
    <div class="evidence-grid">
      ${available.map((item) => `
        <button class="evidence-button" type="button" data-doc-path="${escapeHtml(item.path)}" data-doc-bucket="${escapeHtml(item.bucket)}">
          <i class="ph ${escapeHtml(item.icon || "ph-file-image")}"></i>
          <span><strong>${escapeHtml(item.label)}</strong><small>Open secure file</small></span>
        </button>
      `).join("")}
    </div>
  `;
}

function setSheetHeader({ icon, kicker, title: titleText, subtitle }) {
  $("#sheet-icon").innerHTML = `<i class="ph ${escapeHtml(icon)}"></i>`;
  $("#sheet-kicker").textContent = kicker;
  $("#sheet-title").textContent = titleText;
  $("#sheet-subtitle").textContent = subtitle || "";
}

function renderUserSheet(row) {
  setSheetHeader({
    icon: "ph-user",
    kicker: "User profile",
    title: row.legal_name || row.display_name || "Unnamed user",
    subtitle: row.whatsapp_phone,
  });
  const payouts = row.payment_profiles || [];
  $("#sheet-body").innerHTML = [
    sheetSection("Account overview", detailRows([
      ["Verification", chip(row.verification_status)],
      ["Risk level", chip(row.risk_status)],
      ["Verification score", escapeHtml(row.verification_score ?? "-")],
      ["Completed trades", escapeHtml(row.completed_deals_count || 0)],
      ["Cancelled trades", escapeHtml(row.total_cancelled_deals || 0)],
      ["Open disputes", escapeHtml(row.dispute_count || 0)],
      ["Dispute hold", row.dispute_hold ? chip("under_review") : chip("normal")],
      ["Hold until", escapeHtml(date(row.hold_until))],
      ["Joined", escapeHtml(date(row.created_at))],
    ])),
    sheetSection("Payout accounts", payouts.length
      ? payouts.map((profile) => detailRows([
        ["Currency", escapeHtml(profile.currency)],
        ["Method", escapeHtml(profile.method)],
        ["Account name", escapeHtml(profile.account_name || "-")],
        ["Provider", escapeHtml(profile.bank_name || profile.momo_network || "-")],
        ["Added", escapeHtml(date(profile.created_at))],
      ])).join("")
      : `<p class="row-meta">No payout accounts have been saved.</p>`),
    sheetSection("Account controls", `
      <div class="sheet-form" data-user-controls="${escapeHtml(row.id)}">
        <label><span>Verification status</span>${select("verification_status", row.id, row.verification_status, ["unverified", "pending_input", "pending_review", "verified_auto", "verified_manual", "rejected", "suspended"], "user-sheet")}</label>
        <label><span>Risk status</span>${select("risk_status", row.id, row.risk_status, ["normal", "watch", "limited", "suspended"], "user-sheet")}</label>
      </div>
    `),
  ].join("");
  $("#sheet-footer").hidden = false;
  $("#sheet-footer").innerHTML = `
    <button class="danger-button" type="button" data-user-suspend="${escapeHtml(row.id)}"><i class="ph ph-user-minus"></i> Suspend user</button>
    <button class="primary-button" type="button" data-user-apply="${escapeHtml(row.id)}"><i class="ph ph-check"></i> Save changes</button>
  `;
}

function renderVerificationSheet(row) {
  const applicant = row.users?.legal_name || row.users?.display_name || row.users?.whatsapp_phone || "Verification request";
  const reasons = Array.isArray(row.document_ocr_reasons) ? row.document_ocr_reasons : [row.document_ocr_reasons].filter(Boolean);
  const flags = Array.isArray(row.risk_flags) ? row.risk_flags : [row.risk_flags].filter(Boolean);
  const rawText = row.document_ocr_text
    || (row.document_ocr_raw && typeof row.document_ocr_raw === "object" ? row.document_ocr_raw.text : "")
    || "";
  setSheetHeader({
    icon: "ph-identification-card",
    kicker: "KYC review",
    title: applicant,
    subtitle: `${row.id_type || "Identity document"} · ${row.id_country || "Unknown country"}`,
  });
  $("#sheet-body").innerHTML = [
    sheetSection("Decision summary", detailRows([
      ["Status", chip(row.status)],
      ["Priority", chip(row.review_priority || "normal")],
      ["Automated decision", escapeHtml(row.automated_decision || "-")],
      ["Automated reason", escapeHtml(row.automated_reason || "-")],
      ["Submitted", escapeHtml(date(row.created_at))],
    ])),
    sheetSection("Applicant details", detailRows([
      ["Legal name", escapeHtml(row.users?.legal_name || "-")],
      ["WhatsApp", escapeHtml(row.users?.whatsapp_phone || "-")],
      ["Nationality", escapeHtml(row.users?.nationality || "-")],
      ["Residence", escapeHtml([row.users?.city, row.users?.residence_country].filter(Boolean).join(", ") || "-")],
      ["Document type", escapeHtml(row.id_type || "-")],
      ["Issuing country", escapeHtml(row.id_country || "-")],
    ])),
    sheetSection("OCR and matching", detailRows([
      ["OCR engine", escapeHtml(row.document_ocr_engine || "-")],
      ["OCR status", escapeHtml(row.document_ocr_status || "Not checked")],
      ["Confidence", escapeHtml(formatPercent(row.document_ocr_confidence))],
      ["Extracted name", escapeHtml(row.document_ocr_name || "-")],
      ["Extracted country", escapeHtml(row.document_ocr_country || "-")],
      ["Extracted type", escapeHtml(row.document_ocr_type || "-")],
      ["Name match", reviewCheck(row.document_name_match)],
      ["Country match", reviewCheck(row.document_country_match)],
      ["Document match", reviewCheck(row.document_type_match)],
      ["Face match", reviewCheck(row.document_face_match)],
      ["Payout name", reviewCheck(row.payout_name_match)],
      ["Risk flags", escapeHtml(flags.join(", ") || "None")],
      ["Review notes", escapeHtml(reasons.join("; ") || "None")],
    ]) + (rawText ? `<details><summary>View extracted OCR text</summary><pre>${escapeHtml(rawText)}</pre></details>` : "")),
    sheetSection("Evidence", evidenceButtons([
      { path: row.document_front_path, bucket: "verification-documents", label: "Identity document", icon: "ph-identification-card" },
      { path: row.selfie_path, bucket: "verification-documents", label: "Selfie", icon: "ph-camera" },
    ])),
    sheetSection("Reviewer note", `<div class="sheet-form"><label><span>Optional note sent with the decision</span><textarea id="verification-note" placeholder="Add a concise reason or instruction"></textarea></label></div>`),
  ].join("");
  $("#sheet-footer").hidden = false;
  $("#sheet-footer").innerHTML = `
    <button class="danger-button" type="button" data-decision="reject" data-id="${escapeHtml(row.id)}"><i class="ph ph-x"></i> Reject</button>
    <button class="primary-button" type="button" data-decision="approve" data-id="${escapeHtml(row.id)}"><i class="ph ph-check"></i> Approve KYC</button>
  `;
}

function renderListingSheet(row) {
  setSheetHeader({
    icon: "ph-swap",
    kicker: "Marketplace offer",
    title: row.listing_code || "Offer",
    subtitle: row.users?.display_name || row.users?.whatsapp_phone || "Unknown owner",
  });
  $("#sheet-body").innerHTML = [
    sheetSection("Offer terms", detailRows([
      ["Owner", escapeHtml(row.users?.display_name || "-")],
      ["Owner WhatsApp", escapeHtml(row.users?.whatsapp_phone || "-")],
      ["Owner verification", chip(row.users?.verification_status)],
      ["They send", escapeHtml(money(row.have_amount, row.have_currency))],
      ["They receive", escapeHtml(money(row.want_amount, row.want_currency))],
      ["Rate", escapeHtml(Number(row.rate || 0).toFixed(4))],
      ["Terms", escapeHtml(row.listing_type || "-")],
      ["Status", chip(row.status)],
      ["Created", escapeHtml(date(row.created_at))],
    ])),
    sheetSection("Marketplace control", `<div class="sheet-form" data-listing-controls="${escapeHtml(row.id)}"><label><span>Offer status</span>${select("status", row.id, row.status, ["draft", "active", "reserved", "paused", "completed", "cancelled", "expired", "flagged"], "listing-sheet")}</label></div>`),
  ].join("");
  $("#sheet-footer").hidden = false;
  $("#sheet-footer").innerHTML = `<button class="primary-button" type="button" data-listing-apply="${escapeHtml(row.id)}"><i class="ph ph-check"></i> Save offer</button>`;
}

function renderDealSheet(row) {
  setSheetHeader({
    icon: "ph-arrows-left-right",
    kicker: "Exchange room",
    title: row.deal_code || "Trade",
    subtitle: `${money(row.have_amount, row.have_currency)} for ${money(row.want_amount, row.want_currency)}`,
  });
  $("#sheet-body").innerHTML = [
    sheetSection("Trade terms", detailRows([
      ["Status", chip(row.status)],
      ["Maker sends", escapeHtml(money(row.have_amount, row.have_currency))],
      ["Maker receives", escapeHtml(money(row.want_amount, row.want_currency))],
      ["Locked rate", escapeHtml(Number(row.rate || 0).toFixed(4))],
      ["Payment window ends", escapeHtml(date(row.reservation_expires_at))],
      ["Completed", escapeHtml(date(row.completed_at))],
      ["Cancelled", escapeHtml(date(row.cancelled_at))],
      ["Opened", escapeHtml(date(row.created_at))],
    ])),
    sheetSection("Participants", detailRows([
      ["Maker", escapeHtml(row.maker?.display_name || "-")],
      ["Maker WhatsApp", escapeHtml(row.maker?.whatsapp_phone || "-")],
      ["Taker", escapeHtml(row.taker?.display_name || "-")],
      ["Taker WhatsApp", escapeHtml(row.taker?.whatsapp_phone || "-")],
    ])),
    sheetSection("Payment evidence", evidenceButtons((row.proofs || []).map((proof, index) => ({
      path: proof.proof_path,
      bucket: "deal-proofs",
      label: proof.users?.display_name || proof.users?.whatsapp_phone || `Receipt ${index + 1}`,
      icon: "ph-receipt",
    })), "No payment evidence has been uploaded.")),
  ].join("");
  $("#sheet-footer").hidden = true;
  $("#sheet-footer").innerHTML = "";
}

function renderDisputeSheet(row) {
  setSheetHeader({
    icon: "ph-warning-diamond",
    kicker: "Dispute review",
    title: row.deals?.deal_code || "Trade dispute",
    subtitle: row.category || "Uncategorised report",
  });
  $("#sheet-body").innerHTML = [
    sheetSection("Report", detailRows([
      ["Status", chip(row.status)],
      ["Trade status", chip(row.deals?.status)],
      ["Opened by", escapeHtml(row.users?.display_name || row.users?.whatsapp_phone || "-")],
      ["Category", escapeHtml(row.category || "-")],
      ["Description", escapeHtml(row.description || "-")],
      ["Current resolution", escapeHtml(row.resolution || "-")],
      ["Created", escapeHtml(date(row.created_at))],
      ["Resolved", escapeHtml(date(row.resolved_at))],
    ])),
    sheetSection("Payment state", detailRows([
      ["Maker sent", escapeHtml(date(row.deals?.maker_sent_at))],
      ["Taker sent", escapeHtml(date(row.deals?.taker_sent_at))],
      ["Maker confirmed", escapeHtml(date(row.deals?.maker_received_at))],
      ["Taker confirmed", escapeHtml(date(row.deals?.taker_received_at))],
    ])),
    sheetSection("Participants", detailRows([
      ["Maker", escapeHtml(row.deals?.maker?.display_name || row.deals?.maker?.whatsapp_phone || "-")],
      ["Taker", escapeHtml(row.deals?.taker?.display_name || row.deals?.taker?.whatsapp_phone || "-")],
    ])),
    sheetSection("Evidence", evidenceButtons((row.proofs || []).map((proof, index) => ({
      path: proof.proof_path,
      bucket: "deal-proofs",
      label: proof.users?.display_name || proof.users?.whatsapp_phone || `Evidence ${index + 1}`,
      icon: "ph-file-magnifying-glass",
    })), "No supporting evidence was found.")),
    sheetSection("Resolution", `
      <div class="sheet-form dispute-actions" data-dispute-id="${escapeHtml(row.id)}">
        <label><span>Review status</span>${select("status", row.id, row.status, ["open", "waiting_for_user", "under_review", "resolved", "rejected"], "dispute-draft")}</label>
        <label><span>Trade outcome</span><select data-dispute-outcome="${escapeHtml(row.id)}">${Object.entries(disputeOutcomes).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("")}</select></label>
        <label><span>Resolution note</span><textarea data-dispute-resolution="${escapeHtml(row.id)}" placeholder="Explain the decision clearly">${escapeHtml(row.resolution || "")}</textarea></label>
      </div>
    `),
  ].join("");
  $("#sheet-footer").hidden = false;
  $("#sheet-footer").innerHTML = `<button class="primary-button" type="button" data-dispute-apply="${escapeHtml(row.id)}"><i class="ph ph-check"></i> Apply resolution</button>`;
}

function renderSupportSheet(row) {
  setSheetHeader({
    icon: "ph-lifebuoy",
    kicker: "Support request",
    title: row.reference || "Customer request",
    subtitle: row.user?.legal_name || row.user?.display_name || row.user?.whatsapp_phone || row.whatsapp_phone,
  });
  $("#sheet-body").innerHTML = [
    sheetSection("Request", detailRows([
      ["Status", chip(row.status || "open")],
      ["Category", escapeHtml(row.category || "general")],
      ["User", escapeHtml(row.user?.legal_name || row.user?.display_name || "-")],
      ["WhatsApp", escapeHtml(row.user?.whatsapp_phone || row.whatsapp_phone || "-")],
      ["Related trade", escapeHtml(row.deal_code || "-")],
      ["Message", escapeHtml(row.description || "-")],
      ["Created", escapeHtml(date(row.created_at))],
    ])),
    sheetSection("Response", `
      <div class="sheet-form dispute-actions" data-support-id="${escapeHtml(row.id)}">
        <label><span>Request status</span>${select("status", row.id, row.status || "open", ["open", "in_review", "resolved"], "support-draft")}</label>
        <label><span>Reply or resolution note</span><textarea data-support-note="${escapeHtml(row.id)}" placeholder="Write a concise update for the user">${escapeHtml(row.admin_note || "")}</textarea></label>
      </div>
    `),
  ].join("");
  $("#sheet-footer").hidden = false;
  $("#sheet-footer").innerHTML = `<button class="primary-button" type="button" data-support-apply="${escapeHtml(row.id)}"><i class="ph ph-paper-plane-tilt"></i> Send update</button>`;
}

function renderPrivacySheet(row) {
  setSheetHeader({
    icon: "ph-user-focus",
    kicker: "Data subject request",
    title: row.request_code || "Privacy request",
    subtitle: row.users?.legal_name || row.users?.display_name || row.whatsapp_phone || "Unlinked request",
  });
  $("#sheet-body").innerHTML = [
    sheetSection("Request details", detailRows([
      ["Type", escapeHtml(row.request_type || "-")],
      ["Channel", escapeHtml(row.channel || "-")],
      ["WhatsApp", escapeHtml(row.users?.whatsapp_phone || row.whatsapp_phone || "-")],
      ["Description", escapeHtml(row.description || "-")],
      ["Due", escapeHtml(date(row.due_at))],
      ["Created", escapeHtml(date(row.created_at))],
      ["Legal hold", escapeHtml(row.legal_hold_reason || "None")],
    ])),
    sheetSection("Request handling", `
      <div class="sheet-form" data-compliance-form="privacy" data-record-id="${escapeHtml(row.id)}">
        <label><span>Status</span><select data-field="status">${["open", "identity_check", "in_progress", "completed", "rejected", "blocked"].map((item) => `<option value="${item}" ${item === row.status ? "selected" : ""}>${escapeHtml(item.replaceAll("_", " "))}</option>`).join("")}</select></label>
        <label><span>Owner</span><input data-field="admin_owner" value="${escapeHtml(row.admin_owner || "")}" placeholder="Assigned operator" /></label>
        <label><span>Response summary</span><textarea data-field="response_summary" placeholder="Record what was provided or decided">${escapeHtml(row.response_summary || "")}</textarea></label>
        <label><span>Legal hold reason</span><textarea data-field="legal_hold_reason" placeholder="Leave empty when no legal hold applies">${escapeHtml(row.legal_hold_reason || "")}</textarea></label>
      </div>
    `),
  ].join("");
  $("#sheet-footer").hidden = false;
  $("#sheet-footer").innerHTML = `<button class="primary-button" type="button" data-compliance-apply="privacy"><i class="ph ph-check"></i> Save request</button>`;
}

function renderBreachSheet(row) {
  setSheetHeader({
    icon: "ph-siren",
    kicker: "Incident response",
    title: row.summary || "Breach incident",
    subtitle: `${statusLabels[row.severity] || row.severity || "Unknown"} severity`,
  });
  $("#sheet-body").innerHTML = [
    sheetSection("Incident details", detailRows([
      ["Status", chip(row.status)],
      ["Severity", chip(row.severity)],
      ["Affected people", escapeHtml(row.affected_subject_count || 0)],
      ["Data categories", escapeHtml((row.affected_data_categories || []).join(", ") || "-")],
      ["Detected", escapeHtml(date(row.created_at))],
      ["Contained", escapeHtml(date(row.contained_at))],
      ["Regulator notified", escapeHtml(date(row.regulator_notified_at))],
      ["Users notified", escapeHtml(date(row.users_notified_at))],
    ])),
    sheetSection("Incident handling", `
      <div class="sheet-form" data-compliance-form="breach" data-record-id="${escapeHtml(row.id)}">
        <label><span>Status</span><select data-field="status">${["suspected", "investigating", "contained", "closed"].map((item) => `<option value="${item}" ${item === row.status ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <label><span>Severity</span><select data-field="severity">${["low", "medium", "high", "critical"].map((item) => `<option value="${item}" ${item === row.severity ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <label><span>Notification decision</span><input data-field="notifiable_decision" value="${escapeHtml(row.notifiable_decision || "")}" placeholder="Document whether notification is required" /></label>
        <label><span>Root cause</span><textarea data-field="root_cause" placeholder="Record the confirmed or suspected cause">${escapeHtml(row.root_cause || "")}</textarea></label>
        <label><span>Remediation</span><textarea data-field="remediation" placeholder="Record containment and corrective action">${escapeHtml(row.remediation || "")}</textarea></label>
      </div>
    `),
  ].join("");
  $("#sheet-footer").hidden = false;
  $("#sheet-footer").innerHTML = `<button class="primary-button" type="button" data-compliance-apply="breach"><i class="ph ph-check"></i> Save incident</button>`;
}

function renderProcessorSheet(row) {
  setSheetHeader({
    icon: "ph-buildings",
    kicker: "Processor governance",
    title: row.processor_name || "Data processor",
    subtitle: row.service_description || "Third-party service",
  });
  $("#sheet-body").innerHTML = [
    sheetSection("Processor record", detailRows([
      ["Purpose", escapeHtml(row.processing_purpose || row.service_description || "-")],
      ["Data categories", escapeHtml((row.data_categories || []).join(", ") || "-")],
      ["Location", escapeHtml(row.processing_location || "-")],
      ["DPA status", chip(row.dpa_status)],
      ["Risk", chip(row.risk_level)],
      ["Review due", escapeHtml(date(row.review_due_at))],
    ])),
    sheetSection("Contract review", `
      <div class="sheet-form" data-compliance-form="processor" data-record-id="${escapeHtml(row.id)}">
        <label><span>DPA status</span><select data-field="dpa_status">${["draft", "pending", "approved", "expired", "rejected"].map((item) => `<option value="${item}" ${item === row.dpa_status ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <label><span>Risk level</span><select data-field="risk_level">${["low", "medium", "high", "critical"].map((item) => `<option value="${item}" ${item === row.risk_level ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <label><span>Transfer mechanism</span><input data-field="transfer_mechanism" value="${escapeHtml(row.transfer_mechanism || "")}" placeholder="Contract, adequacy or other safeguard" /></label>
        <label><span>Contract URL</span><input data-field="contract_url" value="${escapeHtml(row.contract_url || "")}" placeholder="https://" /></label>
        <label><span>Admin notes</span><textarea data-field="admin_notes" placeholder="Review findings and follow-up">${escapeHtml(row.admin_notes || "")}</textarea></label>
      </div>
    `),
  ].join("");
  $("#sheet-footer").hidden = false;
  $("#sheet-footer").innerHTML = `<button class="primary-button" type="button" data-compliance-apply="processor"><i class="ph ph-check"></i> Save review</button>`;
}

function renderComplianceTaskSheet(row) {
  setSheetHeader({
    icon: "ph-check-square",
    kicker: "Compliance task",
    title: row.title || row.task_name || "Compliance action",
    subtitle: row.owner || "Unassigned",
  });
  $("#sheet-body").innerHTML = [
    sheetSection("Task details", detailRows([
      ["Description", escapeHtml(row.description || "-")],
      ["Status", chip(row.status)],
      ["Priority", chip(row.priority)],
      ["Owner", escapeHtml(row.owner || "-")],
      ["Due", escapeHtml(date(row.due_at))],
      ["Created", escapeHtml(date(row.created_at))],
    ])),
    sheetSection("Task update", `
      <div class="sheet-form" data-compliance-form="task" data-record-id="${escapeHtml(row.id)}">
        <label><span>Status</span><select data-field="status">${["open", "in_progress", "blocked", "complete"].map((item) => `<option value="${item}" ${item === row.status ? "selected" : ""}>${escapeHtml(item.replaceAll("_", " "))}</option>`).join("")}</select></label>
        <label><span>Priority</span><select data-field="priority">${["low", "medium", "high", "critical"].map((item) => `<option value="${item}" ${item === row.priority ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
        <label><span>Owner</span><input data-field="owner" value="${escapeHtml(row.owner || "")}" placeholder="Assigned operator" /></label>
        <label><span>Evidence URL</span><input data-field="evidence_url" value="${escapeHtml(row.evidence_url || "")}" placeholder="https://" /></label>
        <label><span>Notes</span><textarea data-field="notes" placeholder="Evidence, progress and blockers">${escapeHtml(row.notes || "")}</textarea></label>
      </div>
    `),
  ].join("");
  $("#sheet-footer").hidden = false;
  $("#sheet-footer").innerHTML = `<button class="primary-button" type="button" data-compliance-apply="task"><i class="ph ph-check"></i> Save task</button>`;
}

function openSheet(type, row) {
  if (!row) return;
  state.sheet = { type, row };
  if (type === "user") renderUserSheet(row);
  if (type === "verification") renderVerificationSheet(row);
  if (type === "listing") renderListingSheet(row);
  if (type === "deal") renderDealSheet(row);
  if (type === "dispute") renderDisputeSheet(row);
  if (type === "support") renderSupportSheet(row);
  if (type === "privacy") renderPrivacySheet(row);
  if (type === "breach") renderBreachSheet(row);
  if (type === "processor") renderProcessorSheet(row);
  if (type === "compliance-task") renderComplianceTaskSheet(row);
  $("#sheet-backdrop").hidden = false;
  $("#detail-sheet").classList.add("is-open");
  $("#detail-sheet").setAttribute("aria-hidden", "false");
  document.body.classList.add("sheet-open");
  window.setTimeout(() => $("#close-sheet").focus(), 30);
}

function closeSheet() {
  const sheet = $("#detail-sheet");
  if (!state.sheet && !sheet.classList.contains("is-open")) return;
  sheet.classList.remove("is-open");
  sheet.setAttribute("aria-hidden", "true");
  document.body.classList.remove("sheet-open");
  state.sheet = null;
  window.setTimeout(() => {
    if (!state.sheet && !sheet.classList.contains("is-open")) {
      $("#sheet-backdrop").hidden = true;
    }
  }, 260);
}

function renderCompliance(data) {
  const dashboard = data.dashboard;
  const totals = dashboard.totals || {};
  renderNavBadge(
    "#nav-compliance-badge",
    Number(totals.openBreaches || 0)
      + Number(totals.pendingProcessorReviews || 0)
      + Number(totals.openComplianceTasks || 0)
      + Number(totals.overdueDataSubjectRequests || 0)
  );
  $("#compliance-summary").innerHTML = [
    ["Privacy requests", totals.dataSubjectRequests || 0],
    ["Overdue requests", totals.overdueDataSubjectRequests || 0],
    ["Open breaches", totals.openBreaches || 0],
    ["Processor reviews", totals.pendingProcessorReviews || 0],
    ["Open tasks", totals.openComplianceTasks || 0],
  ].map(([label, value]) => `<div class="summary-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");

  attachTable("privacy-table", [
    { label: "Reference", render: (row) => `<code>${escapeHtml(row.request_code || "-")}</code>` },
    { label: "Type", render: (row) => escapeHtml(row.request_type || "-") },
    { label: "Status", render: (row) => chip(row.status) },
    { label: "Due", render: (row) => escapeHtml(date(row.due_at)) },
    { label: "", render: () => `<button class="mini-button" data-open-row type="button">Review <i class="ph ph-arrow-right"></i></button>` },
  ], data.requests || [], "privacy");

  attachTable("breaches-table", [
    { label: "Summary", render: (row) => escapeHtml(row.summary || "-") },
    { label: "Severity", render: (row) => chip(row.severity) },
    { label: "Status", render: (row) => chip(row.status) },
    { label: "Affected", render: (row) => escapeHtml(row.affected_subject_count || 0) },
    { label: "", render: () => `<button class="mini-button" data-open-row type="button">Review <i class="ph ph-arrow-right"></i></button>` },
  ], data.breaches || [], "breach");

  attachTable("processors-table", [
    { label: "Processor", render: (row) => escapeHtml(row.processor_name || "-") },
    { label: "Service", render: (row) => escapeHtml(row.service_description || "-") },
    { label: "Risk", render: (row) => chip(row.risk_level) },
    { label: "DPA", render: (row) => chip(row.dpa_status) },
    { label: "", render: () => `<button class="mini-button" data-open-row type="button">Review <i class="ph ph-arrow-right"></i></button>` },
  ], data.processors || [], "processor");

  attachTable("compliance-tasks-table", [
    { label: "Task", render: (row) => escapeHtml(row.title || row.task_name || "-") },
    { label: "Priority", render: (row) => chip(row.priority) },
    { label: "Status", render: (row) => chip(row.status) },
    { label: "Due", render: (row) => escapeHtml(date(row.due_at)) },
    { label: "", render: () => `<button class="mini-button" data-open-row type="button">Review <i class="ph ph-arrow-right"></i></button>` },
  ], data.tasks || [], "compliance-task");
}

async function loadView(view = state.view) {
  hideNotice();
  if (view === "overview") {
    const data = await api("/admin/api/overview");
    state.data.overview = data;
    renderOverview(data);
    return;
  }

  if (view === "compliance") {
    const [dashboard, requests, breaches, processors, tasks] = await Promise.all([
      api("/admin/api/compliance"),
      api("/admin/api/compliance/dsr"),
      api("/admin/api/compliance/breaches"),
      api("/admin/api/compliance/processors"),
      api("/admin/api/compliance/tasks"),
    ]);
    const data = { dashboard, requests, breaches, processors, tasks };
    state.data.compliance = data;
    renderCompliance(data);
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
  closeSheet();
  state.view = view;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
  document.querySelectorAll(".view").forEach((item) => item.classList.toggle("is-active", item.id === view));
  $("#view-title").textContent = titles[view][0];
  $("#view-subtitle").textContent = titles[view][1];
  $("#view-section").textContent = view === "overview" ? "Operations" : titles[view][0];
  document.body.classList.remove("nav-open");
  $("#nav-backdrop").hidden = true;
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

  toast("Dispute updated and both parties notified.");
  closeSheet();
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

  toast("Support request updated and the user was notified.");
  closeSheet();
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
  const adminNotes = $("#verification-note")?.value.trim() || "";
  if (decision === "reject" && !adminNotes) {
    throw new Error("Add a short note explaining why this verification is being rejected.");
  }
  await api(`/admin/api/verifications/${id}/decision`, {
    method: "PATCH",
    body: JSON.stringify({ decision, admin_notes: adminNotes }),
  });
  toast(`Verification ${decision === "approve" ? "approved" : "rejected"} and the user was notified.`);
  closeSheet();
  await loadView(state.view);
}

async function verifyIntegrity(button) {
  const id = button.dataset.integrityVerify;
  const result = await api(`/admin/api/integrity/${id}/verify`, {
    method: "POST",
  });
  toast(`Verified on Stellar${result.ledgerSequence ? ` at ledger ${result.ledgerSequence}` : ""}.`);
}

async function suspendUser(button) {
  const id = button.dataset.userSuspend;
  if (button.dataset.armed !== "true") {
    button.dataset.armed = "true";
    button.innerHTML = `<i class="ph ph-warning"></i> Confirm suspension`;
    toast("Select confirm suspension again to apply this restriction.", true);
    return;
  }
  await api(`/admin/api/users/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ verification_status: "suspended", risk_status: "suspended" }),
  });
  toast("User suspended.");
  closeSheet();
  await loadView(state.view);
}

async function applyUserUpdate(button) {
  const id = button.dataset.userApply;
  const container = document.querySelector(`[data-user-controls="${CSS.escape(id)}"]`);
  const verificationStatus = container.querySelector("[data-field='verification_status']").value;
  const riskStatus = container.querySelector("[data-field='risk_status']").value;
  await api(`/admin/api/users/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      verification_status: verificationStatus,
      risk_status: riskStatus,
    }),
  });
  toast("User controls updated.");
  closeSheet();
  await loadView(state.view);
}

async function applyListingUpdate(button) {
  const id = button.dataset.listingApply;
  const container = document.querySelector(`[data-listing-controls="${CSS.escape(id)}"]`);
  const status = container.querySelector("[data-field='status']").value;
  await api(`/admin/api/listings/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  toast("Offer status updated.");
  closeSheet();
  await loadView(state.view);
}

async function applyComplianceUpdate(button) {
  const kind = button.dataset.complianceApply;
  const form = document.querySelector(`[data-compliance-form="${CSS.escape(kind)}"]`);
  const id = form.dataset.recordId;
  const payload = {};
  form.querySelectorAll("[data-field]").forEach((field) => {
    payload[field.dataset.field] = field.value.trim();
  });
  const endpoint = {
    privacy: `/admin/api/compliance/dsr/${id}`,
    breach: `/admin/api/compliance/breaches/${id}`,
    processor: `/admin/api/compliance/processors/${id}`,
    task: `/admin/api/compliance/tasks/${id}`,
  }[kind];
  await api(endpoint, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  toast("Compliance record updated.");
  closeSheet();
  await loadView("compliance");
}

function bindEvents() {
  $("#admin-token").value = state.token;
  $("#save-token").addEventListener("click", () => {
    state.token = $("#admin-token").value.trim();
    localStorage.setItem("akaraAdminToken", state.token);
    $("#access-popover").hidden = true;
    toast("Admin connection saved.");
    loadView(state.view).catch((error) => showNotice(error.message, true));
  });

  $("#refresh").addEventListener("click", () => {
    const icon = $("#refresh i");
    icon.classList.add("ph-spin");
    loadView(state.view)
      .then(() => toast(`${titles[state.view][0]} refreshed.`))
      .catch((error) => showNotice(error.message, true))
      .finally(() => icon.classList.remove("ph-spin"));
  });

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => setView(item.dataset.view));
  });

  document.querySelectorAll(".filter").forEach((input) => {
    input.addEventListener("input", () => applyFilter(input));
  });

  $("#open-navigation").addEventListener("click", () => {
    document.body.classList.add("nav-open");
    $("#nav-backdrop").hidden = false;
  });

  const closeNavigation = () => {
    document.body.classList.remove("nav-open");
    $("#nav-backdrop").hidden = true;
  };
  $("#close-navigation").addEventListener("click", closeNavigation);
  $("#nav-backdrop").addEventListener("click", closeNavigation);

  const toggleAccess = () => {
    $("#access-popover").hidden = !$("#access-popover").hidden;
    if (!$("#access-popover").hidden) window.setTimeout(() => $("#admin-token").focus(), 20);
  };
  $("#open-access").addEventListener("click", toggleAccess);
  $("#access-status").addEventListener("click", toggleAccess);
  $("#close-access").addEventListener("click", () => { $("#access-popover").hidden = true; });

  const focusWorkspaceSearch = () => {
    const activeView = document.querySelector(".view.is-active");
    const input = activeView?.querySelector(".filter");
    if (input) {
      input.focus();
      input.select();
    } else {
      toast("Open a records workspace to search.");
    }
  };
  $("#command-search").addEventListener("click", focusWorkspaceSearch);

  $("#close-sheet").addEventListener("click", closeSheet);
  $("#sheet-backdrop").addEventListener("click", closeSheet);

  document.addEventListener("click", (event) => {
    const jump = event.target.closest("[data-view-jump]");
    if (jump) {
      setView(jump.dataset.viewJump);
      return;
    }

    const row = event.target.closest("tr[data-row-type]");
    if (row && !event.target.closest("button, a, select, textarea, input")) {
      const table = row.closest("table");
      const rows = JSON.parse(table.dataset.rows || "[]");
      openSheet(row.dataset.rowType, rows[Number(row.dataset.rowIndex)]);
      return;
    }

    const openRowButton = event.target.closest("[data-open-row]");
    if (openRowButton) {
      const tableRow = openRowButton.closest("tr[data-row-type]");
      const table = tableRow.closest("table");
      const rows = JSON.parse(table.dataset.rows || "[]");
      openSheet(tableRow.dataset.rowType, rows[Number(tableRow.dataset.rowIndex)]);
      return;
    }

    const docButtonElement = event.target.closest("button[data-doc-path]");
    if (docButtonElement) {
      openVerificationDocument(docButtonElement).catch((error) => toast(error.message, true));
      return;
    }

    const decisionButton = event.target.closest("button[data-decision]");
    if (decisionButton) {
      decideVerification(decisionButton).catch((error) => toast(error.message, true));
      return;
    }

    const disputeButton = event.target.closest("button[data-dispute-apply]");
    if (disputeButton) {
      applyDisputeUpdate(disputeButton).catch((error) => toast(error.message, true));
      return;
    }

    const supportButton = event.target.closest("button[data-support-apply]");
    if (supportButton) {
      applySupportUpdate(supportButton).catch((error) => toast(error.message, true));
      return;
    }

    const suspendButton = event.target.closest("button[data-user-suspend]");
    if (suspendButton) {
      suspendUser(suspendButton).catch((error) => toast(error.message, true));
      return;
    }

    const userApplyButton = event.target.closest("button[data-user-apply]");
    if (userApplyButton) {
      applyUserUpdate(userApplyButton).catch((error) => toast(error.message, true));
      return;
    }

    const listingApplyButton = event.target.closest("button[data-listing-apply]");
    if (listingApplyButton) {
      applyListingUpdate(listingApplyButton).catch((error) => toast(error.message, true));
      return;
    }

    const integrityButton = event.target.closest("button[data-integrity-verify]");
    if (integrityButton) {
      verifyIntegrity(integrityButton).catch((error) => toast(error.message, true));
      return;
    }

    const complianceButton = event.target.closest("button[data-compliance-apply]");
    if (complianceButton) {
      applyComplianceUpdate(complianceButton).catch((error) => toast(error.message, true));
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.sheet) closeSheet();
      $("#access-popover").hidden = true;
      closeNavigation();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      focusWorkspaceSearch();
    }
    if (event.key === "Enter" && event.target.matches("tr[data-row-type]")) {
      const row = event.target;
      const table = row.closest("table");
      const rows = JSON.parse(table.dataset.rows || "[]");
      openSheet(row.dataset.rowType, rows[Number(row.dataset.rowIndex)]);
    }
  });
}

bindEvents();
loadView().catch((error) => showNotice(error.message, true));
