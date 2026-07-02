const path = require("node:path");
const { config } = require("../config");
const { supabaseRequest, filterValue } = require("./supabase");

async function sendWhatsAppText(to, message) {
  if (config.sendMode === "log") {
    console.log(`\nAkara -> ${to}\n${message}\n`);
    return { logged: true };
  }

  if (!config.whatsappAccessToken || !config.whatsappPhoneNumberId) {
    throw new Error("WhatsApp credentials are required unless AKARA_SEND_MODE=log");
  }

  const url = `https://graph.facebook.com/${config.whatsappGraphVersion}/${config.whatsappPhoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.whatsappAccessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: message,
      },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`WhatsApp ${response.status}: ${text}`);
  }

  const parsed = text ? JSON.parse(text) : null;
  await recordOutboundText(to, message, parsed).catch((error) => {
    console.error(`[webhook] outbound message memory failed for ${to}: ${error.message}`);
  });
  return parsed;
}

async function recordOutboundText(to, message, response) {
  const messageId = response?.messages?.[0]?.id;
  if (!messageId) return;

  await supabaseRequest("audit_events", {
    method: "POST",
    body: JSON.stringify({
      actor_type: "system",
      entity_type: `whatsapp_message:${messageId}`,
      event_name: "outbound_text",
      event_payload: {
        to,
        message_id: messageId,
        body: String(message || "").slice(0, 4000),
      },
    }),
  });
}

async function getOutboundTextByMessageId(messageId) {
  if (!messageId) return "";
  const rows = await supabaseRequest(
    [
      `audit_events?select=event_payload,created_at`,
      `entity_type=eq.${filterValue(`whatsapp_message:${messageId}`)}`,
      "event_name=eq.outbound_text",
      "order=created_at.desc",
      "limit=1",
    ].join("&")
  );

  return rows[0]?.event_payload?.body || "";
}

async function sendWhatsAppMedia(to, mediaType, mediaId, caption = "", filename = "") {
  if (config.sendMode === "log") {
    console.log(`\nAkara media -> ${to}\n${mediaType}: ${mediaId}\n${caption}\n`);
    return { logged: true };
  }

  if (!config.whatsappAccessToken || !config.whatsappPhoneNumberId) {
    throw new Error("WhatsApp credentials are required unless AKARA_SEND_MODE=log");
  }

  const type = mediaType === "document" ? "document" : "image";
  const mediaBody = {
    id: mediaId,
    ...(caption ? { caption } : {}),
    ...(type === "document" && filename ? { filename } : {}),
  };

  const url = `https://graph.facebook.com/${config.whatsappGraphVersion}/${config.whatsappPhoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.whatsappAccessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type,
      [type]: mediaBody,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`WhatsApp media send ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function sendWhatsAppTyping(messageId) {
  if (!messageId || config.sendMode === "log") return { skipped: true };

  if (!config.whatsappAccessToken || !config.whatsappPhoneNumberId) {
    return { skipped: true };
  }

  const url = `https://graph.facebook.com/${config.whatsappGraphVersion}/${config.whatsappPhoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.whatsappAccessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: {
        type: "text",
      },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`WhatsApp typing ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function getWhatsAppMedia(mediaId) {
  if (!config.whatsappAccessToken) {
    throw new Error("WhatsApp access token is required to download media.");
  }

  const metadataResponse = await fetch(
    `https://graph.facebook.com/${config.whatsappGraphVersion}/${mediaId}`,
    {
      headers: {
        authorization: `Bearer ${config.whatsappAccessToken}`,
      },
    }
  );
  const metadataText = await metadataResponse.text();
  if (!metadataResponse.ok) {
    throw new Error(`WhatsApp media metadata ${metadataResponse.status}: ${metadataText}`);
  }

  const metadata = JSON.parse(metadataText);
  const fileResponse = await fetch(metadata.url, {
    headers: {
      authorization: `Bearer ${config.whatsappAccessToken}`,
    },
  });
  const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
  if (!fileResponse.ok) {
    throw new Error(`WhatsApp media download ${fileResponse.status}: ${fileBuffer.toString("utf8")}`);
  }

  return {
    buffer: fileBuffer,
    contentType: metadata.mime_type || fileResponse.headers.get("content-type") || "application/octet-stream",
    sha256: metadata.sha256 || null,
  };
}

async function uploadWhatsAppMedia(buffer, contentType, filename) {
  if (config.sendMode === "log") return null;
  if (!config.whatsappAccessToken || !config.whatsappPhoneNumberId) {
    throw new Error("WhatsApp credentials are required unless AKARA_SEND_MODE=log");
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([buffer], { type: contentType }), filename);

  const response = await fetch(
    `https://graph.facebook.com/${config.whatsappGraphVersion}/${config.whatsappPhoneNumberId}/media`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.whatsappAccessToken}`,
      },
      body: form,
    }
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`WhatsApp media upload ${response.status}: ${text}`);
  }

  const body = text ? JSON.parse(text) : {};
  return body.id || null;
}

function mediaExtension(contentType, fallbackName = "") {
  const fromName = path.extname(fallbackName || "").replace(".", "").toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;

  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };

  return map[contentType] || "bin";
}

function extractMessages(payload) {
  const messages = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const contacts = value.contacts || [];
      const contactByWaId = new Map(contacts.map((contact) => [contact.wa_id, contact]));

      for (const message of value.messages || []) {
        const contact = contactByWaId.get(message.from);
        messages.push({
          from: message.from,
          displayName: contact?.profile?.name,
          messageId: message.id,
          quotedMessageId: message.context?.id || null,
          quotedFrom: message.context?.from || null,
          type: message.type,
          text: getMessageText(message),
          media: getMessageMedia(message),
        });
      }
    }
  }

  return messages;
}

function getMessageMedia(message) {
  const media = message.image || message.document || message.video;
  if (!media?.id) return null;

  return {
    id: media.id,
    mimeType: media.mime_type || null,
    sha256: media.sha256 || null,
    filename: media.filename || "",
    caption: media.caption || "",
  };
}

function getMessageText(message) {
  if (message.type === "text") return message.text?.body || "";
  if (message.type === "button") return message.button?.text || "";
  if (message.type === "interactive") {
    return (
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      ""
    );
  }
  if (message.type === "image") return message.image?.caption || "";
  if (message.type === "document") return message.document?.caption || "";
  if (message.type === "video") return message.video?.caption || "";
  return "";
}

module.exports = {
  sendWhatsAppText,
  getOutboundTextByMessageId,
  sendWhatsAppMedia,
  sendWhatsAppTyping,
  getWhatsAppMedia,
  uploadWhatsAppMedia,
  mediaExtension,
  extractMessages,
  getMessageText,
  getMessageMedia,
};
