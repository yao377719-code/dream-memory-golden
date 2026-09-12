import process from "node:process";
import { loadCustomerConfig } from "./lib/customer-config.mjs";

const index = process.argv.indexOf("--config");
if (index < 0 || !process.argv[index + 1]) throw new Error("--config is required");
const { identity } = await loadCustomerConfig(process.argv[index + 1]);
console.log(JSON.stringify(identity, null, 2));
