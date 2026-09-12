import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const allowedUploads = new Set(["avatar-placeholder.svg", "cover-placeholder.svg", "memory-placeholder.svg"]);
const forbiddenPaths = ["netlify", "netlify.toml", "public/admin", "functions/api/visit-stats.mjs"];
const forbiddenText = ["江晚吟", "JWY", "YHM", "PUBLIC_ENABLE_VISIT_STATS", "/.netlify/functions/"];
for (const item of forbiddenPaths) {
  try { await stat(path.join(root, item)); throw new Error(`Forbidden legacy path exists: ${item}`); } catch (error) { if (error.code !== "ENOENT") throw error; }
}
const contentFiles = [];
async function walk(directory, output) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full, output);
    else output.push(full);
  }
}
await walk(path.join(root, "src/content"), contentFiles);
if (contentFiles.some((file) => path.basename(file) !== ".gitkeep")) throw new Error("src/content must not contain seeded content");
const uploads = await readdir(path.join(root, "public/uploads"));
if (uploads.length !== allowedUploads.size || uploads.some((name) => !allowedUploads.has(name))) throw new Error("public/uploads must contain only three placeholders");
const scanFiles = [];
for (const directory of ["src", "functions", "cloudflare", "scripts", "tests"]) await walk(path.join(root, directory), scanFiles);
for (const file of scanFiles.filter((name) => /\.(astro|mjs|js|ts|json|md|py|ps1)$/.test(name))) {
  if (path.basename(file) === "audit-golden.mjs") continue;
  const text = await readFile(file, "utf8");
  for (const value of forbiddenText) if (text.includes(value)) throw new Error(`Forbidden source text ${JSON.stringify(value)} in ${path.relative(root, file)}`);
}

const option = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : ""; };
const dist = option("--dist");
if (dist) {
  const customerId = option("--customer-id");
  const project = option("--project");
  const distRoot = path.resolve(dist);
  const distUploads = await readdir(path.join(distRoot, "uploads"));
  if (distUploads.length !== 3 || distUploads.some((name) => !allowedUploads.has(name))) throw new Error("dist contains non-framework uploads");
  const html = await readFile(path.join(distRoot, "admin/index.html"), "utf8");
  if (!html.includes(customerId) || !html.includes(project)) throw new Error("frontend identity metadata does not match build config");
  const htmlFiles = [];
  await walk(distRoot, htmlFiles);
  if (htmlFiles.filter((file) => file.endsWith("index.html")).length !== 3) throw new Error("blank build must contain exactly three pages");
}
console.log("Golden source and artifact audit passed");
