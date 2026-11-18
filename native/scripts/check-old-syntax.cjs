// Fails the build if the app's script uses JavaScript too new for older phones' built-in web viewer
// (Android System WebView 69, see minWebViewVersion). Google Play rejected build 147 because of this.
const fs = require("fs"), path = require("path"); const acorn = require(process.argv[2] || "acorn");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "src/app.html"), "utf8");
const code = [...[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]), ...["src/native-pre.js", "src/native-post.js"].map(f => fs.readFileSync(path.join(root, f), "utf8"))];
let bad = 0;
code.forEach((c, i) => { c = c.replace(/await import\(/g, "await IMPORT("); // import() works from WebView 63
  try { acorn.parse(c, { ecmaVersion: 2019, sourceType: "script", allowReturnOutsideFunction: true }) }
  catch (e) { bad++; const L = c.split("\n")[e.loc.line - 1] || ""; console.error(`TOO NEW FOR OLDER PHONES (script ${i}, line ${e.loc.line}): ${L.slice(Math.max(0, e.loc.column - 60), e.loc.column + 30)}`) } });
if (bad) process.exit(1); console.log("app script works on older phones (WebView 69+)");
