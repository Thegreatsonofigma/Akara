#!/usr/bin/env node

const readline = require("node:readline");

const state = {
  user: {
    id: "demo-user",
    name: "Demo User",
    verified: false,
    completedDeals: 0,
    cancellationsToday: 0,
    holdUntil: null,
  },
  listings: [
    {
      id: "AK-1001",
      owner: "verified-user-12",
      haveCurrency: "NGN",
      wantCurrency: "RWF",
      haveAmount: 50000,
      wantAmount: 55000,
      type: "fixed",
      status: "active",
      completedDeals: 12,
    },
    {
      id: "AK-1002",
      owner: "verified-user-03",
      haveCurrency: "NGN",
      wantCurrency: "RWF",
      haveAmount: 50000,
      wantAmount: 54500,
      type: "fixed",
      status: "active",
      completedDeals: 3,
    },
  ],
  deals: [],
};

let flow = null;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "You > ",
});

function money(amount, currency) {
  return `${Number(amount).toLocaleString()} ${currency}`;
}

function bot(message = "") {
  console.log(`\nAkara > ${message}\n`);
}

function menu() {
  bot(
    [
      "Welcome to Akara.",
      "Choose: verify, create listing, find offer, my listings, my deals, cancel penalty, help, exit",
    ].join("\n")
  );
}

function requireVerified(actionName) {
  if (state.user.verified) return true;
  bot(`You need to verify before you can ${actionName}. Type "verify" to start.`);
  return false;
}

function checkHold() {
  if (!state.user.holdUntil) return true;
  const remaining = state.user.holdUntil - Date.now();
  if (remaining <= 0) {
    state.user.holdUntil = null;
    return true;
  }

  const minutes = Math.ceil(remaining / 60000);
  bot(`Your account is paused for ${minutes} more minute(s) because of repeated cancellations.`);
  return false;
}

function startCreateListing() {
  if (!requireVerified("create a listing")) return;
  if (!checkHold()) return;

  flow = {
    name: "createListing",
    step: "haveCurrency",
    data: {},
  };

  bot("What currency do you have? Type NGN or RWF.");
}

function handleCreateListing(input) {
  const value = input.trim().toUpperCase();

  if (flow.step === "haveCurrency") {
    if (!["NGN", "RWF"].includes(value)) return bot("Type NGN or RWF.");
    flow.data.haveCurrency = value;
    flow.step = "wantCurrency";
    return bot("What currency do you want? Type NGN or RWF.");
  }

  if (flow.step === "wantCurrency") {
    if (!["NGN", "RWF"].includes(value)) return bot("Type NGN or RWF.");
    if (value === flow.data.haveCurrency) return bot("Choose a different currency.");
    flow.data.wantCurrency = value;
    flow.step = "haveAmount";
    return bot(`How much ${flow.data.haveCurrency} do you have?`);
  }

  if (flow.step === "haveAmount") {
    const amount = Number(input.replaceAll(",", ""));
    if (!Number.isFinite(amount) || amount <= 0) return bot("Enter a valid amount.");
    flow.data.haveAmount = amount;
    flow.step = "wantAmount";
    return bot(`How much ${flow.data.wantCurrency} do you want?`);
  }

  if (flow.step === "wantAmount") {
    const amount = Number(input.replaceAll(",", ""));
    if (!Number.isFinite(amount) || amount <= 0) return bot("Enter a valid amount.");
    flow.data.wantAmount = amount;
    flow.step = "listingType";
    return bot("Is this fixed or negotiable? Type fixed or negotiable.");
  }

  if (flow.step === "listingType") {
    if (!["fixed", "negotiable"].includes(input.toLowerCase())) {
      return bot("Type fixed or negotiable.");
    }

    flow.data.type = input.toLowerCase();
    const rate = flow.data.wantAmount / flow.data.haveAmount;
    flow.step = "confirm";
    return bot(
      [
        "Review your listing:",
        `You give: ${money(flow.data.haveAmount, flow.data.haveCurrency)}`,
        `You want: ${money(flow.data.wantAmount, flow.data.wantCurrency)}`,
        `Rate: 1 ${flow.data.haveCurrency} = ${rate.toFixed(4)} ${flow.data.wantCurrency}`,
        `Type: ${flow.data.type}`,
        `Success fee if completed: 100 ${flow.data.haveCurrency}`,
        "Type publish, edit, or cancel.",
      ].join("\n")
    );
  }

  if (flow.step === "confirm") {
    const action = input.toLowerCase();
    if (action === "cancel") {
      flow = null;
      return bot("Listing cancelled.");
    }

    if (action === "edit") {
      flow.step = "haveCurrency";
      flow.data = {};
      return bot("No problem. What currency do you have? Type NGN or RWF.");
    }

    if (action !== "publish") return bot("Type publish, edit, or cancel.");

    const id = `AK-${1000 + state.listings.length + 1}`;
    state.listings.push({
      id,
      owner: state.user.id,
      ...flow.data,
      status: "active",
      completedDeals: state.user.completedDeals,
    });
    flow = null;
    return bot(`Listing ${id} is now active. Other verified users can reserve it.`);
  }
}

