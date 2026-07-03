const { supabaseRequest, filterValue } = require("../lib/supabase");
const { title, caption, action, fieldBlock, formatMoney, formatCooldown } = require("../lib/format");
const { compactText } = require("../nlp/slang");
const { parseCurrencyAmountPairs } = require("../nlp/currency");
const { hasDirectionalExchangeText } = require("../nlp/exchange");
const {
  inferIntent,
  isGreeting,
  isMenuCommand,
  isHistoryCommand,
  isBrowseAllOffersIntent,
  isSentIntent,
  isReceivedIntent,
  isReminderIntent,
  isDisputeIntent,
  isBareDisputeIntent,
  isStatusIntent,
  isCancelIntent,
  isDeclineIntent,
  isCancelTradeIntent,
} = require("../nlp/intents");
const { updateUser, getUserById } = require("../db/users");
const { upsertSession, clearSession } = require("../db/sessions");
const { getDefaultPaymentProfile, formatPaymentProfile, paymentDestinationTitle, paymentExpectationLine } = require("../db/payments");
const { displayReference } = require("../db/listings");
const {
  getDealById,
  expireDealIfElapsed,
  userRoleInDeal,
  dealPartySummary,
  dealSentField,
  dealReceivedField,
  otherDealRole,
  dealPartyUserId,
  getDealPaymentProfileForRecipient,
  dealMiniSummary,
  exchangeCompleteMessage,
  notifyDealUser,
  syncCompletedDealsCount,
} = require("../db/deals");
const { storeDealProof, dealUserHasProof, sendDealProofToUser } = require("../lib/receipts");
const { sendExchangeCompletionCard } = require("../lib/listing-card");
const { feeIncludedNote } = require("../messages/copy");

const REMINDER_COOLDOWN_MS = 10 * 60 * 1000;
const receiptDeadlineTimers = new Map();

function receiptDeadlineKey(dealId, userId) {
  return `${dealId}:${userId}`;
}

function clearReceiptDeadline(dealId, userId) {
  const key = receiptDeadlineKey(dealId, userId);
  if (!receiptDeadlineTimers.has(key)) return;
  clearTimeout(receiptDeadlineTimers.get(key));
  receiptDeadlineTimers.delete(key);
}

