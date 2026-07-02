#!/usr/bin/env node

// Live classification tests against the real OpenAI API using the key in
// .env. No Supabase or WhatsApp calls — only the interpreter. Verifies the
// upgraded model behaviour: scoped views, flow interrupts, pidgin, slot
// extraction, and transcript-based context resolution.
//
// Run: node server/test/live-interpreter-test.js

const { interpretMessage } = require("../nlp/interpreter");
const { isOpenAiEnabled } = require("../lib/openai");

const CASES = [
  // scoped views + synonyms
  { text: "show me my bank information", expect: ["view_payouts"] },
  { text: "i wan see my profile", expect: ["view_profile"] },
  { text: "my account details", expect: ["view_profile", "view_payouts"] },
  { text: "my listing", expect: ["my_listings"] },
  { text: "show me the offers i posted", expect: ["my_listings"] },
  { text: "my transactions abeg", expect: ["my_deals"] },
  { text: "trade history", expect: ["my_deals"] },

  // exchange requests + slots
  {
    text: "I have 50k naira and want 55k rwf",
    expect: ["create_listing", "find_offer"],
    slots: { have_currency: "NGN", have_amount: 50000, want_currency: "RWF", want_amount: 55000 },
  },
  { text: "who get rwf make we exchange", expect: ["find_offer", "browse_offers"] },
  { text: "show me available deals", expect: ["browse_offers"] },
  { text: "open akr-list-104", expect: ["reserve_listing"] },

  // settings and payouts
  { text: "cancel all my offers", expect: ["bulk_cancel_listings"] },
  { text: "delete my gtbank payout", expect: ["settings_action"] },
  { text: "add my kuda account", expect: ["add_payout"] },
  { text: "i want to save my momo number", expect: ["add_payout"] },

  // conversational
  { text: "hello o", expect: ["greeting"] },
  { text: "thanks boss", expect: ["thanks"] },
  { text: "how you dey", expect: ["wellbeing"] },
  { text: "is akara free?", expect: ["question"], answerIncludes: "free" },

  // flow replies stay flow replies
  {
    text: "55000",
    context: { flow: "create_listing", step: "want_amount" },
    expect: ["flow_reply"],
  },
  {
    text: "GTBank",
    context: { flow: "payment_profile", step: "payment_bank_name" },
    expect: ["flow_reply"],
  },
  {
    text: "Chidi Okafor",
    context: { flow: "payment_profile", step: "payment_account_name" },
    expect: ["flow_reply"],
  },
  {
    text: "yes",
    context: { flow: "create_listing", step: "confirm" },
    expect: ["flow_reply"],
  },

  // flow interrupts: mid-flow fresh requests must NOT be flow_reply
  {
    text: "show my bank details",
    context: { flow: "create_listing", step: "want_amount" },
    expect: ["view_payouts"],
  },
  {
    text: "wetin be my transaction history",
    context: { flow: "find_offer", step: "have_currency" },
    expect: ["my_deals"],
  },
  {
    text: "i don send the money",
    context: { flow: "deal_room", step: "reserved" },
    expect: ["trade_action"],
  },
  {
    text: "menu",
    context: { flow: "payment_profile", step: "payment_network" },
    expect: ["menu"],
  },

  // transcript context resolves references and fills slots
  {
    text: "make it 60k instead",
    context: {
      flow: "create_listing",
      step: "confirm",
      transcript: [
        "User: I have 50k naira and want 55k rwf",
        "Akara: *Review listing* You send: 50,000 NGN You receive: 55,000 RWF. Say publish to make it live, edit to change it.",
      ].join("\n"),
    },
    expect: ["create_listing", "flow_reply"],
    slots: { want_currency: "RWF" },
  },
  {
    text: "same as before but with kenyan shillings",
    context: {
      transcript: [
        "User: I have 50k naira and want 55k rwf",
        "Akara: Your listing is live ✅ Send: 50,000 NGN Receive: 55,000 RWF",
      ].join("\n"),
    },
    expect: ["create_listing", "find_offer"],
    slots: { have_currency: "NGN" },
  },
];

async function run() {
  if (!isOpenAiEnabled()) {
    console.error("OPENAI_API_KEY missing — live test needs the real key in .env");
    process.exit(1);
  }

  let passed = 0;
  const failures = [];
  const latencies = [];

  for (const testCase of CASES) {
    const startedAt = Date.now();
    const result = await interpretMessage(testCase.text, testCase.context || {});
    const elapsed = Date.now() - startedAt;
    latencies.push(elapsed);

    const problems = [];
    if (!result) {
      problems.push("interpretation returned null");
    } else {
      if (!testCase.expect.includes(result.action)) {
        problems.push(`action ${result.action}, expected one of ${testCase.expect.join("/")}`);
      }
      for (const [slot, expected] of Object.entries(testCase.slots || {})) {
        if (result.details[slot] !== expected) {
          problems.push(`${slot}=${result.details[slot]}, expected ${expected}`);
        }
      }
      if (testCase.answerIncludes && !String(result.answer || "").toLowerCase().includes(testCase.answerIncludes)) {
        problems.push(`answer missing "${testCase.answerIncludes}": ${result.answer}`);
      }
    }

    const label = testCase.context?.flow ? `[${testCase.context.flow}] ${testCase.text}` : testCase.text;
    if (!problems.length) {
      passed += 1;
      console.log(`PASS (${elapsed}ms) ${label} → ${result.action}`);
    } else {
      failures.push({ label, problems });
      console.log(`FAIL (${elapsed}ms) ${label} → ${problems.join("; ")}`);
    }
  }

  const average = Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length);
  const slowest = Math.max(...latencies);
  console.log(`\n${passed}/${CASES.length} live cases passed · avg ${average}ms · slowest ${slowest}ms`);
  process.exit(failures.length ? 1 : 0);
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
