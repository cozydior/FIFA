import fs from "fs";
const p = new URL("../src/app/admin/page.tsx", import.meta.url);
let s = fs.readFileSync(p, "utf8");
s = s.replace(/\s+dark:[^\s"']+/g, "");
fs.writeFileSync(p, s);