async function openMissingReceiptDispute(dealId, userId, reason = "Payment was marked paid, but no receipt was uploaded in time.") {
  const deal = await getDealById(dealId);
  if (!deal || ["closed", "cancelled", "expired", "disputed"].includes(deal.status)) return null;

  const hasReceipt = await dealUserHasProof(dealId, userId);
  if (hasReceipt) return null;

  const existing = await supabaseRequest(
    `disputes?deal_id=eq.${filterValue(dealId)}&status=eq.open&category=eq.missing_receipt&limit=1`
  );
  if (existing.length > 0) return existing[0];

  await supabaseRequest(`deals?id=eq.${filterValue(dealId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "disputed" }),
  });

  const rows = await supabaseRequest("disputes", {
    method: "POST",
    body: JSON.stringify({
      deal_id: dealId,
      opened_by_user_id: userId,
      category: "missing_receipt",
      description: reason,
      status: "open",
    }),
  });

  return rows[0] || null;
}

async function getOpenDisputeForDeal(dealId) {
  const rows = await supabaseRequest(
    [
      "disputes?select=id,deal_id,opened_by_user_id,category,description,status,created_at",
      `deal_id=eq.${filterValue(dealId)}`,
      "status=in.(open,waiting_for_user,under_review)",
      "order=created_at.desc",
      "limit=1",
    ].join("&")
  );
  return rows[0] || null;
}

function isDisputeCloseIntent(text) {
  return /\b(close|cancel|withdraw|drop)\b.*\b(dispute|report|issue|problem|wahala|palava|kasala)\b/.test(text)
    || /\b(dispute|report|issue|problem|wahala|palava|kasala)\b.*\b(close|cancel|withdraw|drop)\b/.test(text);
}

function isDisputeConfirmIntent(text) {
  return /\b(confirm|approve|accept)\b.*\b(dispute|report|issue|problem|wahala|palava|kasala)\b/.test(text)
    || /\b(dispute|report|issue|problem|wahala|palava|kasala)\b.*\b(confirm|approve|accept)\b/.test(text);
}

function statusAfterDisputeWithdrawal(deal) {
  if (deal.maker_received_at && deal.taker_received_at) return "closed";
  if (deal.maker_sent_at && deal.taker_sent_at) return "partially_confirmed";
  if (deal.maker_sent_at) return "maker_sent";
  if (deal.taker_sent_at) return "taker_sent";
  return "reserved";
}

function scheduleReceiptDeadline(dealId, userId, otherUserId, dealCode, dueAt) {
  const key = receiptDeadlineKey(dealId, userId);
  if (receiptDeadlineTimers.has(key)) clearTimeout(receiptDeadlineTimers.get(key));

  const delay = Math.max(0, new Date(dueAt).getTime() - Date.now());
  const timer = setTimeout(async () => {
    receiptDeadlineTimers.delete(key);
    try {
      const dispute = await openMissingReceiptDispute(dealId, userId);
      if (!dispute) return;

      await notifyDealUser(otherUserId, [
        `Receipt issue opened for ${dealCode}`,
        "",
        "Your trade partner marked payment as paid but did not upload a receipt in time.",
        "Pause this trade until admin reviews it.",
      ].join("\n")).catch((error) => {
        console.error(`[deal] missing receipt notice failed for ${dealCode}: ${error.message}`);
      });
    } catch (error) {
      console.error(`[deal] missing receipt dispute failed for ${dealCode}: ${error.message}`);
    }
  }, delay);

  receiptDeadlineTimers.set(key, timer);
}

function disputeReasonFromText(text) {
  const value = String(text || "").trim();
  const cleaned = value
    .replace(/\b(please|pls|abeg)\b/gi, "")
    .replace(/\b(open|raise|start|create)?\s*(a\s+)?(dispute|report|issue|problem|wahala|palava|kasala)\b/gi, "")
    .replace(/\b(for|on)?\s*(akr[-\s])?(txn|transaction|trade|deal|match)[-\s#:]?\d{1,5}\b/gi, "")
    .replace(/\b(because|cos|cause|as|say|that)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 8 ? cleaned : "";
}

function disputeReasonPrompt(dealCode) {
  return [
    title(`Open dispute ${dealCode}`),
    caption("Tell me why this trade needs review."),
    "",
    title("Reason examples"),
    action("I paid but have not received"),
    action("The receipt looks wrong"),
    action("The amount is incorrect"),
    "",
    title("Supporting proof"),
    caption("After the reason, upload a receipt, screenshot, or image that can help admin review it."),
  ].join("\n");
}

function dealSafetyLine() {
  return "Akara records the exchange trail and keeps both sides aligned. Funds still move directly through bank or mobile money, so confirm details before moving money.";
}

function paymentAlreadyMovedCaution(role, deal) {
  if (!deal) return "Pause new payments until admin shares the review outcome.";
  const otherRole = otherDealRole(role);
  const youSent = Boolean(deal[dealSentField(role)]);
  const youReceived = Boolean(deal[dealReceivedField(role)]);
  const otherSent = Boolean(deal[dealSentField(otherRole)]);
  const otherReceived = Boolean(deal[dealReceivedField(otherRole)]);

  if (youReceived && !youSent) {
    return "You have confirmed incoming value. Do not send or refund anything until admin confirms the next step.";
  }
  if (youSent && !youReceived) {
    return "You have already sent value. Keep your receipt ready and do not repeat the transfer.";
  }
  if (otherSent && !youReceived) {
    return "The other party marked payment as sent. Check your payment app, but wait for admin before releasing your side.";
  }
  if (otherReceived && !youSent) {
    return "The other party says your value landed. Wait for admin before sending, refunding, or closing this trade.";
  }
  return "Pause new payments until admin shares the review outcome.";
}

function disputeGuidance(role, dealCode, deal = null, reason = "") {
  return [
    title(`Dispute review ${dealCode}`),
    caption("This trade is paused while Akara reviews it."),
    "",
    fieldBlock("Status", "Open"),
    "",
    reason ? fieldBlock("Reason", reason) : "",
    reason ? "" : "",
    title("Caution"),
    paymentAlreadyMovedCaution(role, deal),
    "",
    title("Admin checks"),
    caption("Receipts, payout names, amounts, references, timestamps, and the chat trail."),
    "",
    title("Actions"),
    `${action("add proof")} upload a receipt or screenshot`,
    `${action("close dispute")} only if you opened it`,
  ].filter(Boolean).join("\n\n");
}

function paymentNoticeForOther(dealCode, expectedAmount, alreadyPaid, proofDelivery) {
  return [
    title("Payment marked sent ✅"),
    "",
    fieldBlock("Transaction ref", dealCode),
    "",
    fieldBlock("Expected incoming", expectedAmount),
    "",
    title("Next"),
    alreadyPaid
      ? "Your side is already marked paid. Check your bank or MoMo app, then reply received once the funds land."
      : "Check your bank or MoMo app before sending your side.",
    proofDelivery.sent ? "Receipt attached in this chat." : "",
    proofDelivery.url ? `View receipt: ${proofDelivery.url}` : "",
    "",
    title("Actions"),
    `${action("received")} when the money lands`,
    `${action("dispute")} if anything looks wrong`,
    "",
    dealSafetyLine(),
  ].filter(Boolean).join("\n\n");
}

function paymentNotedReply(dealCode, youSend, youReceive, proof, sideComplete = false) {
  return [
    title(sideComplete ? "Your side is complete ✅" : "Payment noted ✅"),
    "",
    fieldBlock("Transaction ref", dealCode),
    "",
    fieldBlock("You sent", formatMoney(youSend.amount, youSend.currency)),
    "",
    fieldBlock("Receipt", proof ? "Saved and sent" : "Needed"),
    "",
    fieldBlock("You are waiting for", formatMoney(youReceive.amount, youReceive.currency)),
    "",
    sideComplete
      ? "I will confirm the exchange after the other party confirms receipt."
      : `${action("received")} when it lands, ${action("remind")} if it drags, or ${action("dispute")} if something is wrong.`,
  ].join("\n");
}

async function dealHasAnyProof(dealId, firstUserId, secondUserId) {
  const [firstHasProof, secondHasProof] = await Promise.all([
    dealUserHasProof(dealId, firstUserId),
    dealUserHasProof(dealId, secondUserId),
  ]);
  return Boolean(firstHasProof || secondHasProof);
}

function dealHasTradeActivity(deal) {
  return Boolean(
    deal?.maker_sent_at ||
    deal?.taker_sent_at ||
    deal?.maker_received_at ||
    deal?.taker_received_at
  );
}

function cannotCancelTradeReply(deal, role, dealCode, reason) {
  const { youSend, youReceive } = dealPartySummary(role, deal);
  return [
    title("Cannot close from chat"),
    "",
    reason,
    "",
    `Transaction ref: ${dealCode}`,
    `You send: ${formatMoney(youSend.amount, youSend.currency)}`,
    `You receive: ${formatMoney(youReceive.amount, youReceive.currency)}`,
    "",
    "If this trade needs to stop, open a dispute for this transaction.",
    "If money has moved, Akara will only close it after refund proof and receipt confirmation are clear.",
    "",
    `${action(`dispute ${dealCode}`)} to start the review`,
  ].join("\n");
}

async function openUserDispute(user, deal, role, reason) {
  const dealCode = displayReference(deal.deal_code, "deal");
  const otherRole = otherDealRole(role);
  const otherUserId = dealPartyUserId(otherRole, deal);

  await supabaseRequest(`deals?id=eq.${filterValue(deal.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "disputed" }),
  });

  const rows = await supabaseRequest("disputes", {
    method: "POST",
    body: JSON.stringify({
      deal_id: deal.id,
      opened_by_user_id: user.id,
      category: "user_reported",
      description: reason,
      status: "open",
    }),
  });

  const dispute = rows[0] || null;

  await notifyDealUser(otherUserId, [
    title(`Dispute opened ${dealCode}`),
    "",
    fieldBlock("Reason", reason),
    "",
    disputeGuidance(otherRole, dealCode, deal, reason),
  ].join("\n")).catch((error) => {
    console.error(`[deal] dispute notice failed for ${dealCode}: ${error.message}`);
  });

  return {
    dispute,
    reply: [
      title(`Dispute opened ${dealCode}`),
      caption("Admin can now review this trade."),
      "",
      fieldBlock("Reason", reason),
      "",
      disputeGuidance(role, dealCode, deal, reason),
      "",
      caption("Upload a receipt, screenshot, or supporting image if you have one."),
    ].join("\n"),
  };
}

