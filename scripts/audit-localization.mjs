import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(filename);
    else if (filename.endsWith(".tsx")) files.push(filename);
  }
}
walk(path.join(root, "src/components"));
walk(path.join(root, "src/routes"));
const candidates = [];
for (const filename of files) {
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    let text;
    let kind;
    if (ts.isJsxText(node)) { text = node.text.trim(); kind = "visible-text"; }
    if (ts.isJsxAttribute(node) && ["title", "subtitle", "placeholder", "aria-label", "alt", "label"].includes(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) {
      text = node.initializer.text; kind = "attribute";
    }
    if (text && /[A-Za-z]{2}/.test(text)) candidates.push({ file: path.relative(root, filename).replaceAll("\\", "/"), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, kind, text });
    ts.forEachChild(node, visit);
  }
  visit(source);
}
function flatten(value, prefix = "", result = {}) {
  for (const [key, entry] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof entry === "string") result[name] = entry;
    else flatten(entry, name, result);
  }
  return result;
}
const localeDirectory = path.join(root, "src/i18n/locales");
const english = flatten(JSON.parse(fs.readFileSync(path.join(localeDirectory, "en.json"), "utf8")));
const languages = fs.readdirSync(localeDirectory).filter((filename) => filename.endsWith(".json")).map((filename) => {
  const entries = flatten(JSON.parse(fs.readFileSync(path.join(localeDirectory, filename), "utf8")));
  const missing = Object.keys(english).filter((key) => !entries[key]);
  const sameAsEnglish = Object.keys(english).filter((key) => entries[key] === english[key]);
  return { language: filename.slice(0, -5), sourceKeys: Object.keys(english).length, present: Object.keys(english).length - missing.length, missing, sameAsEnglish, visuallyVerified: false, languageReviewed: false };
});
fs.mkdirSync(path.join(root, "docs"), { recursive: true });
fs.writeFileSync(path.join(root, "docs/localization-audit.json"), JSON.stringify({ notice: "Candidates require human review. Dynamic strings, toasts, option arrays and server messages require additional inspection. Dictionary coverage does not establish screen completion. No screen or language is certified by this report.", candidates, languages }, null, 2) + "\n");
console.log(`${files.length} components/routes inspected; ${candidates.length} static English candidates; ${languages.length} locale dictionaries. Report: docs/localization-audit.json`);
