#!/usr/bin/env node
/*
 * 从 web/js/problems.js 生成轻量的题库索引 web/js/problems-meta.js
 * （只含 id/group/moves/count，约 1 KB，供首页进度与题库列表使用；
 *   真正的题目数据仍在 problems.js，进入挑战页时才按需加载）
 *   用法: node tools/make_meta.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const srcFile = path.join(root, "web/js/problems.js");
const outFile = path.join(root, "web/js/problems-meta.js");

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(srcFile, "utf8"), sandbox);
const sets = sandbox.window.PROBLEM_SETS;
if (!Array.isArray(sets) || !sets.length) throw new Error("problems.js 里没有 PROBLEM_SETS");

const meta = sets.map((s) => ({
  id: s.id,
  group: s.group,
  moves: s.moves,
  count: s.count,
}));

const banner = "/* VCF 题库索引（由 tools/make_meta.js 生成，勿手改）\n" +
  " * 题目数据在 problems.js，进入挑战页时才加载。\n" +
  " * 共 " + meta.length + " 套 / " + meta.reduce((n, s) => n + s.count, 0) + " 题。\n" +
  " */\n";
fs.writeFileSync(outFile, banner + "window.PROBLEM_SETS_META = " + JSON.stringify(meta) + ";\n", "utf8");

const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
console.log("已生成:", outFile, kb + " KB");
console.log("  题库:", meta.map((m) => m.id + "(" + m.count + ")").join(" "));