function startFindOffer() {
  if (!checkHold()) return;

  flow = {
    name: "findOffer",
    step: "haveCurrency",
    data: {},
  };

  bot("What currency do you have? Type NGN or RWF.");
}

function handleFindOffer(input) {
  const value = input.trim().toUpperCase();

  if (flow.step === "haveCurrency") {
    if (!["NGN", "RWF"].includes(value)) return bot("Type NGN or RWF.");
    flow.data.haveCurrency = value;
    flow.step = "wantCurrency";
    return bot("What currency do you need? Type NGN or RWF.");
  }

  if (flow.step === "wantCurrency") {
    if (!["NGN", "RWF"].includes(value)) return bot("Type NGN or RWF.");
    if (value === flow.data.haveCurrency) return bot("Choose a different currency.");
    flow.data.wantCurrency = value;
    flow.step = "amount";
    return bot(`How much ${flow.data.haveCurrency} do you want to exchange?`);
  }

  if (flow.step === "amount") {
    const amount = Number(input.replaceAll(",", ""));
    if (!Number.isFinite(amount) || amount <= 0) return bot("Enter a valid amount.");
    flow.data.amount = amount;

    const results = state.listings.filter((listing) => {
      return (
        listing.status === "active" &&
        listing.haveCurrency === flow.data.wantCurrency &&
        listing.wantCurrency === flow.data.haveCurrency
      );
    });

    flow.name = "searchResults";
    flow.step = "select";
    flow.results = results;

    if (results.length === 0) {
      flow = null;
      return bot("No offers found yet. Try creating a negotiable listing.");
    }

    return bot(
      [
        `I found ${results.length} offer(s):`,
        ...results.map((listing, index) => {
          return `${index + 1}. ${listing.id}: ${money(listing.haveAmount, listing.haveCurrency)} for ${money(
            listing.wantAmount,
            listing.wantCurrency
          )}. ${listing.completedDeals} completed deals.`;
        }),
        "Type the offer number to reserve it, or type cancel.",
      ].join("\n")
    );
  }
}

function handleSearchResults(input) {
  if (input.toLowerCase() === "cancel") {
    flow = null;
    return bot("Search closed.");
  }

  if (!requireVerified("reserve an offer")) return;

  const index = Number(input) - 1;
  const listing = flow.results[index];
  if (!listing) return bot("Choose a valid offer number.");

  listing.status = "reserved";
  const deal = {
    id: `DL-${1000 + state.deals.length + 1}`,
    listingId: listing.id,
    status: "reserved",
    buyerSent: false,
    sellerSent: false,
    buyerReceived: false,
    sellerReceived: false,
    feePaid: false,
  };
  state.deals.push(deal);
  flow = {
    name: "dealRoom",
    dealId: deal.id,
  };

  bot(
    [
      `Deal ${deal.id} is reserved for 15 minutes.`,
      "Payment details would now be shown to both verified parties.",
      "Type sent, received, fee paid, dispute, cancel deal, or close.",
    ].join("\n")
  );
}

