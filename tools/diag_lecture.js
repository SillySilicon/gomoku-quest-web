/* 课程棋盘解析诊断 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "web", "index.html"), "utf8");

const diag = `
<script>
var ERRORS = []; window.addEventListener('error', function(e){ ERRORS.push(e.message + ' @' + (e.filename||'') + ':' + e.lineno); });
window.addEventListener('load', function(){
  setTimeout(function(){
    var app = window.__gomoku;
    var out = [];
    out.push('errors=' + ERRORS.length);
    ERRORS.forEach(function(x){ out.push('  ERR ' + x); });
    out.push('lang=' + app.cfg.lang);
    out.push('lectures keys=' + Object.keys(window.LECTURES).join(','));
    var lessons = window.LECTURES[app.cfg.lang] || [];
    out.push('lessons=' + lessons.length);
    var html3 = lessons[2] || '';
    out.push('lesson3 len=' + html3.length);
    out.push('lesson3 boards=' + (html3.match(/<board/g) || []).length);
    var m = html3.match(/<board[^>]*moves="[^"]*"/);
    out.push('sample attr: ' + (m ? m[0].slice(0, 120) : 'NONE'));

    app.openLecture(2);
    setTimeout(function(){
      var boards = document.querySelectorAll('#lectureBody .lecture-board');
      out.push('rendered boards=' + boards.length);
      boards.forEach(function(b, i){
        var span = b.querySelector('.board-ctrl span');
        var stones = b.querySelectorAll('.stone').length;
        out.push('  board' + i + ' label="' + (span ? span.textContent : '?') + '" stones=' + stones);
      });
      out.push('errors-after=' + ERRORS.length);
      ERRORS.forEach(function(x){ out.push('  ERR2 ' + x); });
      var pre = document.createElement('pre');
      pre.id = 'DIAG';
      pre.textContent = 'DIAG_BEGIN\\n' + out.join('\\n') + '\\nDIAG_END';
      document.body.appendChild(pre);
    }, 500);
  }, 300);
});
</script>
</body>`;

fs.writeFileSync(path.join(root, "web", "_diag.html"), src.replace("</body>", diag), "utf8");
console.log("诊断页已生成");

