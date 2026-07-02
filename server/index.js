#!/usr/bin/env node

// Entry point for the Akara WhatsApp webhook server.
//
// The implementation lives in focused modules:
//   config.js      — env loading and runtime configuration
//   lib/           — HTTP, Supabase, WhatsApp, formatting, receipt helpers
//   nlp/           — slang expansion, currency/amount parsing, intent detection
//   db/            — users, sessions, payments, listings, deals data access
//   messages/      — reusable copy and the scoped Q&A assistant
//   flows/         — conversation flows (verification, payments, listings,
//                    search, settings, deal room, history)
//   router.js      — buildReply: routes each inbound message to a flow
//   admin.js       — admin dashboard API
//   app.js         — the HTTP server and webhook endpoints

const { startServer } = require("./app");
const { buildReply } = require("./router");
const { extractMessages, getMessageText } = require("./lib/whatsapp");
const { mainMenu } = require("./messages/copy");
const { normalizeCurrency, parseAmount } = require("./nlp/currency");
const { parseSearchDetails } = require("./nlp/exchange");

if (require.main === module) {
  startServer();
}

module.exports = {
  buildReply,
  extractMessages,
  getMessageText,
  mainMenu,
  normalizeCurrency,
  parseAmount,
  parseSearchDetails,
  startServer,
};