function handleDealRoom(input) {
  const deal = state.deals.find((item) => item.id === flow.dealId);
  const action = input.toLowerCase();

  if (action === "sent") {
    deal.buyerSent = true;
    return bot("Marked as sent. Ask the other party to confirm receipt.");
  }

  if (action === "received") {
    deal.sellerReceived = true;
    deal.status = "completed_pending_fee";
    return bot("Deal marked completed. Success fee due: 100 RWF or 100 NGN depending on your side. Type fee paid.");
  }

  if (action === "fee paid") {
    deal.feePaid = true;
    deal.status = "closed";
    state.user.completedDeals += 1;
    flow = null;
    return bot("Fee marked paid. Deal closed and reputation updated.");
  }

  if (action === "dispute") {
    deal.status = "disputed";
    flow = null;
    return bot("Dispute opened. Admin review is needed.");
  }

  if (action === "cancel deal") {
    deal.status = "cancelled";
    state.user.cancellationsToday += 1;
    applyCancellationPenalty();
    flow = null;
    return bot("Deal cancelled. Your cancellation history has been updated.");
  }

  if (action === "close") {
    flow = null;
    return menu();
  }

  bot("Type sent, received, fee paid, dispute, cancel deal, or close.");
}

function applyCancellationPenalty() {
  const count = state.user.cancellationsToday;
  if (count === 3) state.user.holdUntil = Date.now() + 30 * 60000;
  if (count === 4) state.user.holdUntil = Date.now() + 2 * 60 * 60000;
  if (count >= 5) state.user.holdUntil = Date.now() + 24 * 60 * 60000;
}

function showListings() {
  const rows = state.listings
    .filter((listing) => listing.owner === state.user.id)
    .map((listing) => {
      return `${listing.id}: ${money(listing.haveAmount, listing.haveCurrency)} -> ${money(
        listing.wantAmount,
        listing.wantCurrency
      )}, ${listing.status}`;
    });

  bot(rows.length ? rows.join("\n") : "You have no listings yet.");
}

function showDeals() {
  const rows = state.deals.map((deal) => `${deal.id}: listing ${deal.listingId}, ${deal.status}`);
  bot(rows.length ? rows.join("\n") : "You have no deals yet.");
}

function handleTopLevel(input) {
  const command = input.toLowerCase();

  if (command === "exit") {
    bot("Bye. Akara prototype closed.");
    process.exit(0);
  }

  if (command === "help" || command === "start") return menu();

  if (command === "verify") {
    state.user.verified = true;
    return bot("Prototype verification approved. In production this would use a secure upload link and admin review.");
  }

  if (command === "create listing") return startCreateListing();
  if (command === "find offer") return startFindOffer();
  if (command === "my listings") return showListings();
  if (command === "my deals") return showDeals();
  if (command === "cancel penalty") {
    state.user.cancellationsToday += 1;
    applyCancellationPenalty();
    return bot(`Cancellation count today: ${state.user.cancellationsToday}`);
  }

  bot("I did not understand. Type help.");
}

function route(input) {
  if (!flow) return handleTopLevel(input);
  if (flow.name === "createListing") return handleCreateListing(input);
  if (flow.name === "findOffer") return handleFindOffer(input);
  if (flow.name === "searchResults") return handleSearchResults(input);
  if (flow.name === "dealRoom") return handleDealRoom(input);
  bot("Flow lost. Type help.");
  flow = null;
}

menu();
rl.prompt();

rl.on("line", (line) => {
  route(line.trim());
  rl.prompt();
});

