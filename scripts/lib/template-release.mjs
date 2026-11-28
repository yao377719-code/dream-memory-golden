import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const goldenOrigin = /^(?:https:\/\/github\.com\/|git@github\.com:)yao377719-code\/dream-memory-golden(?:\.git)?$/i;
const versionPattern = /^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/;
const commitPattern = /^[0-9a-f]{40}$/;
export const releaseChecks = ["node", "astro", "blank", "artifact", "desktop", "mobile", "identity", "isolation", "saveReload", "albumBatchRetry", "audio", "badBuildBlocked"];

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    input: options.input,
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${options.step ?? command} failed (exit ${result.status})`);
  return result.stdout.trim();
}

export function verifyReleaseEvidence(evidence, tag, commit) {
  const tests = evidence?.checks;
  if (evidence?.tag !== tag || evidence?.commit !== commit || evidence?.approved !== true ||
      !Number.isFinite(Date.parse(evidence?.acceptedAt)) ||
      !releaseChecks.every((check) => tests?.[check]?.passed === true && typeof tests[check].reference === "string" && tests[check].reference.trim())) {
    throw new Error("An approved acceptance record for this exact tag and commit is required");
  }
}

export async function selectTemplate({ cwd, tag, approval }) {
  if (!versionPattern.test(tag) || !approval) throw new Error("--template-version and --approval are required");
  const git = (args) => run("git", args, { cwd });
  if (git(["status", "--porcelain"])) throw new Error("Start from a clean Golden worktree");
  const origin = git(["remote", "get-url", "origin"]);
  if (!goldenOrigin.test(origin)) throw new Error("Unexpected Golden origin");
  const ref = `refs/tags/${tag}`;
  const remote = new Map(git(["ls-remote", "origin", ref, `${ref}^{}`]).split(/\r?\n/).filter(Boolean)
    .map((line) => line.split(/\s+/).reverse()));
  const commit = remote.get(`${ref}^{}`) ?? remote.get(ref);
  if (!commitPattern.test(commit ?? "")) throw new Error("The tag must already exist on Golden origin");
  verifyReleaseEvidence(JSON.parse(await readFile(approval, "utf8")), tag, commit);
  return { origin, tag, commit };
}

export function verifyTemplateCheckout(cwd, { tag, commit }) {
  const git = (args) => run("git", args, { cwd });
  if (git(["status", "--porcelain"]) || git(["rev-parse", "HEAD"]) !== commit ||
      git(["rev-parse", `refs/tags/${tag}^{commit}`]) !== commit) {
    throw new Error("Provisioning checkout differs from the approved tag or has local changes");
  }
}
