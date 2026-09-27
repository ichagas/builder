/** Lists every file path (relative, forward-slash separated) under `dir`, excluding `.git/`. */
import fs from "fs";
import path from "path";

export function listFilesRecursive(dir: string, prefix = ""): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if (entry.name === ".git") return [];
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return listFilesRecursive(path.join(dir, entry.name), rel);
    return [rel];
  });
}
