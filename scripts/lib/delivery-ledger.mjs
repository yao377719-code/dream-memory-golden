import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const FIELD_NAMES = ["customerNumber", "frontUrl", "adminUrl", "password", "customerId", "projectName", "templateVersion", "status"];

export function privateDeliveryDirectory(repositoryRoot, requested = "") {
  const base = requested || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"), "Dream-Memory-Golden-Delivery");
  const resolved = path.resolve(base);
  const repository = path.resolve(repositoryRoot);
  const relative = path.relative(repository, resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error("Private delivery directory must be outside the Git repository");
  }
  return resolved;
}

export function validateDeliveryRecord(record) {
  for (const key of FIELD_NAMES) if (typeof record?.[key] !== "string" || !record[key]) throw new Error(`Delivery record is missing ${key}`);
  if (!/^\d{6}$/.test(record.password)) throw new Error("Customer password must be six digits");
  if (!new Set(["待验收", "待售", "已售"]).has(record.status)) throw new Error("Invalid delivery status");
  if (record.frontUrl !== `https://${record.projectName}.pages.dev/` || record.adminUrl !== `${record.frontUrl}admin/`) {
    throw new Error("Delivery URLs do not match Pages project");
  }
  return record;
}

export async function readDeliveryRecords(directory) {
  let content;
  try { content = await readFile(path.join(directory, "delivery-ledger.jsonl"), "utf8"); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const byProject = new Map();
  for (const line of content.split(/\r?\n/).filter(Boolean)) {
    const record = validateDeliveryRecord(JSON.parse(line));
    const previous = byProject.get(record.projectName);
    if (previous && (previous.customerNumber !== record.customerNumber || previous.password !== record.password || previous.customerId !== record.customerId)) {
      throw new Error("Append-only ledger contains conflicting customer identity or password");
    }
    byProject.set(record.projectName, record);
  }
  return [...byProject.values()];
}

export async function appendDeliveryRecord(directory, record) {
  validateDeliveryRecord(record);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const existing = await readDeliveryRecords(directory);
  if (existing.some((item) => item.customerNumber === record.customerNumber && item.projectName !== record.projectName)) throw new Error("Customer number already belongs to another project");
  const prior = existing.find((item) => item.projectName === record.projectName);
  if (prior && (prior.password !== record.password || prior.customerId !== record.customerId || prior.customerNumber !== record.customerNumber)) {
    throw new Error("Cannot overwrite an existing customer's credentials or identity");
  }
  if (prior?.status === "已售" && record.status !== "已售") throw new Error("Sold records cannot revert to unsold");
  await appendFile(path.join(directory, "delivery-ledger.jsonl"), `${JSON.stringify(record)}\n`, { mode: 0o600, flag: "a" });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

export async function createPrivateCompletionPage(directory, records) {
  const rows = records.map((record) => `<tr>${FIELD_NAMES.map((key) => `<td>${escapeHtml(record[key])}</td>`).join("")}</tr>`).join("\n");
  const labels = ["客户编号", "前台固定网址", "后台固定网址", "六位后台密码", "CUSTOMER_ID", "Pages 项目名", "模板版本", "状态"];
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>私密客户交付清单</title><style>body{font:15px system-ui,sans-serif;margin:24px;color:#202124}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;text-align:left;word-break:break-all}th{background:#f4f4f4}aside{color:#9b1c1c}</style><h1>私密客户交付清单</h1><aside>仅在本机私密目录打开。不要截图、上传或转发整份清单；只向对应客户单独交付其密码。</aside><table><thead><tr>${labels.map((label) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></html>`;
  const target = path.join(directory, `completion-${Date.now()}.html`);
  await writeFile(target, html, { flag: "wx", mode: 0o600 });
  return target;
}
