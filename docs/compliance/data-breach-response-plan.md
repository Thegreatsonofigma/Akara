# Akara Data Breach Response Plan

## 1. Purpose

This plan explains how Akara detects, contains, investigates, reports, and learns from personal data breaches.

A breach may include unauthorised access, disclosure, loss, alteration, destruction, ransomware, credential compromise, exposed storage, leaked KYC documents, leaked receipts, or admin misuse.

## 2. Response Team

| Role | Responsibility |
| --- | --- |
| Incident Lead | Coordinates the response and timeline. |
| Engineering Lead | Contains technical issue, preserves logs, fixes root cause. |
| Privacy Lead | Assesses data protection impact and notification duties. |
| Admin / Support Lead | Handles user communications and support scripts. |
| Legal / DPCO | Advises on regulator notification and evidence. |

## 3. Severity Levels

| Level | Example | Response |
| --- | --- | --- |
| Low | Internal misroute with no sensitive data exposure. | Log, fix, monitor. |
| Medium | Limited exposure of payout or trade data. | Contain, assess, notify affected users if needed. |
| High | KYC, selfie, receipt, or dispute evidence exposed. | Immediate containment, legal review, regulator assessment, affected user notice where required. |
| Critical | Large-scale breach, credential compromise, active fraud, or public leak. | Full incident response, external support, regulator notification, user notice, postmortem. |

## 4. Response Steps

### Step 1: Detect And Log

Record:

- date and time discovered;
- reporter;
- affected system;
- suspected data type;
- affected users;
- initial severity;
- immediate risk.

### Step 2: Contain

Actions may include:

- revoke exposed keys;
- disable compromised admin account;
- rotate access tokens;
- disable affected webhook;
- revoke signed URLs;
- lock affected storage bucket;
- pause risky flows;
- suspend suspicious accounts.

### Step 3: Preserve Evidence

Preserve:

- server logs;
- admin audit logs;
- database audit entries;
- storage access logs;
- screenshots;
- vendor incident notices;
- affected records list.

Do not destroy evidence during containment.

### Step 4: Assess Impact

Assess:

- data types affected;
- number of users affected;
- whether KYC, selfie, payout, receipts, or dispute records were involved;
- whether the data was encrypted or access-controlled;
- likelihood of fraud, impersonation, financial loss, or harm;
- whether notification is required by law or NDPC guidance.

### Step 5: Notify

Where required, notify:

- NDPC or relevant regulator within the period required by law or official guidance;
- affected users without unnecessary delay where there is meaningful risk;
- vendors or processors where they need to act;
- law enforcement where fraud or criminal activity is suspected.

User notices should explain:

- what happened;
- what data may be affected;
- what Akara has done;
- what the user should do;
- where to get support.

### Step 6: Fix And Monitor

Actions may include:

- patch code;
- improve access control;
- update RLS policies;
- restrict buckets;
- improve logging;
- add monitoring;
- update vendor controls;
- reset tokens or passwords;
- retrain admins.

### Step 7: Postmortem

Within 10 business days where possible, complete:

- root cause;
- timeline;
- affected data;
- decisions made;
- notifications sent;
- user impact;
- control gaps;
- corrective actions;
- owner and due date.

## 5. Breach Register

Maintain a breach register with:

- incident ID;
- discovery date;
- severity;
- systems affected;
- data affected;
- number of users affected;
- containment steps;
- regulator decision;
- user notification decision;
- root cause;
- remediation;
- closure date.

## 6. Test Schedule

Akara should test this plan:

- before production launch;
- after major architecture changes;
- at least annually;
- after any real incident.