async function reminderCooldownRemainingMs(dealId, userId) {
  const since = new Date(Date.now() - REMINDER_COOLDOWN_MS).toISOString();
  const rows = await supabaseRequest(
    [
      "audit_events?select=id,created_at",
      `entity_type=eq.deal`,
      `entity_id=eq.${filterValue(dealId)}`,
      `actor_user_id=eq.${filterValue(userId)}`,
      `event_name=eq.reminder_sent`,
      `created_at=gte.${filterValue(since)}`,
      "order=created_at.desc",
      "limit=1",
    ].join("&")
  );

  const latest = rows[0]?.created_at ? new Date(rows[0].created_at).getTime() : 0;
  if (!latest) return 0;
  return Math.max(0, REMINDER_COOLDOWN_MS - (Date.now() - latest));
}

async function recordReminderSent(dealId, actorUserId, targetUserId) {
  await supabaseRequest("audit_events", {
    method: "POST",
    body: JSON.stringify({
      actor_user_id: actorUserId,
      actor_type: "user",
      entity_type: "deal",
      entity_id: dealId,
      event_name: "reminder_sent",
      event_payload: { target_user_id: targetUserId },
    }),
  });
}

async function notifyExchangeCompleteForOtherUser(otherUserId, deal, otherRole) {
  const target = await getUserById(otherUserId);
  await notifyDealUser(otherUserId, [
    exchangeCompleteMessage(deal, otherRole),
    "",
    feeIncludedNote(),
  ].join("\n"));
  if (target?.whatsapp_phone) {
    await sendExchangeCompletionCard(
      target.whatsapp_phone,
      deal,
      otherRole,
      `Exchange receipt for ${displayReference(deal.deal_code, "deal")}`
    ).catch((error) => {
      console.error(`[deal] completion card failed for ${target.whatsapp_phone}: ${error.message}`);
    });
  }
}

