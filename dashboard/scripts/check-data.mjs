// Fails a production build if sample data would be published. Run automatically before `next build`.
import { existsSync, readdirSync, readFileSync } from "node:fs";

const dir = "public/data";
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
const sample = files.filter((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).is_sample === true);

if (sample.length && process.env.ALLOW_SAMPLE_DATA !== "1") {
  console.error(`Refusing to build: sample data in ${dir}: ${sample.join(", ")}`);
  console.error("Export real data, or set ALLOW_SAMPLE_DATA=1 for a local or CI build.");
  process.exit(1);
}
console.log(`data check: ${files.length} files, ${sample.length} sample`);
