import process from "node:process";
import { appendDeliveryRecord, privateDeliveryDirectory, readDeliveryRecords } from "./lib/delivery-ledger.mjs";

const option = (name) => { const index = process.argv.indexOf(name); return index < 0 ? "" : process.argv[index + 1] || ""; };
const projectName = option("--project");
if (!/^dream-memory-[a-z0-9-]+$/.test(projectName)) throw new Error("--project is required");
const directory = privateDeliveryDirectory(process.cwd(), option("--delivery-dir"));
const record = (await readDeliveryRecords(directory)).find((item) => item.projectName === projectName);
if (!record) throw new Error("Project not found in the private delivery ledger");
if (record.status !== "待售" && !(record.status === "已售" && !record.deliveredAt && process.argv.includes("--delivered"))) throw new Error("Only a ready-for-sale site can be marked sold");
const deliveredAt = process.argv.includes("--delivered") ? new Date().toISOString() : record.deliveredAt;
await appendDeliveryRecord(directory, { ...record, status: "已售", deliveredAt });
console.log(`${projectName} is marked 已售 in the private append-only ledger`);
