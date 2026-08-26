import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { test } from "node:test";

const ROOT = process.cwd();
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".svg",
  ".ts",
  ".tsx",
]);

interface TextFile {
  path: string;
  source: string;
}

function textFiles(directory: string): TextFile[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) return textFiles(target);
    if (!entry.isFile() || !TEXT_EXTENSIONS.has(extname(entry.name))) return [];
    return [{ path: target, source: readFileSync(target, "utf8") }];
  });
}

const productFiles = [
  ...textFiles(join(ROOT, "src")),
  ...textFiles(join(ROOT, "public")),
];

const packageFiles = ["package.json", "package-lock.json"]
  .map((name) => join(ROOT, name))
  .filter(existsSync)
  .map((path) => ({ path, source: readFileSync(path, "utf8") }));

function violations(files: TextFile[], pattern: RegExp): string[] {
  return files.flatMap((file) =>
    file.source.split(/\r?\n/).flatMap((line, index) => {
      pattern.lastIndex = 0;
      return pattern.test(line)
        ? [`${relative(ROOT, file.path)}:${index + 1}: ${line.trim()}`]
        : [];
    }),
  );
}

function assertAbsent(label: string, files: TextFile[], pattern: RegExp): void {
  const found = violations(files, pattern);
  assert.deepEqual(found, [], `${label}:\n${found.join("\n")}`);
}

test("the interface contains no legacy glass or ambient surface classes", () => {
  assertAbsent(
    "Legacy surface styling remains",
    productFiles,
    /\b(?:glass-[\w-]+|ambient-orb)\b/,
  );
});

test("the interface contains no CSS, Tailwind, or SVG gradients", () => {
  assertAbsent(
    "Gradient styling remains",
    productFiles,
    /(?:\b(?:linear|radial|conic)-gradient\s*\(|\b(?:linear|radial)Gradient\b|\b(?:bg|text|border|fill|stroke|mask)-gradient-[\w-]+)/,
  );
});

test("the interface contains no backdrop filters or blur utilities", () => {
  assertAbsent(
    "Backdrop filtering remains",
    productFiles,
    /(?:\bbackdrop-filter\b|\bbackdropFilter\b|\bbackdrop-blur(?:-[\w./\[\]-]+)?\b)/,
  );
});

test("the interface contains no Lucide imports or dependency metadata", () => {
  assertAbsent("Lucide source imports remain", productFiles, /["']lucide-react["']/);
  assertAbsent("Lucide package metadata remains", packageFiles, /["']lucide-react["']/);
});

test("the interface contains no ClickSpark integration", () => {
  assertAbsent(
    "ClickSpark is still mounted or imported",
    productFiles,
    /(?:from\s+["'][^"']*click-spark["']|<ClickSpark\b)/,
  );
});

test("the Next and Vercel starter SVG assets stay removed", () => {
  const starterAssets = ["file.svg", "globe.svg", "next.svg", "vercel.svg", "window.svg"];
  const present = starterAssets.filter((asset) => existsSync(join(ROOT, "public", asset)));

  assert.deepEqual(present, [], `Starter assets remain in public/: ${present.join(", ")}`);
});
