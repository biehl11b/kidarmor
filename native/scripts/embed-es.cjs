// Puts the Spanish word list (src/i18n-es.json) into the app. Run after editing the list:  node scripts/embed-es.cjs
const fs = require("fs"), path = require("path");
const src = path.join(__dirname, "../src/app.html"), dict = JSON.parse(fs.readFileSync(path.join(__dirname, "../src/i18n-es.json"), "utf8"));
let s = fs.readFileSync(src, "utf8");
const re = /\/\*ES_DICT_START\*\/[\s\S]*?\/\*ES_DICT_END\*\//;
if (!re.test(s)) { console.error("ES_DICT markers not found"); process.exit(1) }
s = s.replace(re, () => "/*ES_DICT_START*/" + JSON.stringify(dict).replace(/<\//g, "<\\/") + "/*ES_DICT_END*/");
fs.writeFileSync(src, s); console.log("Spanish phrases in the app:", Object.keys(dict).length);
