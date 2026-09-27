/**
 * Read-only, shallow git clone with an in-memory-only credential (spec 007,
 * WP-BE6, T141).
 *
 * The credential (an `Authorization` header value, e.g. `"Basic <base64>"`)
 * is injected via `GIT_CONFIG_KEY_*`/`GIT_CONFIG_VALUE_*` environment
 * variables (git >= 2.31) rather than a `-c` command-line flag or a URL with
 * the token embedded — so it never appears in the child process's argv
 * (visible to `ps`/`/proc`), never appears in a URL a proxy or access log
 * might capture, and is never written to a git config file on disk. Callers
 * must never log `authorizationHeader` themselves either.
 *
 * `--depth 1` and a single branch: the sandbox only ever reads the default
 * branch's current tree to detect CI provider/stack and generate one file —
 * it never needs history, and it never writes back (no push, ever).
 */
import { spawn } from "child_process";

export interface CloneInput {
  cloneUrl: string;
  authorizationHeader: string;
  destDir: string;
  /** Defaults to letting git resolve the remote's default branch (HEAD). */
  branch?: string;
}

export function cloneRepositoryShallow(input: CloneInput): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["clone", "--depth", "1", "--single-branch", "--no-tags"];
    if (input.branch) args.push("--branch", input.branch);
    args.push(input.cloneUrl, input.destDir);

    const child = spawn("git", args, {
      env: {
        // PATH/HOME etc. only — never forward the parent's full env
        // wholesale into a process that talks to a third party.
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        GIT_TERMINAL_PROMPT: "0",
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "http.extraHeader",
        GIT_CONFIG_VALUE_0: `Authorization: ${input.authorizationHeader}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      // Scrub defense in depth: git itself never echoes the header value to
      // stderr under normal operation (no -v/GIT_CURL_VERBOSE here), but
      // strip it anyway in case a future flag changes that.
      const scrubbed = stderr.split(input.authorizationHeader).join("[redacted]");
      reject(new Error(`git clone failed (exit ${code}): ${scrubbed.slice(0, 500)}`));
    });
  });
}
