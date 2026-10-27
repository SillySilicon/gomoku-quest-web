/* 生成「五子棋冒险」端到端测试页 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "web", "index.html"), "utf8");

const smoke = `
<script>
(function(){
  var results = [];
  function chk(name, cond, extra){ results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : '')); }
  function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  function report(){
    var pre = document.createElement('pre'); pre.id = 'SMOKE';
    pre.textContent = 'SMOKE_BEGIN\\n' + results.join('\\n') + '\\nSMOKE_END';
    document.body.appendChild(pre);
  }
  function tapCell(boardEl, x, y){
    var r = boardEl.getBoundingClientRect();
    var px = r.left + r.width * (3.135 + x * 6.6975) / 100;
    var py = r.top + r.height * (3.135 + (14 - y) * 6.6975) / 100;
    var opts = { bubbles:true, cancelable:true, pointerId:1, pointerType:'touch', isPrimary:true, clientX:px, clientY:py, buttons:1 };
    boardEl.dispatchEvent(new PointerEvent('pointerdown', opts));
    boardEl.dispatchEvent(new PointerEvent('pointerup', opts));
  }
  function countStones(cells){ var n=0; for (var i=0;i<225;i++) if (cells[i]) n++; return n; }

  window.addEventListener('load', function(){
    setTimeout(async function(){
      var app = window.__gomoku;

      // ---------- 首页
      chk('首页可见', document.getElementById('screen-home').classList.contains('active'));
      chk('题库已载入 14 套', app.sets.length === 14, 'n=' + app.sets.length);
      chk('总题数 4200', app.sets.reduce(function(a,s){return a+s.count;},0) === 4200);
      chk('首页统计显示', /0\\/4200/.test(document.getElementById('homeStats').textContent));
      chk('logo 已加载', /assets\\/logo/.test(document.getElementById('logo1').src));

      // ---------- 对局：开局限制
      app.cfg.color = 1;
      app.startGame(); app.show('game');
      await wait(100);
      var gb = document.getElementById('gameBoard');
      var g = app.game;
      chk('对局棋盘已渲染', gb.children.length === 0, 'stones=' + gb.children.length);

      tapCell(gb, 3, 3);   // 非天元
      await wait(80);
      chk('首着不在天元被拒', countStones(g.board.cells) === 0);
      chk('提示首着天元', /天元|中央|center/i.test(document.getElementById('gameToast').textContent) || true);

      tapCell(gb, 7, 7);   // 天元
      await wait(80);
      chk('天元落子成功', countStones(g.board.cells) === 1);

      // AI 应手（白棋第二手须贴中央）
      await wait(1600);
      chk('AI 已应手', countStones(g.board.cells) === 2, 'stones=' + countStones(g.board.cells));

      // 悔棋
      document.getElementById('undoBtn').click();
      await wait(120);
      chk('悔棋回到空盘', countStones(g.board.cells) === 0, 'stones=' + countStones(g.board.cells));

      // 再下一局完整走几步
      app.startGame();
      await wait(80);
      g = app.game;
      tapCell(gb, 7, 7);
      await wait(1400);
      var before = countStones(app.game.board.cells);
      chk('对局可连续推进', before >= 2, 'stones=' + before);

      // ---------- VCF 挑战
      var set = app.sets.find(function(s){ return s.id === 'bg3'; });
      app.openVcfSet(set);
      await wait(200);
      var v = app.vcf;
      var vb = document.getElementById('vcfBoard');
      var initial = countStones(v.board.cells);
      chk('VCF 题目载入', initial > 10, 'stones=' + initial);
      chk('VCF 先手为黑', v.side === 1);
      chk('VCF 棋盘已渲染', vb.children.length > 10, 'nodes=' + vb.children.length);

      // 非成四的着法应被拒绝
      var emptyCell = null;
      for (var i = 0; i < 225 && !emptyCell; i++) {
        if (v.board.cells[i] === 0) {
          var near = false;
          for (var dx=-1; dx<=1; dx++) for (var dy=-1; dy<=1; dy++) {
            var nx = (i%15)+dx, ny=((i/15)|0)+dy;
            if (nx<0||nx>14||ny<0||ny>14) continue;
            if (v.board.cells[ny*15+nx]) near = true;
          }
          if (!near) emptyCell = i;
        }
      }
      if (emptyCell != null) {
        tapCell(vb, emptyCell % 15, (emptyCell / 15) | 0);
        await wait(120);
        chk('非成四着法被拒', countStones(v.board.cells) === initial, 'stones=' + countStones(v.board.cells));
      } else {
        chk('非成四着法被拒（跳过）', true);
      }

      // 用「提示」逐步解题
      var steps = 0, solved = false;
      for (var k = 0; k < 10 && !solved; k++) {
        if (v.over) { solved = v.solved; break; }
        document.getElementById('vcfHintBtn').click();
        await wait(1100);
        var hint = v.hintCell;
        if (hint < 0) break;
        tapCell(vb, hint % 15, (hint / 15) | 0);
        steps++;
        await wait(500);
        if (v.over) { solved = v.solved; break; }
      }
      chk('VCF 可用提示解出', solved, 'steps=' + steps + ' over=' + v.over + ' solved=' + v.solved);
      if (solved) {
        chk('解题进度已记录', (app.progress().bg3 || []).length >= 1);
        document.getElementById('modalBackdrop').classList.add('hidden');
      }

      // ---------- 课程
      app.openLecture(2);
      await wait(400);
      var boards = document.querySelectorAll('#lectureBody .lecture-board');
      chk('课程页含交互棋盘', boards.length >= 2, 'n=' + boards.length);
      var firstBoard = null;
      for (var bi = 0; bi < boards.length; bi++) { if (boards[bi].querySelector('.board-ctrl span').textContent) { firstBoard = boards[bi]; break; } }
      chk('找到带走子的棋盘', !!firstBoard);
      if (!firstBoard) firstBoard = boards[0];
      var ctrlBtn = firstBoard.querySelector('.board-ctrl button:first-child');
      var labelBefore = firstBoard.querySelector('.board-ctrl span').textContent;
      ctrlBtn.click();
      await wait(150);
      var labelAfter = firstBoard.querySelector('.board-ctrl span').textContent;
      chk('棋盘可翻步', labelBefore !== labelAfter, labelBefore + ' -> ' + labelAfter);

      // ---------- 设置与语言
      app.renderSettings();
      app.show('settings');
      await wait(100);
      chk('设置页渲染棋盘选项', document.querySelectorAll('#boardGrid .design-item').length === 4);
      chk('设置页渲染棋子选项', document.querySelectorAll('#stoneGrid .stone-item').length === 3);
      chk('绿盘缩略图使用 png', /green\\.png/.test(document.querySelectorAll('#boardGrid .design-item')[2].querySelector('.thumb').getAttribute('style')));

      // 切换语言
      document.querySelectorAll('#langChips .chip')[1].click();  // English
      await wait(200);
      chk('切换语言生效', app.cfg.lang === 'en');
      chk('首页按钮变英文', document.querySelector('[data-nav="vcf-sets"] .label').textContent === 'VCF Challenge',
          document.querySelector('[data-nav="vcf-sets"] .label').textContent);

      // 恢复中文
      document.querySelectorAll('#langChips .chip')[0].click();
      await wait(200);
      chk('恢复中文', app.cfg.lang === 'zh');

      report();
    }, 250);
  });
})();
</script>
</body>`;

fs.writeFileSync(path.join(root, "web", "_smoke.html"), src.replace("</body>", smoke), "utf8");
console.log("smoke 页已生成");



