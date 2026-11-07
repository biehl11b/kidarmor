// Shrinks the page's scripts and styles for the public copy (harder to lift and reuse).
const fs=require("fs"),esbuild=(()=>{try{return require("esbuild")}catch(e){return require("/opt/npm-tools/node_modules/esbuild")}})();
let s=fs.readFileSync(process.argv[2],"utf8");
s=s.replace(/<script>([\s\S]*?)<\/script>/g,(m,js)=>"<script>"+esbuild.transformSync(js,{minify:true,loader:"js",target:"es2020",legalComments:"none",banner:"/* KidArmor (c) 2026 Coastline Code LLC. All rights reserved. Not licensed for copying or reuse. */"}).code.trim()+"</script>");
s=s.replace(/<style>([\s\S]*?)<\/style>/g,(m,css)=>"<style>"+esbuild.transformSync(css,{minify:true,loader:"css"}).code.trim()+"</style>");
s=s.replace(/<!--[\s\S]*?-->/g,"");
fs.writeFileSync(process.argv[3],s);
