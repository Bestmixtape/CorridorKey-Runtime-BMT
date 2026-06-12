import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const guiRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(guiRoot, "..", "..");

const comparisonSurface = readFileSync(
  path.join(guiRoot, "src", "components", "workflow", "ComparisonSurface.tsx"),
  "utf8"
);
const stylesheet = readFileSync(path.join(guiRoot, "src", "index.css"), "utf8");
const design = readFileSync(path.join(repoRoot, "DESIGN.md"), "utf8");

assert.match(comparisonSurface, /\bck-wipe-handle\b/, "comparison handle should use a named utility");
assert.doesNotMatch(comparisonSurface, /\brounded-full\b/, "comparison handle should not use pill radius");
assert.doesNotMatch(comparisonSurface, /shadow-\[/, "comparison handle should not use arbitrary shadows");
assert.match(stylesheet, /\.ck-wipe-handle\b/, "comparison handle utility should be defined in CSS");
assert.match(design, /`ck-wipe-handle`/, "comparison handle utility should be documented in DESIGN.md");

console.log("[design] contracts");
