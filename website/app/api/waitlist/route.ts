import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[1-9]\d{6,14}$/;
const CONSENT_VERSION = "waitlist-2026-07";

function normalizePhone(value: string) {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return `${hasPlus ? "+" : ""}${digits}`;
}

function json(message: string, status: number, extra = {}) {
  return NextResponse.json({ message, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json("Send a valid email address or phone number.", 400);
  }

  if (String(body.website || "").trim()) {
    return json("You are on the list.", 200);
  }

  const email = String(body.email || "").trim().toLowerCase() || null;
  const phoneInput = String(body.phone || "").trim();
  const phone = phoneInput ? normalizePhone(phoneInput) : null;
  const source = String(body.source || "website").trim().slice(0, 80);
  const consent = body.consent === true;

  if (!email && !phone) {
    return json("Add an email address, a phone number, or both.", 400);
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    return json("Enter a valid email address.", 400);
  }

  if (phone && !PHONE_PATTERN.test(phone)) {
    return json(
      "Enter a valid phone number with its country code, for example +250 700 000 000.",
      400,
    );
  }

  if (!consent) {
    return json("Please agree to receive Akara launch updates.", 400);
  }

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[waitlist] Supabase server credentials are not configured");
    return json("The waitlist is temporarily unavailable. Please try again.", 503);
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/waitlist_signups`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({
      email,
      phone,
      source,
      consent_version: CONSENT_VERSION,
      consented_at: new Date().toISOString(),
      metadata: {
        landing_path: request.headers.get("referer") || null,
      },
    }),
    cache: "no-store",
  });

  if (response.ok) {
    return json("You are on the list.", 201);
  }

  const responseText = await response.text();
  if (response.status === 409 || responseText.includes("duplicate key")) {
    return json("You are already on the list.", 200, { alreadyJoined: true });
  }

  console.error(`[waitlist] Supabase ${response.status}: ${responseText}`);
  return json("We could not save your details. Please try again.", 502);
}
