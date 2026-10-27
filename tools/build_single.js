#!/usr/bin/env node
/*
 * 把 gomoku/ 打包成单个 HTML（离线可直接打开）。
 * 资源以 data URI 内联；背景音乐体积过大，单文件版不包含（托管版有）。
 *   用法: node tools/build_single.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const distDir = path.join(root, "单文件版");
fs.mkdirSync(distDir, { recursive: true });

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
};

const INCLUDE_SOUNDS = ["koma2.wav", "correct_low_.mp3", "incorrect.wav", "notice2.wav"];

function read(rel) {
  return fs.readFileSync(path.join(root, "web", rel), "utf8");
}

function dataUri(rel) {
  const buf = fs.readFileSync(path.join(root, "web", rel));
  const ext = path.extname(rel).toLowerCase();
  return "data:" + (MIME[ext] || "application/octet-stream") + ";base64," + buf.toString("base64");
}

// --- 收集需要内联的资源
const assets = {};
function addAsset(rel) {
  if (!fs.existsSync(path.join(root, "web", rel))) {
    console.warn("  跳过（不存在）", rel);
    return;
  }
  assets[rel] = dataUri(rel);
}

["normal.jpg", "sky.jpg", "green.png", "book.png"].forEach((f) => addAsset("assets/boards/" + f));
["classic", "clam", "green"].forEach((style) => {
  ["black", "white"].forEach((color) => {
    addAsset(`assets/stones/${color}_${style}.png`);
    addAsset(`assets/stones/${color}_${style}_last.png`);
  });
});
["zh", "en", "ja", "ko"].forEach((lg) => {
  addAsset(`assets/logo/${lg}_top_title1.png`);
  addAsset(`assets/logo/${lg}_top_title2.png`);
});
addAsset("assets/crown.png");
addAsset("assets/bg/home.jpg");
INCLUDE_SOUNDS.forEach((f) => addAsset("assets/sounds/" + f));

let html = read("index.html");

// --- 内联 CSS / JS
html = html.replace(/<link rel="stylesheet" href="css\/app\.css"\s*\/?>/, () => "<style>\n" + read("css/app.css") + "\n</style>");
html = html.replace(/<script src="js\/([^"]+)"><\/script>/g, (m, file) => {
  const code = read("js/" + file);
  if (/<\/script/i.test(code)) throw new Error("脚本包含 </script>：" + file);
  return "<script>\n" + code + "\n</script>";
});

// --- 内联资源映射（放在 body 开头，先于应用脚本执行）
const assetScript =
  "<script>window.__ASSETS = " + JSON.stringify(assets) + ";</script>\n";
if (html.indexOf("<body>") < 0) throw new Error("找不到 <body>");
html = html.replace("<body>", "<body>\n    " + assetScript);

// --- 单文件版不需要 manifest / 外部图标
const icon = dataUri("icons/icon-192.png");
html = html.replace(/<link rel="manifest"[^>]*>\s*/g, "");
html = html.replace(/<link rel="apple-touch-icon"[^>]*>/, `<link rel="apple-touch-icon" href="${icon}">`);
html = html.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${icon}">`);
html = html.replace(
  "<title>五子棋冒险</title>",
  "<title>五子棋冒险</title>\n    <!-- 单文件离线版：脚本与素材已内联；背景音乐不含在内 -->",
);

const outFile = path.join(distDir, "五子棋冒险.html");
fs.writeFileSync(outFile, html, "utf8");
console.log("已生成:", outFile, (Buffer.byteLength(html, "utf8") / 1024 / 1024).toFixed(2) + " MB");
console.log("  内联资源:", Object.keys(assets).length, "个");