function isDealRoomCommand(text, incoming = {}) {
  const command = compactText(text);
  if (incoming.media?.id) return true;
  if (!command) return true;
  return isSentIntent(command)
    || isReceivedIntent(command)
    || isReminderIntent(command)
    || isStatusIntent(command)
    || isDisputeIntent(command)
    || isCancelTradeIntent(command)
    || /\b(receipt|payment screenshot|proof|paid|sent|received|remind|dispute|cancel trade|trade status|deal status)\b/.test(command);
}

function shouldLeaveDealRoomForFreshCommand(text, incoming = {}) {
  if (isDealRoomCommand(text, incoming)) return false;
  if (isMenuCommand(text) || isHistoryCommand(text) || isBrowseAllOffersIntent(text)) return true;
  if (isGreeting(text)) return true;
  if (hasDirectionalExchangeText(text) || parseCurrencyAmountPairs(text).length) return true;
  const intent = inferIntent(text);
  return ["find_offer", "create_listing", "my_deals", "my_listings", "settings"].includes(intent);
}

function isExplicitTradeRecallIntent(text, incoming = {}) {
  const command = compactText(text);
  if (incoming.media?.id) return true;
  return isSentIntent(command)
    || isReceivedIntent(command)
    || isReminderIntent(command)
    || isDisputeIntent(command)
    || isCancelTradeIntent(command)
    || /\b(deal status|trade status|transaction status|current deal|current trade|open deal|open trade|continue deal|continue trade|receipt|payment screenshot|proof)\b/.test(command);
}

