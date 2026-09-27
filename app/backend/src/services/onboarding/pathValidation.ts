/**
 * Generated-file path validation for onboarding pull requests (spec 007,
 * WP-BE5, fix round 1 item 8).
 *
 * `openPullRequests` writes files the sandbox job (WP-BE6) generated
 * directly into a customer's repository. Before any of those paths reach
 * `pullRequests.ts`, every one of them must pass {@link isAllowedGeneratedPath}
 * — a repository whose manifest contains a path outside the mesh CI's
 * documented roots, or that tries to escape the repository (`..`, an
 * absolute path, a backslash, a NUL byte), gets no PR at all rather than a
 * partially-written one.
 */

// The only roots the mesh CI templates (external/goa-standards-assurance-mesh,
// WP-BE7) are documented to generate into: GitHub Actions workflows under
// `.github/`, and Azure Pipelines definitions either as a top-level
// `azure-pipelines*.yml` file or under an `azure-pipelines/` directory.
const ALLOWED_DIR_PREFIXES = [/^\.github\//, /^azure-pipelines\//];
const ALLOWED_TOP_LEVEL_FILES = [/^azure-pipelines(-[A-Za-z0-9._-]+)?\.ya?ml$/i];

/**
 * True when `path` is safe to write into a customer repository: relative,
 * contained within the repository, free of path-traversal or NUL/backslash
 * characters, and within one of the mesh CI's documented generated roots.
 */
export function isAllowedGeneratedPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0) return false;
  if (path.length > 1024) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\0]/.test(path)) return false;
  if (path.includes("\\")) return false;
  if (path.startsWith("/") || path.startsWith("~")) return false;

  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return false;
  }

  return (
    ALLOWED_DIR_PREFIXES.some((re) => re.test(path)) || ALLOWED_TOP_LEVEL_FILES.some((re) => re.test(path))
  );
}

export interface GeneratedFileLike {
  path: string;
  content: string;
}

/**
 * Validates every file in a manifest. Returns the first disallowed path
 * found (for a clear, logged rejection reason), or `null` when every path
 * is allowed.
 */
export function findDisallowedPath(files: GeneratedFileLike[]): string | null {
  for (const file of files) {
    if (!isAllowedGeneratedPath(file?.path)) {
      return String(file?.path);
    }
  }
  return null;
}
