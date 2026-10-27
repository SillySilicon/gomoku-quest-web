/* 挑战模式判定逻辑测试（VCF.replyAfter 与完整解题回放） */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const R = require("../web/js/engine.js");
const VCF = require("../web/js/vcf.js");

let pass = 0;
let fail = 0;
function eq(name, a, b) {
    const ok = JSON.stringify(a) === JSON.stringify(b);
    if (ok) pass++;
    else {
        fail++;
        console.log(`  ✗ ${name}: 期望 ${JSON.stringify(b)} 实际 ${JSON.stringify(a)}`);
    }
}
function ok(name, cond, extra) {
    if (cond) pass++;
    else {
        fail++;
        console.log(`  ✗ ${name} ${extra || ""}`);
    }
}

const N15 = 15;
const BLACK = 1;
const WHITE = 2;

function mk(stones) {
    const b = new R.Board();
    stones.forEach(([x, y, c]) => b.place(x, y, c));
    b.refreshAll();
    b.history = [];
    b.lastMove = -1;
    return b;
}

console.log("\n[1] 五连判胜");
{
    const b = mk([[3, 7, BLACK], [4, 7, BLACK], [5, 7, BLACK], [6, 7, BLACK]]);
    b.place(7, 7, BLACK);
    const res = VCF.replyAfter(b, BLACK);
    ok("连五判胜", res.win === true && res.reason === "five", JSON.stringify(res));
    b.undo();
}

console.log("\n[2] 双四/活四判胜");
{
    // 黑在 7 行形成 BBBB，两端皆空 → 落子后有两个成五点
    const b = mk([[5, 7, BLACK], [6, 7, BLACK], [8, 7, BLACK]]);
    b.place(7, 7, BLACK);
    const res = VCF.replyAfter(b, BLACK);
    ok("活四判胜", res.win === true && res.reason === "double", JSON.stringify(res));
    b.undo();
}

console.log("\n[3] 单四：对手被迫堵唯一点");
{
    const b = mk([[4, 7, WHITE], [5, 7, BLACK], [6, 7, BLACK], [7, 7, BLACK]]);
    b.place(8, 7, BLACK); // 5-8 成四，4 被白堵，成五点在 9
    const res = VCF.replyAfter(b, BLACK);
    ok("给出堵点", res.win !== true && res.reply === 9 * 1 + 7 * N15, JSON.stringify(res));
    ok("标记为被迫", res.forced === true);
    b.undo();
}

console.log("\n[4] 非四着法不再被拒绝（关键修复）");
{
    const b = mk([[5, 7, BLACK], [6, 7, BLACK], [4, 8, WHITE]]);
    b.place(10, 10, BLACK); // 完全不成四
    const res = VCF.replyAfter(b, BLACK);
    ok("不判胜", !res.win);
    ok("对手有应手", typeof res.reply === "number" && res.reply >= 0, JSON.stringify(res));
    ok("应手不是被迫", res.forced === false);
    b.undo();
}

console.log("\n[5] 防守应手不会落在禁手点");
{
    // 玩家执白，防守方是黑棋：应手必须避开黑棋的禁手点
    const b = mk([[5, 7, WHITE], [6, 7, WHITE], [7, 5, WHITE], [7, 6, WHITE]]);
    const p = VCF.chooseDefense(b, WHITE);
    ok("选到合法点", p >= 0, "p=" + p);
    ok(
        "防守方(黑)该点非禁手",
        p >= 0 && R.forbiddenType(b.cells, p % N15, (p / N15) | 0, 3) === 0,
        "点=" + (p >= 0 ? "ABCDEFGHIJKLMNO"[p % N15] + (((p / N15) | 0) + 1) : "-")
    );
}

console.log("\n[6] 用真实题库做完整解题回放");
{
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../web/js/problems.js"), "utf8"), sandbox);
    const SETS = sandbox.window.PROBLEM_SETS;
    const set = SETS.find((s) => s.id === "bg3");

    function playOut(num, maxSteps) {
        const buf = Buffer.from(set.data[num - 1], "base64");
        const b = new R.Board();
        for (let i = 0; i < buf.length; i++) b.place(buf[i] % N15, (buf[i] / N15) | 0, i % 2 === 0 ? BLACK : WHITE);
        b.refreshAll();
        b.history = [];
        b.lastMove = -1;
        let player = buf.length % 2 === 0 ? BLACK : WHITE;
        const opp = 3 - player;
        const steps = [];
        for (let s = 0; s < maxSteps; s++) {
            const hint = VCF.find(b, player, { depth: 8, timeMs: 1200 });
            if (!hint.ok) return { solved: false, reason: "求解器无着", steps, stones: b.count };
            const mx = hint.move % N15, my = (hint.move / N15) | 0;
            b.place(mx, my, player);
            steps.push("ABCDEFGHIJKLMNO"[mx] + (my + 1));
            const res = VCF.replyAfter(b, player);
            if (res.win) return { solved: true, reason: res.reason, steps, stones: b.count };
            if (res.reply == null || res.reply < 0) return { solved: false, reason: "无应手", steps, stones: b.count };
            b.place(res.reply % N15, (res.reply / N15) | 0, opp);
            if (R.makesFive(b.cells, res.reply % N15, (res.reply / N15) | 0, opp)) {
                return { solved: false, reason: "对手连五", steps, stones: b.count };
            }
            player = player; // 玩家继续
        }
        return { solved: false, reason: "步数超限", steps, stones: b.count };
    }

    let solved = 0;
    const reasons = {};
    const N = 12;
    for (let n = 1; n <= N; n++) {
        const r = playOut(n, 12);
        if (r.solved) solved++;
        else reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    }
    ok(`前 ${N} 题回放，解出 ${solved} 题`, solved >= N - 3, JSON.stringify(reasons));
}

console.log("\n[7] 落子后状态不被污染");
{
    const b = mk([[5, 7, BLACK], [6, 7, BLACK], [4, 8, WHITE]]);
    const before = Array.from(b.cells).join(",");
    for (let k = 0; k < 20; k++) {
        VCF.find(b, BLACK, { depth: 4, timeMs: 200 });
    }
    ok("求解器不改变棋盘", Array.from(b.cells).join(",") === before);
}

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
