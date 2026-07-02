const { config } = require("../config");

async function supabaseRequest(pathname, options = {}) {
  const url = `${config.supabaseUrl}/rest/v1/${pathname}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: config.supabaseServiceRoleKey,
      authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=representation",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${text}`);
  }

  return body;
}

function filterValue(value) {
  return encodeURIComponent(value);
}

async function uploadSupabaseStorage(bucket, objectPath, buffer, contentType) {
  const url = `${config.supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: config.supabaseServiceRoleKey,
      authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      "content-type": contentType,
      "x-upsert": "true",
    },
    body: buffer,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase storage ${response.status}: ${text}`);
  }

  return objectPath;
}

async function createStorageSignedUrl(bucket, objectPath, expiresIn = 600) {
  const url = `${config.supabaseUrl}/storage/v1/object/sign/${bucket}/${objectPath}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: config.supabaseServiceRoleKey,
      authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ expiresIn }),
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`Supabase signed URL ${response.status}: ${text}`);
  }

  return body.signedURL?.startsWith("http")
    ? body.signedURL
    : `${config.supabaseUrl}/storage/v1${body.signedURL}`;
}

module.exports = {
  supabaseRequest,
  filterValue,
  uploadSupabaseStorage,
  createStorageSignedUrl,
};
