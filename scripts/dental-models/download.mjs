import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const token = process.env.SKETCHFAB_API_TOKEN;
if (!token) {
  console.error("Set SKETCHFAB_API_TOKEN to an authorized Sketchfab API token before downloading CC BY source archives.");
  process.exit(1);
}

const manifest = JSON.parse(await readFile(join(root, "public/models/dental/attribution.json"), "utf8"));
const output = join(root, ".cache/dental-models");
await mkdir(output, { recursive: true });

for (const source of manifest.sources) {
  const response = await fetch(`https://api.sketchfab.com/v3/models/${source.uid}/download`, {
    headers: { Authorization: `Token ${token}` },
  });
  if (!response.ok) throw new Error(`Sketchfab refused model ${source.uid} (${response.status}).`);
  const links = await response.json();
  const url = links?.gltf?.url;
  if (typeof url !== "string" || !url.startsWith("https://")) throw new Error(`Model ${source.uid} has no downloadable glTF archive.`);
  const archive = await fetch(url);
  if (!archive.ok) throw new Error(`Could not download model ${source.uid} (${archive.status}).`);
  const contentType = archive.headers.get("content-type") ?? "";
  if (!contentType.includes("zip") && !contentType.includes("octet-stream")) throw new Error(`Unexpected content type for ${source.uid}: ${contentType}`);
  await writeFile(join(output, `${source.fdi}-${source.uid}.zip`), Buffer.from(await archive.arrayBuffer()));
  console.log(`Downloaded FDI ${source.fdi}`);
}

