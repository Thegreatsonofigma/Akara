const { supabaseRequest, filterValue } = require("../lib/supabase");
const { title, caption, action, formatMoney, formatCooldown } = require("../lib/format");
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
const { updateUser } = require("../db/users");
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
} = require("../db/deals");
const { storeDealProof, dealUserHasProof, sendDealProofToUser } = require("../lib/receipts");
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
    "Send a short reason, like:",
    action("I paid but have not received"),
    action("The receipt looks wrong"),
    action("The amount is incorrect"),
    "",
    caption("You can upload a receipt or screenshot after the reason is saved."),
  ].join("\n");
}

function disputeGuidance(role, dealCode) {
  return [
    title(`Dispute review ${dealCode}`),
    "",
    "Do not send any new payment for this trade until admin reviews it.",
    "Keep your receipt, payment alert, bank or MoMo history, and chat trail ready.",
    role === "maker"
      ? "Because this is your listing, do not release or resend value unless Akara confirms the review outcome."
      : "Because you opened or joined this trade, do not repeat the transfer unless Akara confirms the review outcome.",
    "",
    caption("Admin will compare the transaction reference, receipts, payout names, amounts, and timestamps."),
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

  await supabaseRequest("disputes", {
    method: "POST",
    body: JSON.stringify({
      deal_id: deal.id,
      opened_by_user_id: user.id,
      category: "user_reported",
      description: reason,
      status: "open",
    }),
  });

  await notifyDealUser(otherUserId, [
    `Dispute opened for ${dealCode}`,
    "",
    `Reason shared: ${reason}`,
    "",
    disputeGuidance(otherRole, dealCode),
  ].join("\n")).catch((error) => {
    console.error(`[deal] dispute notice failed for ${dealCode}: ${error.message}`);
  });

  return [
    `Dispute opened for ${dealCode}.`,
    "",
    `Reason saved: ${reason}`,
    "",
    disputeGuidance(role, dealCode),
  ].join("\n");
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
  await notifyDealUser(otherUserId, [
    exchangeCompleteMessage(deal, otherRole),
    "",
    feeIncludedNote(),
  ].join("\n"));
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
  await notifyExchangeCompleteForOtherUser(otherUserId, updatedDeal || deal, otherRole).catch((error) => {
    console.error(`[deal] completion notice failed for ${dealCode}: ${error.message}`);
  });
  await clearSession(user, user.whatsapp_phone);

  const { youSend } = dealPartySummary(role, deal);
  return {
    completed: true,
    reply: [
      exchangeCompleteMessage(updatedDeal || deal, role),
      ...extraLines,
      "",
      feeIncludedNote(youSend.currency),
    ].filter(Boolean).join("\n"),
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

  if (deal.status === "disputed") {
    return disputeGuidance(role, dealCode);
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

  if (isCancelTradeIntent(command)) {
    const otherHasReceipt = await dealUserHasProof(dealId, otherUserId);
    if (otherHasReceipt) {
      return [
        "This trade cannot be cancelled from chat.",
        "",
        "Your trade partner has already uploaded a receipt.",
        "Reply received if the money landed, or dispute if anything looks wrong.",
      ].join("\n");
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

    await clearSession(user, user.whatsapp_phone);
    return openUserDispute(user, deal, role, reason);
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

    await clearSession(user, user.whatsapp_phone);
    return openUserDispute(user, deal, role, reason);
  }

  if (session.current_step === "awaiting_receipt" && context.awaiting_receipt_user_id === user.id && !incoming.media?.id) {
    const dueAt = context.receipt_due_at ? new Date(context.receipt_due_at) : null;
    if (dueAt && dueAt.getTime() <= Date.now()) {
      await openMissingReceiptDispute(dealId, user.id);
      return [
        `Receipt review opened for ${dealCode}.`,
        "",
        "You marked this trade as paid, but no receipt was uploaded within the payment window.",
        "Admin will review the trade trail.",
      ].join("\n");
    }

    return [
      "Receipt needed.",
      "",
      `Transaction ref: ${dealCode}`,
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
      "Payment already noted ✅",
      "",
      `Transaction ref: ${dealCode}`,
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
      "Receipt needed.",
      "",
      `Transaction ref: ${dealCode}`,
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
      `Exchange update ✅ ${dealCode}`,
      "",
      `Your trade partner marked payment sent and receipt confirmed.`,
      proofDelivery.sent ? "Receipt attached in this chat." : "",
      proofDelivery.url ? `View receipt: ${proofDelivery.url}` : "",
      "",
      "Reply received once your own funds land, or dispute if anything looks wrong.",
    ].filter(Boolean).join("\n")).catch((error) => {
      console.error(`[deal] combined confirmation notice failed for ${dealCode}: ${error.message}`);
    });

    return [
      "Your side is updated ✅",
      "",
      `Transaction ref: ${dealCode}`,
      "I will confirm the exchange after your trade partner also confirms receipt.",
      proof ? "Receipt saved and sent to your trade partner." : "",
    ].filter(Boolean).join("\n");
  }

  if (incoming.media?.id || isSentIntent(command)) {
    const userAlreadyReceived = Boolean(deal[dealReceivedField(role)]);
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

    await notifyDealUser(otherUserId, [
      `Payment marked sent ✅ ${dealCode}`,
      "",
      `Expected amount: ${formatMoney(otherSummary.youReceive.amount, otherSummary.youReceive.currency)}`,
      "Check your bank or MoMo app before sending your side.",
      proofDelivery.sent ? "Receipt attached in this chat." : "",
      proofDelivery.url ? `View receipt: ${proofDelivery.url}` : "",
      "",
      "Reply received once the money lands, or dispute if anything looks wrong.",
    ].filter(Boolean).join("\n")).catch((error) => {
      console.error(`[deal] payment notice failed for ${dealCode}: ${error.message}`);
    });

    if (userAlreadyReceived) {
      const completion = await maybeCompleteDeal(user, dealId, deal, role, otherUserId, [
        proof ? "Receipt saved and sent to your trade partner." : "",
      ]);
      if (completion.completed) return completion.reply;

      return [
        "Payment noted ✅",
        "",
        `Transaction ref: ${dealCode}`,
        "Your side is complete. I will confirm the exchange after your trade partner confirms receipt.",
        proof ? "Receipt saved and sent to your trade partner." : "",
      ].filter(Boolean).join("\n");
    }

    return [
      "Payment noted ✅",
      "",
      `Transaction ref: ${dealCode}`,
      `You sent: ${formatMoney(youSend.amount, youSend.currency)}`,
      proof ? "Receipt saved and sent to your trade partner." : "Receipt required before this payment can be confirmed.",
      "",
      `Now wait for: ${formatMoney(youReceive.amount, youReceive.currency)}`,
      "Reply remind if it drags, received when it lands, or dispute if something is wrong.",
    ].join("\n");
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
      `Receipt confirmed ✅ ${dealCode}`,
      "",
      `${formatMoney(otherSummary.youSend.amount, otherSummary.youSend.currency)} has been confirmed by your trade partner.`,
      userAlreadySent
        ? "Your trade partner's side is complete. Confirm your own receipt when your funds land."
        : "Your trade partner has confirmed receipt. Wait for their payment update or raise a dispute if something looks wrong.",
    ].join("\n")).catch((error) => {
      console.error(`[deal] receipt notice failed for ${dealCode}: ${error.message}`);
    });

    if (userAlreadySent) {
      return [
        "Receipt confirmed ✅",
        "",
        `Transaction ref: ${dealCode}`,
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
        "Reminder already sent.",
        "",
        `You can send another reminder in ${formatCooldown(cooldownMs)}.`,
        "If something feels wrong, reply dispute.",
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
      "Reminder sent.",
      "",
      "You can send another reminder in 10 minutes.",
      "Keep your receipt handy. If something feels wrong, reply dispute.",
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
      "Akara does not hold the money. It keeps the trail clear so both sides know what happened.",
    ].filter(Boolean).join("\n");
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
