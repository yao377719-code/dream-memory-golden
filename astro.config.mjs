import { defineConfig } from "astro/config";
import { readdir } from "node:fs/promises";

const mode = String(process.env.PUBLIC_CUSTOMER_MODE || "").trim();
const customerId = String(process.env.PUBLIC_CUSTOMER_ID || "").trim();
const siteUrl = String(process.env.PUBLIC_SITE_URL || "").trim();
const projectName = String(process.env.PUBLIC_PAGES_PROJECT_NAME || "").trim();

if (!new Set(["blank", "demo"]).has(mode)) {
  throw new Error("PUBLIC_CUSTOMER_MODE must be explicitly set to blank or demo");
}
if (!/^[a-z0-9][a-z0-9_-]{4,63}$/.test(customerId)) {
  throw new Error("PUBLIC_CUSTOMER_ID is required and must be a safe 5-64 character identifier");
}
if (mode === "blank" && customerId === "demo") throw new Error("blank builds cannot use the demo CUSTOMER_ID");
if (mode === "demo" && process.env.ALLOW_DEMO_BUILD !== "true") {
  throw new Error("demo builds require ALLOW_DEMO_BUILD=true");
}
if (!siteUrl) throw new Error("PUBLIC_SITE_URL is required");
if (!/^dream-memory-[a-z0-9-]+$/.test(projectName)) throw new Error("PUBLIC_PAGES_PROJECT_NAME is required");
const parsedSite = new URL(siteUrl);
if (parsedSite.protocol !== "https:" && !new Set(["127.0.0.1", "localhost"]).has(parsedSite.hostname)) {
  throw new Error("PUBLIC_SITE_URL must use HTTPS outside local development");
}
if (parsedSite.hostname.endsWith(".pages.dev") && parsedSite.hostname !== `${projectName}.pages.dev`) {
  throw new Error("PUBLIC_SITE_URL does not match PUBLIC_PAGES_PROJECT_NAME");
}

function assertFrameworkOnlyAssets() {
  return {
    name: "golden-template-asset-audit",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const uploadsDir = new URL("uploads/", dir);
        const entries = await readdir(uploadsDir, { withFileTypes: true });
        const allowed = new Set(["avatar-placeholder.svg", "cover-placeholder.svg", "memory-placeholder.svg"]);
        const unexpected = entries.filter((entry) => entry.isFile() && !allowed.has(entry.name));
        if (unexpected.length) {
          throw new Error(`Golden build contains unexpected uploads: ${unexpected.map((entry) => entry.name).join(", ")}`);
        }
      },
    },
  };
}

export default defineConfig({ site: parsedSite.origin, integrations: [assertFrameworkOnlyAssets()] });
