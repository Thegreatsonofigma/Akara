const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function check(name, passed, details = "") {
  return { name, status: passed ? "pass" : "fail", details };
}

function contains(relativePath, needles) {
  if (!exists(relativePath)) return false;
  const text = read(relativePath);
  return needles.every((needle) => text.includes(needle));
}

function runAudit() {
  const checks = [
    check("Data protection policy exists", exists("docs/compliance/data-protection-policy.md")),
    check("RoPA exists", exists("docs/compliance/record-of-processing-activities.md")),
    check("DPIA exists", exists("docs/compliance/dpia-akara-whatsapp-p2p-exchange.md")),
    check("Data subject rights procedure exists", exists("docs/compliance/data-subject-rights-procedure.md")),
    check("Data breach response plan exists", exists("docs/compliance/data-breach-response-plan.md")),
    check("Vendor processor register exists", exists("docs/compliance/vendor-and-processor-register.md")),
    check("NDPC audit workbook exists", exists("docs/compliance/ndpc-compliance-audit.md")),
    check("Compliance migration exists", exists("supabase/migrations/004_ndpc_compliance_controls.sql")),
    check(
      "Compliance migration defines operational registers",
      contains("supabase/migrations/004_ndpc_compliance_controls.sql", [
        "privacy_consents",
        "data_subject_requests",
        "data_breach_incidents",
        "processor_contracts",
        "retention_rules",
      ])
    ),
    check("Admin compliance APIs are wired", contains("server/admin.js", ["/admin/api/compliance", "getComplianceDashboard"])),
    check("Sensitive redaction helper exists", exists("server/lib/privacy.js")),
    check("Compliance data access layer exists", exists("server/db/compliance.js")),
    check("Private KYC bucket configured", contains("supabase/migrations/001_initial_schema.sql", ["verification-documents", "false"])),
    check("Private receipt bucket configured", contains("supabase/migrations/001_initial_schema.sql", ["deal-proofs", "false"])),
    check("Audit event table configured", contains("supabase/migrations/001_initial_schema.sql", ["audit_events", "event_payload"])),
    check("RLS enabled in schema", contains("supabase/migrations/001_initial_schema.sql", ["enable row level security"])),
  ];

  const failed = checks.filter((item) => item.status === "fail");
  const report = {
    generatedAt: new Date().toISOString(),
    project: "Akara",
    summary: {
      checks: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      certificationClaimAllowed: false,
      note: "Technical controls are readiness evidence only. Formal NDPC certification still requires business review, vendor contracts, DPCO/legal assessment, and regulator filing where applicable.",
    },
    checks,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = failed.length ? 1 : 0;
}

runAudit();
