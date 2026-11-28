import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const statuses = new Set(["待验收", "待售", "已售"]);
const projectPattern = /^dream-memory-[a-z0-9-]+$/;
const fields = [
  ["customerNumber", "站点编号"], ["frontUrl", "前台固定链接"], ["adminUrl", "后台固定链接"],
  ["customerId", "CUSTOMER_ID"], ["projectName", "Pages 项目"], ["kvId", "KV namespace"],
  ["templateVersion", "模板版本"], ["deployedCommit", "实际部署 commit"], ["status", "状态"],
  ["acceptance", "验收结果"], ["deliveredAt", "交付时间"], ["credentialRef", "凭据引用"],
];

export function privateDeliveryDirectory(repositoryRoot, requested = "") {
  const base = requested || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"), "Dream-Memory-Golden-Delivery");
  const resolved = path.resolve(base);
  const relative = path.relative(path.resolve(repositoryRoot), resolved);
  if (!relative || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("Private delivery directory must be outside the repository");
  }
  return resolved;
}

export function validateDeliveryRecord(record) {
  for (const key of ["customerNumber", "frontUrl", "adminUrl", "customerId", "projectName", "templateVersion", "status"]) {
    if (typeof record?.[key] !== "string" || !record[key]) throw new Error("Delivery record is missing " + key);
  }
  if (!projectPattern.test(record.projectName) || !statuses.has(record.status)) throw new Error("Invalid project or status");
  if (record.password !== undefined && !/^\d{6}$/.test(record.password)) throw new Error("Invalid legacy credential");
  if (record.frontUrl !== "https://" + record.projectName + ".pages.dev/" || record.adminUrl !== record.frontUrl + "admin/") {
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
    const { password, ...record } = validateDeliveryRecord(JSON.parse(line));
    const prior = byProject.get(record.projectName);
    checkTransition(prior, record);
    byProject.set(record.projectName, {
      ...prior,
      ...record,
      credentialRef: record.credentialRef || prior?.credentialRef || (password ? "旧台账，由站主单独核对" : ""),
    });
  }
  return [...byProject.values()];
}

function checkTransition(prior, record) {
  for (const key of ["customerNumber", "customerId", "templateVersion", "templateCommit", "kvId", "cloudAccountId"]) {
    if (prior?.[key] && record[key] && prior[key] !== record[key]) throw new Error("Cannot overwrite site identity");
  }
  if (prior?.status === "已售" && record.status !== "已售") throw new Error("Sold records cannot revert to unsold");
}

export async function appendDeliveryRecord(directory, record) {
  validateDeliveryRecord(record);
  if ("password" in record) throw new Error("Persist new credentials separately");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const existing = await readDeliveryRecords(directory);
  if (existing.some((item) => item.customerNumber === record.customerNumber && item.projectName !== record.projectName)) {
    throw new Error("Customer number already belongs to another project");
  }
  checkTransition(existing.find((item) => item.projectName === record.projectName), record);
  await appendFile(path.join(directory, "delivery-ledger.jsonl"), JSON.stringify(record) + "\n", { mode: 0o600 });
}

function credentialFile(directory, projectName) {
  if (!projectPattern.test(projectName)) throw new Error("Invalid credential project");
  return path.join(directory, "credentials", projectName + ".secret");
}

export async function readCredential(directory, projectName) {
  try {
    const value = (await readFile(credentialFile(directory, projectName), "utf8")).trim();
    if (!/^\d{6}$/.test(value)) throw new Error("Invalid saved credential");
    return value;
  } catch (error) { if (error.code === "ENOENT") return ""; throw error; }
}

export async function saveCredential(directory, projectName, password) {
  if (!/^\d{6}$/.test(password)) throw new Error("ADMIN_PASSWORD must be six digits");
  const file = credentialFile(directory, projectName);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, password + "\n", { flag: "wx", mode: 0o600 });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

export async function createPrivateCompletionPage(directory, records) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const rows = records.map((record) => "<tr data-status=\"" + escapeHtml(record.status) + "\">" +
    fields.map(([key]) => {
      const value = escapeHtml(record[key] || "待核");
      const copyable = (key === "frontUrl" || key === "adminUrl") && record[key];
      return copyable ? '<td><a href="' + value + '">' + value + '</a> <button type="button" data-copy="' + value + '">复制</button></td>' :
        "<td>" + value + "</td>";
    }).join("") + "</tr>").join("\n");
  const headings = fields.map(([, label]) => "<th scope=\"col\">" + label + "</th>").join("");
  const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; script-src &#39;unsafe-inline&#39;">' +
    '<title>私密交付台账</title><style>body{font:15px system-ui;margin:24px;color:#202124}table{border-collapse:collapse}th,td{padding:8px;text-align:left;border:1px solid #ccc;overflow-wrap:anywhere}th{background:#f4f4f4}label,input,select{margin:0 8px 8px 0}</style>' +
    '<h1>私密交付台账</h1><label>搜索 <input id="search" type="search" size="36"></label>' +
    '<label>状态 <select id="status"><option value="">全部</option><option>待验收</option><option>待售</option><option>已售</option></select></label>' +
    '<output id="feedback" aria-live="polite"></output><table><thead><tr>' + headings + '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '<script>const search=document.querySelector("#search"),statusSelect=document.querySelector("#status"),feedback=document.querySelector("#feedback");' +
    'function filter(){const terms=search.value.trim().toLowerCase().split(/\\s+/);for(const row of document.querySelectorAll("tbody tr")){row.hidden=(!terms.every(term=>row.textContent.toLowerCase().includes(term)))||(!!statusSelect.value&&row.dataset.status!==statusSelect.value);}}' +
    'search.addEventListener("input",filter);statusSelect.addEventListener("change",filter);' +
    'document.addEventListener("click",async(event)=>{const value=event.target.dataset.copy;if(!value)return;try{await navigator.clipboard.writeText(value);feedback.textContent="已复制链接";}catch{const field=document.createElement("textarea");field.value=value;document.body.append(field);field.select();try{feedback.textContent=document.execCommand("copy")?"已复制链接":"请手动复制链接";}finally{field.remove();}}});</script></html>';
  const target = path.join(directory, "delivery-view-" + Date.now() + ".html");
  await writeFile(target, html, { flag: "wx", mode: 0o600 });
  return target;
}
