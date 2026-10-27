/*
 * VCF（连续冲四）求解器 —— 用于「VCF 挑战」的判定、提示与 AI 应对。
 *
 * VCF = Victory by Continuous Fours：攻方每一步都做成「四」，
 * 对方只能被动堵唯一的成五点，最终形成双四/活四或五连取胜。
 *
 * 同时支持「禁手胜」：当攻方为白棋时，若黑棋唯一能堵的点是禁手点，
 * 则黑棋无法防守，白棋获胜。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./engine.js"));
  } else {
    root.RenjuVCF = factory(root.Renju);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (R) {
  "use strict";

  var N = 15;
  var BLACK = 1;
  var WHITE = 2;

  // 生成「能形成四（或直接成五）」的候选着点，并按威胁数量排序
  function fourMoves(board, color) {
    var cells = board.cells;
    var cand = board.candidateList();
    var out = [];
    for (var k = 0; k < cand.length; k++) {
      var i = cand[k];
      var x = i % N;
      var y = (i / N) | 0;
      if (cells[i] !== 0) continue;
      if (color === BLACK && R.forbiddenType(cells, x, y, 2) !== 0) continue;
      board.place(x, y, color);
      var five = R.makesFive(cells, x, y, color);
      var threats = board.fivePoints(color).length;
      board.undo();
      if (five) {
        out.push({ move: i, win: true, threats: 99 });
      } else if (threats >= 1) {
        out.push({ move: i, win: false, threats: threats });
      }
    }
    out.sort(function (a, b) {
      if (a.win !== b.win) return a.win ? -1 : 1;
      if (a.threats !== b.threats) return b.threats - a.threats;
      return 0;
    });
    return out;
  }

  function Solver(opts) {
    this.nodes = 0;
    this.deadline = 0;
    this.timeout = false;
    this.board = null;
  }

  Solver.prototype._timeUp = function () {
    if (this.timeout) return true;
    if ((this.nodes & 63) === 0 && Date.now() > this.deadline) {
      this.timeout = true;
      return true;
    }
    return false;
  };

  // 返回能保证胜利的着点下标，找不到返回 -1
  Solver.prototype._search = function (color, depth, ply) {
    this.nodes++;
    if (this._timeUp()) return -1;
    var board = this.board;
    var opp = 3 - color;

    // 自己能直接成五
    var myFive = board.fivePoints(color);
    if (myFive.length) {
      // 选一个合法的成五点
      var x = myFive[0] % N;
      var y = (myFive[0] / N) | 0;
      if (!(color === BLACK && R.forbiddenType(board.cells, x, y, 2) !== 0)) return myFive[0];
    }

    // 对方有立即成五的威胁 —— 必须先防，VCF 中断
    var oppFive = board.fivePoints(opp);
    if (oppFive.length) return -1;

    if (depth <= 0) return -1;

    var moves = fourMoves(board, color);
    for (var k = 0; k < moves.length; k++) {
      var m = moves[k].move;
      var mx = m % N;
      var my = (m / N) | 0;
      if (board.cells[m] !== 0) continue;
      board.place(mx, my, color);

      if (R.makesFive(board.cells, mx, my, color)) {
        board.undo();
        return m;
      }

      var myThreats = board.fivePoints(color);
      var oppThreats = board.fivePoints(opp);

      if (oppThreats.length) {
        // 对方可以抢先在别处成五
        board.undo();
        continue;
      }

      if (myThreats.length >= 2) {
        // 双四 / 活四，无法同时防守
        board.undo();
        return m;
      }

      if (myThreats.length === 1) {
        var p = myThreats[0];
        var px = p % N;
        var py = (p / N) | 0;
        // 防守方是黑棋，且堵点本身是禁手 → 黑无法防守，白胜
        if (opp === BLACK && R.forbiddenType(board.cells, px, py, 2) !== 0) {
          board.undo();
          return m;
        }
        board.place(px, py, opp);
        var sub = this._search(color, depth - 1, ply + 1);
        board.undo();
        if (sub >= 0) {
          board.undo();
          return m;
        }
      }
      board.undo();
    }
    return -1;
  };

  // 对外接口：在 board 上为 color 找 VCF 胜着
  // opts: { depth, timeMs }
  function find(board, color, opts) {
    opts = opts || {};
    var depth = opts.depth || 9;
    var timeMs = opts.timeMs || 800;
    var s = new Solver();
    s.board = board;
    s.deadline = Date.now() + timeMs;
    s.timeout = false;
    s.nodes = 0;
    var move = s._search(color, depth, 0);
    return {
      move: move,
      ok: move >= 0,
      nodes: s.nodes,
      timeout: s.timeout,
    };
  }

  // 该着是否形成「四」（或直接成五）
  function isFourMove(board, x, y, color) {
    var i = y * N + x;
    if (board.cells[i] !== 0) return false;
    if (color === BLACK && R.forbiddenType(board.cells, x, y, 2) !== 0) return false;
    board.place(x, y, color);
    var five = R.makesFive(board.cells, x, y, color);
    var threats = board.fivePoints(color).length;
    board.undo();
    return five || threats >= 1;
  }

  // 棋盘上是否已存在某方的五连（含长连）
  function hasFiveOnBoard(board, color) {
    var cells = board.cells;
    for (var i = 0; i < 225; i++) {
      if (cells[i] !== color) continue;
      var x = i % N;
      var y = (i / N) | 0;
      for (var d = 0; d < 4; d++) {
        var dx = R.DIRS[d][0];
        var dy = R.DIRS[d][1];
        var px = x - dx;
        var py = y - dy;
        if (px >= 0 && px < N && py >= 0 && py < N && cells[py * N + px] === color) continue;
        var n = 1;
        var nx = x + dx;
        var ny = y + dy;
        while (nx >= 0 && nx < N && ny >= 0 && ny < N && cells[ny * N + nx] === color) {
          n++;
          nx += dx;
          ny += dy;
        }
        if (n >= 5) return true;
      }
    }
    return false;
  }

  // 防守方应手：占掉攻方威胁最大的空点
  function chooseDefense(board, playerColor) {
    var opp = 3 - playerColor;
    var cand = board.candidateList();
    var best = -1;
    var bestScore = -Infinity;
    for (var k = 0; k < cand.length; k++) {
      var i = cand[k];
      if (board.cells[i] !== 0) continue;
      var x = i % N;
      var y = (i / N) | 0;
      if (opp === BLACK && R.forbiddenType(board.cells, x, y, 3) !== 0) continue;
      var sc = board.moveScore(x, y, playerColor);
      if (sc > bestScore) {
        bestScore = sc;
        best = i;
      }
    }
    return best;
  }

  /*
   * 玩家在 (x,y) 落子之后，计算对手的应手或直接判定胜负。
   * 调用前棋子必须已经落在棋盘上。
   * 返回：
   *   { win: true, reason }        本局玩家胜（five / double / forbidden）
   *   { reply: cellIndex, forced } 对手应手（forced 表示唯一成五点的被迫堵点）
   *   { reply: -1 }                无可落点
   */
  function replyAfter(board, playerColor) {
    var opp = 3 - playerColor;
    if (hasFiveOnBoard(board, playerColor)) return { win: true, reason: "five" };

    var threats = board.fivePoints(playerColor);
    if (threats.length >= 2) return { win: true, reason: "double" };

    if (threats.length === 1) {
      var p = threats[0];
      var px = p % N;
      var py = (p / N) | 0;
      if (opp === BLACK && R.forbiddenType(board.cells, px, py, 3) !== 0) {
        return { win: true, reason: "forbidden" };
      }
      return { reply: p, forced: true };
    }
    return { reply: chooseDefense(board, playerColor), forced: false };
  }

  return {
    find: find,
    fourMoves: fourMoves,
    isFourMove: isFourMove,
    replyAfter: replyAfter,
    chooseDefense: chooseDefense,
    hasFiveOnBoard: hasFiveOnBoard,
  };
});
