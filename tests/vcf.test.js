/* 用真实题库验证 VCF 求解器 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const R = require("../web/js/engine.js");
const VCF = require("../web/js/vcf.js");

const src = fs.readFileSync(path.join(__dirname, "../web/js/problems.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(src, sandbox);
const SETS = sandbox.window.PROBLEM_SETS;

function decode(b64) {
  const buf = Buffer.from(b64, "base64");
  const stones = [];
  for (let i = 0; i < buf.length; i++) {
    const cell = buf[i];
    stones.push([cell % 15, (cell / 15) | 0]);
  }
  return stones;
}

function buildBoard(stones) {
  const b = new R.Board();
  stones.forEach(([x, y], i) => b.place(x, y, i % 2 === 0 ? 1 : 2));
  b.refreshAll();
  return b;
}

const limitPerSet = parseInt(process.argv[2] || "20", 10);
const only = process.argv[3] || null;
let totalWin = 0;
let totalN = 0;
let totalMs = 0;
let worst = 0;

for (const set of SETS) {
  if (only && set.id !== only) continue;
  let win = 0;
  let ms = 0;
  const n = Math.min(limitPerSet, set.data.length);
  for (let i = 0; i < n; i++) {
    const stones = decode(set.data[i]);
    const board = buildBoard(stones);
    const side = stones.length % 2 === 0 ? 1 : 2;
    const t0 = Date.now();
    const res = VCF.find(board, side, { depth: set.moves + 2, timeMs: 1200 });
    const dt = Date.now() - t0;
    ms += dt;
    if (dt > worst) worst = dt;
    if (res.ok) win++;
    totalN++;
    if (res.ok) totalWin++;
  }
  totalMs += ms;
  console.log(
    `${set.id.padEnd(5)} 难度${String(set.moves).padStart(2)}手  找到胜着 ${win}/${n}  ` +
      `平均 ${(ms / n).toFixed(0)}ms`,
  );
}

console.log(
  `\n合计 ${totalWin}/${totalN} 题解出，平均 ${(totalMs / Math.max(1, totalN)).toFixed(0)}ms/题，最慢 ${worst}ms`,
);

