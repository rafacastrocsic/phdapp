// Copies the canonical user manuals from docs/ into public/help/ so the
// in-app Help section (/help) can fetch and render them as static assets.
// docs/ stays the single source of truth; this runs on every build (see the
// "build" script in package.json) so the served copies never drift.
import { access, copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "help");

// Manuals are required; slide overviews are optional (copied when present).
const REQUIRED = [
  "USER_MANUAL_STUDENT.md",
  "USER_MANUAL_SUPERVISOR.md",
  "USER_MANUAL_PROJECT_RESEARCHER.md",
  "USER_MANUAL_ADMIN.md",
];
const OPTIONAL = [
  "PhDapp_Student_Overview.pptx",
  "PhDapp_Supervisor_Overview.pptx",
  "PhDapp_ProjectResearcher_Overview.pptx",
];

await mkdir(out, { recursive: true });
for (const name of REQUIRED) {
  await copyFile(join(root, "docs", name), join(out, name));
  console.log(`synced help doc → public/help/${name}`);
}
for (const name of OPTIONAL) {
  const src = join(root, "docs", name);
  try {
    await access(src);
  } catch {
    console.log(`skipped (not found) → docs/${name}`);
    continue;
  }
  await copyFile(src, join(out, name));
  console.log(`synced help deck → public/help/${name}`);
}
