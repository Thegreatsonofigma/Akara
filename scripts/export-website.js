#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { handleWebsiteRoute, legalPages, notFoundPage } = require("../server/website");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "website-dist");

const routes = [
  "/",
  "/product",
  "/how-it-works",
  "/trust",
  "/currencies",
  "/support",
  "/legal",
  ...legalPages.map((page) => `/legal/${page.slug}`),
  "/404",
];

function fileForRoute(route) {
  if (route === "/") return path.join(outDir, "index.html");
  if (route === "/404") return path.join(outDir, "404.html");
  return path.join(outDir, route.replace(/^\//, ""), "index.html");
}

function createResponse(route) {
  const chunks = [];
  return {
    statusCode: 200,
    headers: {},
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers || {};
    },
    end(chunk = "") {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      const file = fileForRoute(route);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.concat(chunks));
    },
  };
}

async function exportRoute(route) {
  if (route === "/404") {
    const file = fileForRoute(route);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, notFoundPage());
    return;
  }

  const req = { method: "GET", headers: { host: "tryakara.com" } };
  const res = createResponse(route);
  const handled = await handleWebsiteRoute(req, res, new URL(route, "https://tryakara.com"));
  if (!handled) throw new Error(`Website route was not handled: ${route}`);
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  for (const route of routes) await exportRoute(route);

  fs.cpSync(path.join(root, "server", "assets", "site"), path.join(outDir, "site-assets"), { recursive: true });
  fs.cpSync(path.join(root, "server", "assets", "cards"), path.join(outDir, "card-assets"), { recursive: true });
  fs.cpSync(path.join(root, "server", "assets", "fonts"), path.join(outDir, "font-assets"), { recursive: true });

  fs.writeFileSync(
    path.join(outDir, "vercel.json"),
    `${JSON.stringify({
      cleanUrls: true,
      trailingSlash: false,
      headers: [
        {
          source: "/(.*)",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          ],
        },
        {
          source: "/(site-assets|card-assets|font-assets)/(.*)",
          headers: [
            { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          ],
        },
      ],
    }, null, 2)}\n`
  );

  console.log(`Exported ${routes.length} website routes to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
