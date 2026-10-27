/* 全库普查：每题是否存在 VCF 解；并统计「首着落下后对手应手」是否正常
 * 用法: node tests/sweep.js [每库抽样数，0=全部]
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const R = require("../web/js/engine.js");
const VCF = require("../web/js/vcf.js");

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../web/js/problems.js"), "utf8"), sandbox);
const SETS = sandbox.window.PROBLEM_SETS;
const N = 15, BLACK = 1, WHITE = 2;
const nm = (i) => "ABCDEFGHIJKLMNO"[i % N] + (((i / N) | 0) + 1);

const LIMIT = Number(process.argv[2] || 0); // 0 = 全部

let grandTotal = 0, grandOk = 0;
const unsolvedList = [];

for (const set of SETS) {
    const n = LIMIT ? Math.min(LIMIT, set.count) : set.count;
    let okCount = 0;
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
        const buf = Buffer.from(set.data[i], "base64");
        const b = new R.Board();
        for (let k = 0; k < buf.length; k++) b.place(buf[k] % N, (buf[k] / N) | 0, k % 2 === 0 ? BLACK : WHITE);
        b.refreshAll();
        b.history = [];
        b.lastMove = -1;
        const side = buf.length % 2 === 0 ? BLACK : WHITE;
        const res = VCF.find(b, side, { depth: set.moves + 2, timeMs: 600 });
        if (res.ok) okCount++;
        else unsolvedList.push(`${set.id}#${i + 1}`);
    }
    grandTotal += n;
    grandOk += okCount;
    console.log(
        `${set.id.padEnd(5)} ${String(n).padStart(4)} 题  有解 ${String(okCount).padStart(4)}  ` +
        `无解 ${String(n - okCount).padStart(3)}  成功率 ${Math.round(okCount / n * 100)}%  ${Date.now() - t0}ms`
    );
}

console.log(`\n全库合计: ${grandOk}/${grandTotal} 题可直接 VCF 解出 (${Math.round(grandOk / grandTotal * 100)}%)`);
console.log(`无 VCF 解的题: ${unsolvedList.length} 道`);
if (unsolvedList.length && unsolvedList.length <= 120) {
    console.log("清单:", unsolvedList.join(" "));
} else if (unsolvedList.length) {
    console.log("前 120 道:", unsolvedList.slice(0, 120).join(" "), "…");
}
fs.writeFileSync(path.join(__dirname, "sweep-result.txt"),
    unsolvedList.join("\n"), "utf8");
