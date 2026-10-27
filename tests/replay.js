/* 按 App 现行逻辑回放一道题（玩家用求解器走，找不到解时随机走一个合法点）
 * 用法: node tests/replay.js bg7 161
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

const setId = process.argv[2] || "bg7";
const num = Number(process.argv[3] || 161);
const set = SETS.find((s) => s.id === setId);
const buf = Buffer.from(set.data[num - 1], "base64");
const b = new R.Board();
for (let i = 0; i < buf.length; i++) b.place(buf[i] % N, (buf[i] / N) | 0, i % 2 === 0 ? BLACK : WHITE);
b.refreshAll();
b.history = [];
b.lastMove = -1;
const player = buf.length % 2 === 0 ? BLACK : WHITE;
const opp = 3 - player;

console.log(`${set.id.toUpperCase()} #${num}（${buf.length} 子，${player === BLACK ? "黑" : "白"}先）`);

for (let step = 1; step <= 14; step++) {
    const hint = VCF.find(b, player, { depth: set.moves + 3, timeMs: 1500 });
    let mv;
    if (hint.ok) mv = hint.move;
    else {
        // 求解器无解时，按「成四优先」随便找一个合法点（模拟玩家自己找）
        const fours = VCF.fourMoves(b, player);
        if (fours.length) mv = fours[0].move;
        else {
            const cand = b.candidateList().filter((i) => b.cells[i] === 0 &&
                !(player === BLACK && R.forbiddenType(b.cells, i % N, (i / N) | 0, 3) !== 0));
            if (!cand.length) { console.log("无可落点，结束"); break; }
            mv = cand[0];
        }
    }
    b.place(mv % N, (mv / N) | 0, player);
    const res = VCF.replyAfter(b, player);
    console.log(`  第${step}手 ${nm(mv)}` + (hint.ok ? "（求解器推荐）" : "（自行选择）") +
        (res.win ? `  → 判胜：${res.reason}` : `  → 对手应 ${nm(res.reply)}${res.forced ? "（被迫堵）" : "（防守）"}`));
    if (res.win) break;
    if (res.reply < 0) { console.log("  对手无处可下"); break; }
    b.place(res.reply % N, (res.reply / N) | 0, opp);
    if (R.makesFive(b.cells, res.reply % N, (res.reply / N) | 0, opp)) { console.log("  对手连五，失败"); break; }
}
