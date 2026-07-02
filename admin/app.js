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
  $("#metric-disputes").textContent = data.totals.openDisputes;
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

  $("#recent-listings").innerHTML = listRows(data.recent.listings, (listing) => ({
    title: listing.status,
    meta: `${money(listing.have_amount, listing.have_currency)} -> ${money(listing.want_amount, listing.want_currency)} · ${date(listing.created_at)}`,
  }));
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
    { label: "Name", render: (row) => escapeHtml(row.display_name || "-") },
    { label: "Phone", render: (row) => escapeHtml(row.whatsapp_phone) },
    { label: "Verification", render: (row) => chip(row.verification_status) },
    { label: "Risk", render: (row) => chip(row.risk_status) },
    { label: "Completed", render: (row) => escapeHtml(row.completed_deals_count) },
    { label: "Cancels", render: (row) => escapeHtml(row.total_cancelled_deals) },
    { label: "Disputes", render: (row) => escapeHtml(row.dispute_count) },
    { label: "Joined", render: (row) => escapeHtml(date(row.created_at)) },
    {
      label: "Action",
      render: (row) => `
        <div class="inline-actions">
          ${select("verification_status", row.id, row.verification_status, ["unverified", "pending_review", "verified_manual", "rejected", "suspended"], "user")}
          ${select("risk_status", row.id, row.risk_status, ["normal", "watch", "limited", "suspended"], "user")}
        </div>
      `,
    },
  ], rows);
}

function renderVerifications(rows) {
  attachTable("verifications-table", [
    { label: "User", render: (row) => escapeHtml(row.users?.legal_name || row.users?.display_name || row.users?.whatsapp_phone || "-") },
    { label: "Phone", render: (row) => escapeHtml(row.users?.whatsapp_phone || "-") },
    { label: "Status", render: (row) => chip(row.status) },
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
          ${docButton(row.document_front_path, "ID")}
          ${docButton(row.selfie_path, "Selfie")}
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

function docButton(path, label) {
  if (!path) return `<button class="mini-button" disabled>${escapeHtml(label)}</button>`;
  return `<button class="mini-button" data-doc-path="${escapeHtml(path)}">${escapeHtml(label)}</button>`;
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
    { label: "Reserved", render: (row) => escapeHtml(date(row.reservation_expires_at)) },
    { label: "Created", render: (row) => escapeHtml(date(row.created_at)) },
  ], rows);
}

function renderDisputes(rows) {
  attachTable("disputes-table", [
    { label: "Deal", render: (row) => escapeHtml(row.deals?.deal_code || "-") },
    { label: "Opened By", render: (row) => escapeHtml(row.users?.display_name || row.users?.whatsapp_phone || "-") },
    { label: "Category", render: (row) => escapeHtml(row.category) },
    { label: "Status", render: (row) => chip(row.status) },
    { label: "Description", render: (row) => escapeHtml(row.description || "-") },
    { label: "Created", render: (row) => escapeHtml(date(row.created_at)) },
    {
      label: "Action",
      render: (row) => select("status", row.id, row.status, ["open", "waiting_for_user", "under_review", "resolved", "rejected"], "dispute"),
    },
  ], rows);
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

async function openVerificationDocument(button) {
  const signed = await api("/admin/api/storage-signed-url", {
    method: "POST",
    body: JSON.stringify({
      bucket: "verification-documents",
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

  await api(`/admin/api/verifications/${id}/decision`, {
    method: "PATCH",
    body: JSON.stringify({ decision }),
  });
  showNotice(`Verification ${decision === "approve" ? "approved" : "rejected"}.`);
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
    if (event.target.matches("select[data-type]")) {
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
  });
}

bindEvents();
loadView().catch((error) => showNotice(error.message, true));