// Marks both received timestamps checked; when both sides confirmed, closes
// the deal and notifies the other party. Returns the completion reply or null.
async function maybeCompleteDeal(user, dealId, deal, role, otherUserId, extraLines = []) {
  const now = new Date().toISOString();
  const updatedDeal = await getDealById(dealId);
  const bothReceived = Boolean(updatedDeal?.maker_received_at && updatedDeal?.taker_received_at);
  if (!bothReceived) return { completed: false, updatedDeal };

  await supabaseRequest(`deals?id=eq.${filterValue(dealId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      completed_at: now,
      status: "closed",
    }),
  });

  const otherRole = otherDealRole(role);
  const dealCode = displayReference(deal.deal_code, "deal");
  const completedDeal = await getDealById(dealId) || updatedDeal || deal;
  await Promise.all([
    syncCompletedDealsCount(completedDeal.maker_user_id),
    syncCompletedDealsCount(completedDeal.taker_user_id),
  ]).catch((error) => {
    console.error(`[deal] completed count sync failed for ${dealCode}: ${error.message}`);
  });
  await notifyExchangeCompleteForOtherUser(otherUserId, completedDeal, otherRole).catch((error) => {
    console.error(`[deal] completion notice failed for ${dealCode}: ${error.message}`);
  });
  if (user.whatsapp_phone) {
    await sendExchangeCompletionCard(
      user.whatsapp_phone,
      completedDeal,
      role,
      `Exchange receipt for ${dealCode}`
    ).catch((error) => {
      console.error(`[deal] completion card failed for ${user.whatsapp_phone}: ${error.message}`);
    });
  }
  await clearSession(user, user.whatsapp_phone);

  const { youSend } = dealPartySummary(role, deal);
  return {
    completed: true,
    reply: [
      exchangeCompleteMessage(completedDeal, role),
      ...extraLines,
      "",
      feeIncludedNote(youSend.currency),
    ].filter(Boolean).join("\n\n"),
  };
}

async function handleDealRoom(text, user, session, incoming = {}) {
  const command = text.trim().toLowerCase();
  const context = session.context_json || {};
  const dealId = context.deal_id;

  if (!dealId) {
    await clearSession(user, user.whatsapp_phone);
    return "I lost that trade context. Type history to continue.";
  }

  const deal = await getDealById(dealId);
  if (!deal) {
    await clearSession(user, user.whatsapp_phone);
    return "That trade is no longer available. Type history to check recent activity.";
  }

  if (await expireDealIfElapsed(deal)) {
    await clearSession(user, user.whatsapp_phone);
    return [
      title("Trade window elapsed"),
      "",
      "That reserved Akara Trade has expired because no payment activity was recorded within the window.",
      "",
      `${action("find offers")} to look again`,
      `${action("history")} to view your records`,
    ].join("\n");
  }

  const role = userRoleInDeal(user, deal);
  if (!role) {
    await clearSession(user, user.whatsapp_phone);
    return "This deal does not belong to this WhatsApp number.";
  }

  const otherRole = otherDealRole(role);
  const otherUserId = dealPartyUserId(otherRole, deal);
  const { youSend, youReceive } = dealPartySummary(role, deal);
  const otherSummary = dealPartySummary(otherRole, deal);
  const dealCode = displayReference(deal.deal_code || context.deal_code, "deal");
  const now = new Date().toISOString();

  if (["cancelled", "expired"].includes(deal.status)) {
    await clearSession(user, user.whatsapp_phone);
    return [
      `This Akara Trade is ${deal.status}.`,
      "",
      "Type history to check recent activity.",
    ].join("\n");
  }

  if (deal.status === "closed") {
    await clearSession(user, user.whatsapp_phone);
    return [
      `This Akara Trade is complete: ${dealCode}`,
      "",
      "Type history to see your transaction records.",
    ].join("\n");
  }

  if (command === "fee paid" || /\bfee\b.*\b(paid|sent|settled)\b/.test(command) || /\b(paid|sent|settled)\b.*\bfee\b/.test(command)) {
    return [
      "No separate fee payment is needed.",
      "",
      `Transaction ref: ${dealCode}`,
      feeIncludedNote(),
    ].join("\n");
  }

  if (isDisputeConfirmIntent(command)) {
    return [
      title("Dispute review"),
      caption("A dispute cannot be confirmed from chat."),
      "",
      "Akara admin reviews the evidence and shares the outcome.",
      "",
      `${action("add proof")} upload supporting evidence`,
      `${action("close dispute")} if you opened it and no longer need review`,
    ].join("\n");
  }

  if (session.current_step === "awaiting_dispute_proof") {
    if (incoming.media?.id) {
      const proof = await storeDealProof(user, dealId, incoming);
      await upsertSession(user, user.whatsapp_phone, "deal_room", "reserved", {
        deal_id: dealId,
        deal_code: deal.deal_code || context.deal_code,
      });
      return [
        title("Proof added ✅"),
        "",
        fieldBlock("Transaction ref", dealCode),
        "",
        proof?.public_url ? `View proof: ${proof.public_url}` : "The supporting file is saved for admin review.",
        "",
        disputeGuidance(role, dealCode, deal),
      ].filter(Boolean).join("\n\n");
    }

    if (isCancelIntent(command) || isDeclineIntent(command) || /\b(skip|later)\b/.test(command)) {
      await upsertSession(user, user.whatsapp_phone, "deal_room", "reserved", {
        deal_id: dealId,
        deal_code: deal.deal_code || context.deal_code,
      });
      return disputeGuidance(role, dealCode, deal);
    }
  }

  if (isDisputeCloseIntent(command)) {
    const dispute = await getOpenDisputeForDeal(dealId);
    if (!dispute) {
      return [
        title("No open dispute"),
        "",
        `Transaction ref: ${dealCode}`,
        "There is no active dispute to close for this trade.",
      ].join("\n");
    }

    if (dispute.opened_by_user_id !== user.id) {
      return [
        title("Dispute stays open"),
        caption("Only the person who opened this dispute can withdraw it."),
        "",
        fieldBlock("Transaction ref", dealCode),
        "",
        "Admin can still resolve it after reviewing the evidence.",
      ].join("\n");
    }

    await supabaseRequest(`disputes?id=eq.${filterValue(dispute.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "resolved",
        resolution: "Withdrawn by the user who opened the dispute.",
        resolved_at: now,
      }),
    });

    const resumedStatus = statusAfterDisputeWithdrawal(deal);
    await supabaseRequest(`deals?id=eq.${filterValue(dealId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: resumedStatus }),
    });

    await notifyDealUser(otherUserId, [
      title(`Dispute withdrawn ${dealCode}`),
      "",
      "The user who opened the dispute has withdrawn it.",
      resumedStatus === "closed"
        ? "This exchange is now complete."
        : "The Akara Trade can continue from its last recorded step.",
    ].join("\n")).catch((error) => {
      console.error(`[deal] dispute withdrawal notice failed for ${dealCode}: ${error.message}`);
    });

    return [
      title("Dispute withdrawn ✅"),
      "",
      fieldBlock("Transaction ref", dealCode),
      "",
      resumedStatus === "closed"
        ? "This exchange is now complete."
        : "The trade has returned to its last recorded step.",
    ].join("\n");
  }

  if (deal.status === "disputed") {
    if (incoming.media?.id) {
      const proof = await storeDealProof(user, dealId, incoming);
      return [
        title("Proof added ✅"),
        "",
        fieldBlock("Transaction ref", dealCode),
        "",
        proof?.public_url ? `View proof: ${proof.public_url}` : "The supporting file is saved for admin review.",
        "",
        disputeGuidance(role, dealCode, deal),
      ].filter(Boolean).join("\n\n");
    }

    return disputeGuidance(role, dealCode, deal);
  }

  if (isCancelTradeIntent(command)) {
    const proofExists = await dealHasAnyProof(dealId, user.id, otherUserId);
    if (dealHasTradeActivity(deal) || proofExists) {
      return cannotCancelTradeReply(
        deal,
        role,
        dealCode,
        proofExists
          ? "A receipt has already been uploaded for this trade."
          : "Payment activity has already been recorded for this trade."
      );
    }

    const cancellations = Number(user.cancelled_deals_24h || 0) + 1;
    const holdUntil = cancellations >= 4
      ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      : cancellations >= 3
        ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
        : null;

    await supabaseRequest(`deals?id=eq.${filterValue(dealId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "cancelled",
        cancelled_at: now,
        cancelled_by_user_id: user.id,
        cancellation_reason: "Cancelled from WhatsApp bot.",
      }),
    });

    await updateUser(user.id, {
      cancelled_deals_24h: cancellations,
      total_cancelled_deals: Number(user.total_cancelled_deals || 0) + 1,
      hold_until: holdUntil,
    });

    await notifyDealUser(otherUserId, [
      `Deal cancelled: ${dealCode}`,
      "",
      "Your trade partner closed this Akara Trade. Do not send money for this deal.",
    ].join("\n")).catch((error) => {
      console.error(`[deal] cancel notice failed for ${dealCode}: ${error.message}`);
    });

    await clearSession(user, user.whatsapp_phone);
    if (holdUntil) return `Deal cancelled. Your account is paused until ${new Date(holdUntil).toLocaleString()} due to repeated cancellations.`;
    return "Deal cancelled. Repeated cancellations may temporarily limit your account.";
  }

  if (session.current_step === "awaiting_dispute_reason") {
    if (isCancelIntent(command) || isDeclineIntent(command)) {
      await upsertSession(user, user.whatsapp_phone, "deal_room", "reserved", {
        deal_id: dealId,
        deal_code: deal.deal_code || context.deal_code,
      });
      return [
        title("Dispute cancelled"),
        "",
        `Transaction ref: ${dealCode}`,
        "No dispute was opened.",
      ].join("\n");
    }

    const reason = disputeReasonFromText(text);
    if (!reason) return disputeReasonPrompt(dealCode);

    const result = await openUserDispute(user, deal, role, reason);
    await upsertSession(user, user.whatsapp_phone, "deal_room", "awaiting_dispute_proof", {
      deal_id: dealId,
      deal_code: deal.deal_code || context.deal_code,
      opened_dispute_id: result.dispute?.id || null,
    });
    return result.reply;
  }

  if (isDisputeIntent(command)) {
    const reason = disputeReasonFromText(text);
    if (!reason || isBareDisputeIntent(text)) {
      await upsertSession(user, user.whatsapp_phone, "deal_room", "awaiting_dispute_reason", {
        deal_id: dealId,
        deal_code: deal.deal_code || context.deal_code,
      });
      return disputeReasonPrompt(dealCode);
    }

    const result = await openUserDispute(user, deal, role, reason);
    await upsertSession(user, user.whatsapp_phone, "deal_room", "awaiting_dispute_proof", {
      deal_id: dealId,
      deal_code: deal.deal_code || context.deal_code,
      opened_dispute_id: result.dispute?.id || null,
    });
    return result.reply;
  }

  if (session.current_step === "awaiting_receipt" && context.awaiting_receipt_user_id === user.id && !incoming.media?.id) {
    const dueAt = context.receipt_due_at ? new Date(context.receipt_due_at) : null;
    if (dueAt && dueAt.getTime() <= Date.now()) {
      await openMissingReceiptDispute(dealId, user.id);
      return [
        title("Receipt review opened"),
        "",
        fieldBlock("Transaction ref", dealCode),
        "",
        "You marked this trade as paid, but no receipt was uploaded within the payment window.",
        "Admin will review the trade trail.",
      ].join("\n");
    }

    return [
      title("Receipt needed"),
      "",
      fieldBlock("Transaction ref", dealCode),
      "",
      `Upload the receipt for ${formatMoney(youSend.amount, youSend.currency)} so I can notify your trade partner.`,
      "",
      "If you have not sent the money, reply cancel trade.",
    ].join("\n");
  }

  if ((incoming.media?.id || isSentIntent(command)) && deal[dealSentField(role)]) {
    clearReceiptDeadline(dealId, user.id);
    await upsertSession(user, user.whatsapp_phone, "deal_room", "reserved", {
      deal_id: dealId,
      deal_code: deal.deal_code || context.deal_code,
    });
    return [
      title("Payment already noted ✅"),
      "",
      fieldBlock("Transaction ref", dealCode),
      "",
      "I will not create another payment update for the same side of this trade.",
      deal[dealReceivedField(role)]
        ? "Your side is complete. I will confirm the exchange after the other party confirms receipt."
        : "Reply received when your money lands, or dispute if something looks wrong.",
    ].join("\n");
  }

  if (isSentIntent(command) && !incoming.media?.id) {
    const receiptDueAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const nextContext = {
      ...context,
      deal_id: dealId,
      deal_code: deal.deal_code || context.deal_code,
      awaiting_receipt_user_id: user.id,
      receipt_due_at: receiptDueAt,
    };

    await upsertSession(user, user.whatsapp_phone, "deal_room", "awaiting_receipt", nextContext);
    scheduleReceiptDeadline(dealId, user.id, otherUserId, dealCode, receiptDueAt);

    return [
      title("Receipt needed"),
      "",
      fieldBlock("Transaction ref", dealCode),
      "",
      `Upload the receipt for ${formatMoney(youSend.amount, youSend.currency)}.`,
      "",
      "Once it arrives, I will mark your payment as sent and forward it to your trade partner.",
    ].join("\n");
  }

  if ((incoming.media?.id || isSentIntent(command)) && isReceivedIntent(command)) {
    let proof = null;
    let proofDelivery = { sent: false, url: "" };
    if (incoming.media?.id) {
      proof = await storeDealProof(user, dealId, incoming);
      proofDelivery = await sendDealProofToUser(
        otherUserId,
        proof,
        `Receipt for ${dealCode}`
      );
      clearReceiptDeadline(dealId, user.id);
    }

    await supabaseRequest(`deals?id=eq.${filterValue(dealId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        [dealSentField(role)]: now,
        [dealReceivedField(role)]: now,
        status: deal[dealReceivedField(otherRole)] ? "closed" : "partially_confirmed",
      }),
    });

    await upsertSession(user, user.whatsapp_phone, "deal_room", "reserved", {
      deal_id: dealId,
      deal_code: deal.deal_code || context.deal_code,
    });

    const completion = await maybeCompleteDeal(user, dealId, deal, role, otherUserId, [
      proof ? "Receipt saved and sent to your trade partner." : "",
    ]);
    if (completion.completed) return completion.reply;

    await notifyDealUser(otherUserId, [
      title("Exchange update ✅"),
      "",
      fieldBlock("Transaction ref", dealCode),
      "",
      "Your trade partner marked payment sent and receipt confirmed.",
      proofDelivery.sent ? "Receipt attached in this chat." : "",
      proofDelivery.url ? `View receipt: ${proofDelivery.url}` : "",
      "",
      `${action("received")} once your own funds land`,
      `${action("dispute")} if anything looks wrong`,
    ].filter(Boolean).join("\n\n")).catch((error) => {
      console.error(`[deal] combined confirmation notice failed for ${dealCode}: ${error.message}`);
    });

    return [
      title("Your side is updated ✅"),
      "",
      fieldBlock("Transaction ref", dealCode),
      "",
      "I will confirm the exchange after your trade partner also confirms receipt.",
      proof ? "Receipt saved and sent to your trade partner." : "",
    ].filter(Boolean).join("\n\n");
  }

  if (incoming.media?.id || isSentIntent(command)) {
    const userAlreadyReceived = Boolean(deal[dealReceivedField(role)]);
    const otherAlreadySent = Boolean(deal[dealSentField(otherRole)]);
    let proof = null;
    let proofDelivery = { sent: false, url: "" };
    if (incoming.media?.id) {
      proof = await storeDealProof(user, dealId, incoming);
      proofDelivery = await sendDealProofToUser(
        otherUserId,
        proof,
        `Receipt for ${dealCode}`
      );
      clearReceiptDeadline(dealId, user.id);
    }

    const patch = {
      [dealSentField(role)]: now,
      status: deal[dealSentField(otherRole)] ? "partially_confirmed" : `${role}_sent`,
    };

    await supabaseRequest(`deals?id=eq.${filterValue(dealId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });

    await upsertSession(user, user.whatsapp_phone, "deal_room", "reserved", {
      deal_id: dealId,
      deal_code: deal.deal_code || context.deal_code,
    });

    await notifyDealUser(otherUserId, paymentNoticeForOther(
      dealCode,
      formatMoney(otherSummary.youReceive.amount, otherSummary.youReceive.currency),
      otherAlreadySent,
      proofDelivery
    )).catch((error) => {
      console.error(`[deal] payment notice failed for ${dealCode}: ${error.message}`);
    });

    if (userAlreadyReceived) {
      const completion = await maybeCompleteDeal(user, dealId, deal, role, otherUserId, [
        proof ? "Receipt saved and sent to your trade partner." : "",
      ]);
      if (completion.completed) return completion.reply;

      return paymentNotedReply(dealCode, youSend, youReceive, proof, true);
    }

    return paymentNotedReply(dealCode, youSend, youReceive, proof, false);
  }

  if (isReceivedIntent(command)) {
    const userAlreadySent = Boolean(deal[dealSentField(role)]);
    await supabaseRequest(`deals?id=eq.${filterValue(dealId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        [dealReceivedField(role)]: now,
      }),
    });

    const completion = await maybeCompleteDeal(user, dealId, deal, role, otherUserId);
    if (completion.completed) return completion.reply;
    const updatedDeal = completion.updatedDeal;

    await notifyDealUser(otherUserId, [
      title("Receipt confirmed ✅"),
      "",
      fieldBlock("Transaction ref", dealCode),
      "",
      fieldBlock("Confirmed amount", formatMoney(otherSummary.youSend.amount, otherSummary.youSend.currency)),
      "",
      userAlreadySent
        ? "Your trade partner's side is complete. Confirm your own receipt when your funds land."
        : "Your trade partner has confirmed receipt. Wait for their payment update or raise a dispute if something looks wrong.",
    ].join("\n")).catch((error) => {
      console.error(`[deal] receipt notice failed for ${dealCode}: ${error.message}`);
    });

    if (userAlreadySent) {
      return [
        title("Receipt confirmed ✅"),
        "",
        fieldBlock("Transaction ref", dealCode),
        "",
        "Your side is complete. I will confirm the exchange after your trade partner confirms receipt.",
      ].join("\n");
    }

    return [
      "Receipt confirmed ✅",
      "",
      dealMiniSummary(updatedDeal || deal, role),
    ].join("\n");
  }

  if (isReminderIntent(command)) {
    const cooldownMs = await reminderCooldownRemainingMs(dealId, user.id);
    if (cooldownMs > 0) {
      return [
        title("Reminder already sent"),
        "",
        `You can send another reminder in ${formatCooldown(cooldownMs)}.`,
        `If something feels wrong, reply ${action("dispute")}.`,
      ].join("\n");
    }

    try {
      await notifyDealUser(otherUserId, [
        `Reminder for ${dealCode}`,
        "",
        `Your trade partner is waiting for ${formatMoney(otherSummary.youSend.amount, otherSummary.youSend.currency)}.`,
        "Please check your payment app and update Akara with paid, received, or dispute.",
      ].join("\n"));
      await recordReminderSent(dealId, user.id, otherUserId);
    } catch (error) {
      console.error(`[deal] reminder failed for ${dealCode}: ${error.message}`);
      return [
        "Reminder could not be delivered.",
        "",
        "Akara received your request, but WhatsApp rejected the outgoing message. Check the access token, restart the server, then try again.",
      ].join("\n");
    }

    return [
      title("Reminder sent"),
      "",
      "You can send another reminder in 10 minutes.",
      `Keep your receipt handy. If something feels wrong, reply ${action("dispute")}.`,
    ].join("\n");
  }

  if (isStatusIntent(command) || !command) {
    const paymentProfile = await getDealPaymentProfileForRecipient(role, deal);
    const paymentBlock = deal[dealSentField(role)]
      ? ""
      : ["", `${paymentDestinationTitle(paymentProfile)}:`, formatPaymentProfile(paymentProfile)].join("\n");

    return [
      dealMiniSummary(deal, role),
      paymentBlock,
      deal[dealReceivedField(role)] ? "" : caption(paymentExpectationLine(youReceive.amount, youReceive.currency, await getDefaultPaymentProfile(user.id, youReceive.currency))),
      "",
      dealSafetyLine(),
    ].filter(Boolean).join("\n\n");
  }

  return [
    title("Trade room"),
    caption("I am still with this Akara Trade."),
    "",
    dealMiniSummary(deal, role),
    "",
    `${action("paid")} after sending your side`,
    `${action("received")} when your money lands`,
    `${action("remind")} if your trade partner is taking too long`,
    `${action("cancel trade")} to close this trade`,
    `${action("dispute")} if something looks wrong`,
  ].join("\n");
}

module.exports = {
  handleDealRoom,
  isDealRoomCommand,
  shouldLeaveDealRoomForFreshCommand,
  isExplicitTradeRecallIntent,
};
