const { supabaseRequest, filterValue } = require("../lib/supabase");

function isMissingComplianceSchema(error) {
  return /relation .* does not exist|Could not find the table|schema cache|PGRST20/i.test(error?.message || "");
}

async function safeComplianceCall(fn, fallback) {
  try {
    return await fn();
  } catch (error) {
    if (isMissingComplianceSchema(error)) {
      if (Array.isArray(fallback)) {
        const result = [...fallback];
        result.unavailable = true;
        result.message = "Apply supabase/migrations/004_ndpc_compliance_controls.sql to enable compliance controls.";
        return result;
      }
      return {
        ...(fallback && typeof fallback === "object" ? fallback : {}),
        unavailable: true,
        message: "Apply supabase/migrations/004_ndpc_compliance_controls.sql to enable compliance controls.",
      };
    }
    throw error;
  }
}

async function insertRow(table, payload) {
  const rows = await supabaseRequest(table, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return rows[0];
}

async function patchRow(table, id, payload) {
  const rows = await supabaseRequest(`${table}?id=eq.${filterValue(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return rows[0];
}

function isOpenStatus(status) {
  return !["completed", "rejected", "blocked", "closed", "complete", "terminated"].includes(status);
}

async function recordConsent({
  userId = null,
  whatsappPhone = null,
  purpose,
  lawfulBasis,
  noticeVersion = "2026-07",
  source = "whatsapp",
  consentText = null,
  metadata = {},
}) {
  if (!purpose || !lawfulBasis) return null;
  return safeComplianceCall(
    () => insertRow("privacy_consents", {
      user_id: userId,
      whatsapp_phone: whatsappPhone,
      purpose,
      lawful_basis: lawfulBasis,
      notice_version: noticeVersion,
      source,
      consent_text: consentText,
      metadata,
    }),
    null
  );
}

async function createDataSubjectRequest({
  userId = null,
  whatsappPhone = null,
  requestType,
  description = null,
  channel = "whatsapp",
  metadata = {},
}) {
  return safeComplianceCall(
    () => insertRow("data_subject_requests", {
      user_id: userId,
      whatsapp_phone: whatsappPhone,
      request_type: requestType,
      description,
      channel,
      metadata,
    }),
    null
  );
}

async function listDataSubjectRequests() {
  return safeComplianceCall(
    () => supabaseRequest(
      "data_subject_requests?select=id,request_code,user_id,whatsapp_phone,request_type,status,channel,description,due_at,legal_hold_reason,admin_owner,response_summary,completed_at,created_at,updated_at,users!data_subject_requests_user_id_fkey(whatsapp_phone,display_name,legal_name)&order=created_at.desc&limit=100"
    ),
    []
  );
}

async function updateDataSubjectRequest(id, patch) {
  return safeComplianceCall(() => patchRow("data_subject_requests", id, patch), null);
}

async function createBreachIncident(payload) {
  return safeComplianceCall(() => insertRow("data_breach_incidents", payload), null);
}

async function listBreachIncidents() {
  return safeComplianceCall(
    () => supabaseRequest("data_breach_incidents?select=*&order=created_at.desc&limit=100"),
    []
  );
}

async function updateBreachIncident(id, patch) {
  return safeComplianceCall(() => patchRow("data_breach_incidents", id, patch), null);
}

async function listProcessorContracts() {
  return safeComplianceCall(
    () => supabaseRequest("processor_contracts?select=*&order=processor_name.asc&limit=100"),
    []
  );
}

async function updateProcessorContract(id, patch) {
  return safeComplianceCall(() => patchRow("processor_contracts", id, patch), null);
}

async function listRetentionRules() {
  return safeComplianceCall(
    () => supabaseRequest("retention_rules?select=*&order=data_category.asc&limit=100"),
    []
  );
}

async function listComplianceTasks() {
  return safeComplianceCall(
    () => supabaseRequest("compliance_tasks?select=*&order=created_at.desc&limit=100"),
    []
  );
}

async function updateComplianceTask(id, patch) {
  return safeComplianceCall(() => patchRow("compliance_tasks", id, patch), null);
}

async function getComplianceDashboard() {
  return safeComplianceCall(async () => {
    const [requests, breaches, processors, retentionRules, tasks] = await Promise.all([
      listDataSubjectRequests(),
      listBreachIncidents(),
      listProcessorContracts(),
      listRetentionRules(),
      listComplianceTasks(),
    ]);
    const now = Date.now();
    const overdueRequests = requests.filter((item) => isOpenStatus(item.status) && item.due_at && new Date(item.due_at).getTime() < now);
    const openBreaches = breaches.filter((item) => item.status !== "closed");
    const pendingProcessors = processors.filter((item) => item.dpa_status !== "approved");
    const openTasks = tasks.filter((item) => isOpenStatus(item.status));

    return {
      totals: {
        dataSubjectRequests: requests.length,
        overdueDataSubjectRequests: overdueRequests.length,
        openBreaches: openBreaches.length,
        pendingProcessorReviews: pendingProcessors.length,
        retentionRules: retentionRules.length,
        openComplianceTasks: openTasks.length,
      },
      queues: {
        dataSubjectRequests: requests.slice(0, 10),
        breaches: openBreaches.slice(0, 10),
        processorReviews: pendingProcessors.slice(0, 10),
        complianceTasks: openTasks.slice(0, 10),
      },
      retentionRules,
    };
  }, {
    totals: {
      dataSubjectRequests: 0,
      overdueDataSubjectRequests: 0,
      openBreaches: 0,
      pendingProcessorReviews: 0,
      retentionRules: 0,
      openComplianceTasks: 0,
    },
    queues: {},
    retentionRules: [],
  });
}

module.exports = {
  recordConsent,
  createDataSubjectRequest,
  listDataSubjectRequests,
  updateDataSubjectRequest,
  createBreachIncident,
  listBreachIncidents,
  updateBreachIncident,
  listProcessorContracts,
  updateProcessorContract,
  listRetentionRules,
  listComplianceTasks,
  updateComplianceTask,
  getComplianceDashboard,
};
