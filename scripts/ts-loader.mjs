// Test yardımcısı (üretimde kullanılmaz): `server-only` işaretini boş modüle, `@/` takma adını src/ altına çözer; uzantısız src içi
// göreli içe aktarmalara .ts ekler. Böylece node --experimental-strip-types ile src/lib/*.ts (DB'li modüller dahil) doğrudan yüklenebilir.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const isFile = (p) => existsSync(p) && statSync(p).isFile();
const tryExt = (base) => [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find(isFile);

export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const file = tryExt(path.join(SRC, specifier.slice(2)));
    if (file) return next(pathToFileURL(file).href, context);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith(pathToFileURL(SRC).href)) {
    const file = tryExt(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (file) return next(pathToFileURL(file).href, context);
  }
  // Düz Node ESM, paketin uzantısız alt yolunu (next/server) çözmez; Next bunu paketleyicide kendisi çözer.
  if (/^next\/[a-z-]+$/.test(specifier)) return next(`${specifier}.js`, context);
  return next(specifier, context);
}
