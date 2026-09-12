import { randomInt } from "node:crypto";
import { pathToFileURL } from "node:url";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const WORDS = Object.freeze([
  "luna",
  "star",
  "mint",
  "nova",
  "pearl",
  "cloud",
  "maple",
  "coral",
  "violet",
  "willow",
  "amber",
  "dawn",
]);

function validateSuffixLength(value) {
  const length = Number(value);
  if (!Number.isInteger(length) || length < 5 || length > 8) {
    throw new Error("随机后缀长度必须是 5～8 位整数");
  }
  return length;
}

function randomSuffix(length) {
  const validatedLength = validateSuffixLength(length);
  while (true) {
    let value = "";
    for (let index = 0; index < validatedLength; index += 1) {
      value += ALPHABET[randomInt(ALPHABET.length)];
    }
    if (/[a-z]/.test(value) && /\d/.test(value)) return value;
  }
}
export function generateCustomerIdentities({ count = 1, suffixLength = 6, reservedNames = [] } = {}) {
  const total = Number(count);
  if (!Number.isInteger(total) || total < 1 || total > 100) {
    throw new Error("生成数量必须是 1～100 的整数");
  }
  const length = validateSuffixLength(suffixLength);
  const reserved = new Set(reservedNames.map((name) => String(name).trim().toLowerCase()).filter(Boolean));
  const identities = [];
  let attempts = 0;
  while (identities.length < total) {
    attempts += 1;
    if (attempts > total * 100) throw new Error("无法生成不重复的客户名称，请扩大随机空间");
    const word = WORDS[randomInt(WORDS.length)];
    const suffix = randomSuffix(length);
    const slug = `${word}-${suffix}`;
    const projectName = `dream-memory-${slug}`;
    const customerId = `customer-${slug}`;
    if (reserved.has(projectName) || reserved.has(customerId)) continue;
    reserved.add(projectName);
    reserved.add(customerId);
    identities.push({
      projectName,
      customerId,
      productionBranch: customerId,
      siteUrl: `https://${projectName}.pages.dev`,
      adminUrl: `https://${projectName}.pages.dev/admin/`,
    });
  }
  return identities;
}

function readOption(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  if (!args[index + 1]) throw new Error(`${name} 缺少参数`);
  return args[index + 1];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    const count = readOption(args, "--count", "1");
    const suffixLength = readOption(args, "--suffix-length", "6");
    const reservedNames = args
      .flatMap((value, index) => value === "--reserved" ? String(args[index + 1] || "").split(",") : [])
      .map((value) => value.trim())
      .filter(Boolean);
    console.log(JSON.stringify(generateCustomerIdentities({ count, suffixLength, reservedNames }), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

// Keep this module importable for naming tests and executable as a CLI.
