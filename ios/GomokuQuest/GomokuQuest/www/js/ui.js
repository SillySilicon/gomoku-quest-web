/* 五子棋冒险 · 网页移植版 —— 界面与流程 */
(function () {
  "use strict";

  var R = window.Renju;
  var VCF = window.RenjuVCF;
  var N = 15;
  var BLACK = 1;
  var WHITE = 2;

  // ------------------------------------------------------------------ 存储
  function readJSON(key, fallback) {
    try {
      var s = localStorage.getItem(key);
      if (!s) return fallback;
      var v = JSON.parse(s);
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* 忽略 */
    }
  }

  var LANGS = ["zh", "en", "ja", "ko"];

  function detectLang() {
    var l = (navigator.language || "zh").toLowerCase();
    if (l.indexOf("zh") === 0) return "zh";
    if (l.indexOf("ja") === 0) return "ja";
    if (l.indexOf("ko") === 0) return "ko";
    return LANGS.indexOf(l.slice(0, 2)) >= 0 ? l.slice(0, 2) : "en";
  }

  var DEFAULT_CFG = {
    lang: detectLang(),
    board: "normal",
    stone: "classic",
    bgm: true,
    sfx: true,
    doubleTap: false,
    difficulty: "normal",
    color: BLACK,
  };

  var cfg = Object.assign({}, DEFAULT_CFG, readJSON("gomoku.config.v1", {}));
  if (LANGS.indexOf(cfg.lang) < 0) cfg.lang = detectLang();
  var progress = readJSON("gomoku.progress.v1", {});

  function saveCfg() {
    writeJSON("gomoku.config.v1", cfg);
  }
  function saveProgress() {
    writeJSON("gomoku.progress.v1", progress);
  }

  // ------------------------------------------------------------------ i18n
  var I18N = window.I18N || {};

  function t(key, vars) {
    var dict = I18N[cfg.lang] || I18N.zh || {};
    var s = dict[key];
    if (s == null) s = (I18N.zh || {})[key];
    if (s == null) return key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.split("{" + k + "}").join(vars[k]);
      });
    }
    return s;
  }

  // 单文件构建时把资源路径替换成 data URI
  function assetUrl(p) {
    if (window.__ASSETS && window.__ASSETS[p]) return window.__ASSETS[p];
    return p;
  }

  function applyI18n(root) {
    (root || document).querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
  }

  // ------------------------------------------------------------------ 音效
  var SOUND_BASE = "assets/sounds/";
  var sounds = {};
  var bgmEl = null;
  var audioUnlocked = false;

  function sound(name) {
    if (!cfg.sfx) return;
    if (!sounds[name]) {
      var a = new Audio(assetUrl(SOUND_BASE + name));
      a.preload = "auto";
      a.volume = name === "koma2.wav" ? 0.6 : 0.55;
      sounds[name] = a;
    }
    var node = sounds[name];
    try {
      node.currentTime = 0;
    } catch (e) {}
    var p = node.play();
    if (p && p.catch) p.catch(function () {});
  }

  function startBgm() {
    if (!cfg.bgm) return;
    if (!bgmEl) {
      bgmEl = new Audio(assetUrl(SOUND_BASE + "game_bgm.mp3"));
      bgmEl.loop = true;
      bgmEl.volume = 0.26;
    }
    var p = bgmEl.play();
    if (p && p.catch) p.catch(function () {});
  }

  function stopBgm() {
    if (bgmEl) {
      try {
        bgmEl.pause();
      } catch (e) {}
    }
  }

  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    // 背景音乐 2.6 MB，不在这里拉取：等到真正开局后再加载，避免和首屏抢带宽
  }

  var bgmTimer = null;
  function startBgmSoon() {
    if (!cfg.bgm || bgmTimer) return;
    bgmTimer = setTimeout(function () {
      bgmTimer = null;
      if (cfg.bgm && audioUnlocked) startBgm();
    }, 1500);
  }

  // ------------------------------------------------------------------ 棋盘
  function BoardView(el) {
    this.el = el;
    this.view = new Int8Array(225); // 展示用
    this.stoneStyle = cfg.stone;
    this.nodes = [];
  }

  BoardView.prototype.applyDesign = function () {
    this.el.style.backgroundImage = "url('" + assetUrl("assets/boards/" + boardFile(cfg.board)) + "')";
  };

  BoardView.prototype.fit = function () {
    var wrap = this.el.parentElement;
    var availW = wrap.clientWidth - 24;
    var availH = wrap.clientHeight - 8;
    var size = Math.max(180, Math.floor(Math.min(availW, availH)));
    this.el.style.width = size + "px";
    this.el.style.height = size + "px";
  };

  BoardView.prototype.pos = function (x, y) {
    // 原图：网格起点 40/1276，格距 85.4286/1276
    return {
      left: 3.135 + x * 6.6975,
      top: 3.135 + (14 - y) * 6.6975,
    };
  };

  BoardView.prototype.clear = function () {
    this.nodes.forEach(function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
    this.nodes = [];
  };

  BoardView.prototype.render = function (cells, opts) {
    opts = opts || {};
    this.clear();
    this.stoneStyle = opts.stone || cfg.stone;
    var last = opts.last == null ? -1 : opts.last;
    for (var i = 0; i < 225; i++) {
      var c = cells ? cells[i] : 0;
      if (!c) continue;
      this.addStone(i % 15, (i / 15) | 0, c, i === last, opts.animateLast && i === last);
    }
    (opts.crosses || []).forEach(this.addCross, this);
    (opts.ghost != null ? [opts.ghost] : []).forEach(this.addGhost, this);
    (opts.winLine || []).forEach(this.addWinMark, this);
  };

  BoardView.prototype.addStone = function (x, y, color, isLast, animate) {
    var img = document.createElement("img");
    var suffix = isLast ? "_last" : "";
    img.className = "stone" + (animate ? " drop" : "");
    img.src = assetUrl("assets/stones/" + (color === BLACK ? "black" : "white") + "_" + this.stoneStyle + suffix + ".png");
    img.draggable = false;
    var p = this.pos(x, y);
    img.style.left = p.left + "%";
    img.style.top = p.top + "%";
    this.el.appendChild(img);
    this.nodes.push(img);
  };

  BoardView.prototype.addCross = function (i) {
    var d = document.createElement("div");
    d.className = "cross";
    var p = this.pos(i % 15, (i / 15) | 0);
    d.style.left = p.left + "%";
    d.style.top = p.top + "%";
    this.el.appendChild(d);
    this.nodes.push(d);
  };

  BoardView.prototype.addGhost = function (i) {
    var d = document.createElement("div");
    d.className = "ghost";
    var p = this.pos(i % 15, (i / 15) | 0);
    d.style.left = p.left + "%";
    d.style.top = p.top + "%";
    this.el.appendChild(d);
    this.nodes.push(d);
  };

  BoardView.prototype.addWinMark = function (i) {
    var d = document.createElement("div");
    d.className = "mark-win";
    var p = this.pos(i % 15, (i / 15) | 0);
    d.style.left = p.left + "%";
    d.style.top = p.top + "%";
    this.el.appendChild(d);
    this.nodes.push(d);
  };

  BoardView.prototype.hit = function (clientX, clientY) {
    var rect = this.el.getBoundingClientRect();
    var px = ((clientX - rect.left) / rect.width) * 100;
    var py = ((clientY - rect.top) / rect.height) * 100;
    var gx = Math.round((px - 3.135) / 6.6975);
    var gy = 14 - Math.round((py - 3.135) / 6.6975);
    if (gx < 0 || gx > 14 || gy < 0 || gy > 14) return null;
    var target = this.pos(gx, gy);
    var dx = (px - target.left) / 6.6975;
    var dy = (py - target.top) / 6.6975;
    if (Math.hypot(dx, dy) > 0.55) return null;
    return { x: gx, y: gy, i: gy * 15 + gx };
  };

  function bindTap(el, handler) {
    var start = null;
    el.addEventListener("pointerdown", function (ev) {
      start = { x: ev.clientX, y: ev.clientY, t: Date.now() };
    });
    el.addEventListener("pointerup", function (ev) {
      if (!start) return;
      var moved = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
      start = null;
      if (moved > 12) return;
      handler(ev);
    });
    el.addEventListener("pointercancel", function () {
      start = null;
    });
  }

  // ------------------------------------------------------------------ 路由
  var current = "home";
  var history = [];

  function show(name, opts) {
    opts = opts || {};
    if (!opts.replace) {
      if (current !== name) history.push(current);
    }
    document.querySelectorAll(".screen").forEach(function (s) {
      s.classList.remove("active");
    });
    var el = document.getElementById("screen-" + name);
    if (el) el.classList.add("active");
    current = name;
    if (name === "game") fitGameBoard();
    if (name === "vcf-play") fitVcfBoard();
  }

  function back() {
    var prev = history.pop() || "home";
    show(prev, { replace: true });
  }

  document.querySelectorAll("[data-back]").forEach(function (btn) {
    btn.addEventListener("click", back);
  });
  document.querySelectorAll("[data-nav]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.getAttribute("data-nav");
      unlockAudio();
      if (target === "play-setup") resetSetupScreen();
      if (target === "lectures") renderLectureList();
      if (target === "settings") renderSettings();
      if (target === "about") renderAbout();
      show(target);
      if (target === "vcf-sets") {
        // 题库数据较大，进入本页时才加载
        var box = document.getElementById("vcfSetList");
        if (box && (!SETS.length || !SETS[0].puzzles)) {
          box.innerHTML = '<div class="loading-tip">' + t("common.loading") + "</div>";
        }
        ensureProblems(function () {
          renderVcfSets();
        });
      }
    });
  });

  // ------------------------------------------------------------------ 弹窗
  var modalBackdrop = document.getElementById("modalBackdrop");

  function showModal(o) {
    document.getElementById("modalCrown").src = o.crown ? assetUrl("assets/crown.png") : "";
    document.getElementById("modalCrown").style.display = o.crown ? "block" : "none";
    document.getElementById("modalTitle").textContent = o.title || "";
    document.getElementById("modalText").textContent = o.text || "";
    var actions = document.getElementById("modalActions");
    actions.innerHTML = "";
    (o.actions || []).forEach(function (a) {
      var b = document.createElement("button");
      b.textContent = a.label;
      if (a.primary) b.className = "primary";
      b.addEventListener("click", function () {
        hideModal();
        if (a.onClick) a.onClick();
      });
      actions.appendChild(b);
    });
    modalBackdrop.classList.remove("hidden");
  }

  function hideModal() {
    modalBackdrop.classList.add("hidden");
  }

  var toastTimers = {};

  function toast(el, msg) {
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimers[el.id]);
    toastTimers[el.id] = setTimeout(function () {
      el.classList.remove("show");
    }, 1800);
  }

  // ------------------------------------------------------------------ 对局
  var gameBoard = new BoardView(document.getElementById("gameBoard"));
  var game = null;
  var AI_CFG = {
    easy: { timeMs: 180, depth: 4, cand: 8 },
    normal: { timeMs: 420, depth: 6, cand: 12 },
    hard: { timeMs: 900, depth: 8, cand: 16 },
  };

  function resetSetupScreen() {
    document.querySelectorAll("#colorChips .chip").forEach(function (c) {
      c.classList.toggle("active", Number(c.getAttribute("data-color")) === cfg.color);
    });
    document.querySelectorAll("#diffChips .chip").forEach(function (c) {
      c.classList.toggle("active", c.getAttribute("data-diff") === cfg.difficulty);
    });
    document.getElementById("renjuNote").textContent = renjuNoteText();
    document.getElementById("startGameBtn").textContent = t("play.start");
  }

  function renjuNoteText() {
    if (cfg.lang === "zh") return "规则为连珠（有禁手）：黑棋不能走三三、四四、长连；首着天元，第二手贴身，第三手在中央 5×5 内。";
    if (cfg.lang === "ja") return "ルールは連珠（禁手あり）。黒は三三・四四・長連が禁手。初手は天元、2手目は隣接、3手目は中央5×5以内。";
    if (cfg.lang === "ko") return "규칙은 연주(금수 있음)입니다. 흑은 삼삼·사사·장련을 둘 수 없습니다. 첫 수는 중앙, 두 번째는 인접, 세 번째는 중앙 5×5 이내.";
    return "Renju rules: Black may not play double-three, double-four or overline. First move is the center, second adjacent, third within 5×5 of center.";
  }

  document.querySelectorAll("#colorChips .chip").forEach(function (c) {
    c.addEventListener("click", function () {
      cfg.color = Number(c.getAttribute("data-color"));
      saveCfg();
      resetSetupScreen();
    });
  });
  document.querySelectorAll("#diffChips .chip").forEach(function (c) {
    c.addEventListener("click", function () {
      cfg.difficulty = c.getAttribute("data-diff");
      saveCfg();
      resetSetupScreen();
    });
  });

  document.getElementById("startGameBtn").addEventListener("click", function () {
    unlockAudio();
    startGame();
    show("game");
    startBgmSoon();
  });

  function startGame() {
    game = {
      board: new R.Board(),
      playerColor: cfg.color,
      side: BLACK,
      over: false,
      thinking: false,
      result: null,
      moveCount: 0,
    };
    gameBoard.applyDesign();
    renderGame();
    updateGameStatus();
    if (game.playerColor === WHITE) {
      // 黑先，AI 落首着
      scheduleAI(320);
    }
  }

  function fitGameBoard() {
    gameBoard.fit();
    renderGame();
  }

  function renderGame(opts) {
    opts = opts || {};
    if (!game) return;
    var cells = game.board.cells;
    gameBoard.render(cells, {
      last: game.board.lastMove,
      animateLast: !!opts.animate,
      winLine: game.winLine || [],
    });
  }

  function updateGameStatus() {
    var dot = document.getElementById("gameTurnDot");
    var el = document.getElementById("gameStatus");
    document.getElementById("gameTitle").textContent = t("game.vsAI");
    if (!game) return;
    if (game.over) {
      dot.classList.add("hidden");
      if (game.result === "win") el.textContent = t("game.youWin");
      else if (game.result === "lose") el.textContent = t("game.youLose");
      else if (game.result === "forbidden") el.textContent = t("illegal." + (game.forbiddenKind || "three"));
      else el.textContent = t("game.draw");
      return;
    }
    if (game.thinking) {
      dot.classList.remove("hidden");
      dot.classList.toggle("white", game.side === WHITE);
      el.textContent = t("game.thinking");
      return;
    }
    dot.classList.remove("hidden");
    dot.classList.toggle("white", game.side === WHITE);
    el.textContent = game.side === game.playerColor ? t("game.yourTurn") : t("game.thinking");
  }

  // 连珠开局限制：首着天元、第二手贴身、第三手在中央 5×5 内
  function checkOpening(x, y) {
    var n = game.board.count; // 已落子数
    if (n === 0) {
      if (!(x === 7 && y === 7)) return "illegal.first";
      return null;
    }
    if (n === 1) {
      if (Math.abs(x - 7) > 1 || Math.abs(y - 7) > 1 || (x === 7 && y === 7)) return "illegal.second";
      return null;
    }
    if (n === 2) {
      if (Math.abs(x - 7) > 2 || Math.abs(y - 7) > 2) return "illegal.third";
      return null;
    }
    return null;
  }

  function humanPlay(x, y) {
    if (!game || game.over || game.thinking) return;
    if (game.side !== game.playerColor) return;
    var i = y * N + x;
    if (game.board.cells[i] !== 0) return;

    var illegal = checkOpening(x, y);
    if (illegal) {
      toast(document.getElementById("gameToast"), t(illegal));
      sound("incorrect.wav");
      return;
    }
    if (game.playerColor === BLACK) {
      var ft = R.forbiddenType(game.board.cells, x, y, 3);
      if (ft !== 0) {
        toast(document.getElementById("gameToast"), t(ft === 1 ? "illegal.six" : ft === 2 ? "illegal.four" : "illegal.three"));
        sound("incorrect.wav");
        return;
      }
    }

    game.board.place(x, y, game.playerColor);
    game.moveCount++;
    sound("koma2.wav");
    renderGame({ animate: true });

    if (R.makesFive(game.board.cells, x, y, game.playerColor)) {
      endGame("win");
      return;
    }
    if (game.board.count >= 225) {
      endGame("draw");
      return;
    }
    game.side = 3 - game.playerColor;
    updateGameStatus();
    scheduleAI(140);
  }

  function scheduleAI(delay) {
    if (!game || game.over) return;
    game.thinking = true;
    updateGameStatus();
    setTimeout(function () {
      if (!game || game.over) return;
      var conf = AI_CFG[cfg.difficulty] || AI_CFG.normal;
      var search = new R.Search(game.board, { maxCandidates: conf.cand });
      var res = search.search(game.side, { timeMs: conf.timeMs, maxDepth: conf.depth });
      var move = res.move;
      if (move < 0) {
        game.thinking = false;
        updateGameStatus();
        return;
      }
      var x = move % N;
      var y = (move / N) | 0;
      // 尊重开局限制：AI 若越界则选合法点
      var op = checkOpening(x, y);
      if (op) {
        var fixed = pickOpeningMove();
        if (fixed) {
          x = fixed % N;
          y = (fixed / N) | 0;
        }
      }
      if (game.side === BLACK && R.forbiddenType(game.board.cells, x, y, 3) !== 0) {
        var alt = pickAnyLegal();
        if (alt != null) {
          x = alt % N;
          y = (alt / N) | 0;
        }
      }
      game.board.place(x, y, game.side);
      game.moveCount++;
      sound("koma2.wav");
      game.thinking = false;
      renderGame({ animate: true });

      if (R.makesFive(game.board.cells, x, y, game.side)) {
        endGame("lose");
        return;
      }
      if (game.board.count >= 225) {
        endGame("draw");
        return;
      }
      game.side = 3 - game.side;
      updateGameStatus();
    }, delay);
  }

  function pickOpeningMove() {
    var n = game.board.count;
    if (n === 0) return 7 * N + 7;
    if (n === 1) {
      var cands = [];
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          var x = 7 + dx;
          var y = 7 + dy;
          if (game.board.cells[y * N + x] === 0) cands.push(y * N + x);
        }
      }
      return cands.length ? cands[0] : null;
    }
    if (n === 2) {
      for (var yy = 5; yy <= 9; yy++) {
        for (var xx = 5; xx <= 9; xx++) {
          if (game.board.cells[yy * N + xx] === 0) return yy * N + xx;
        }
      }
    }
    return null;
  }

  function pickAnyLegal() {
    var list = game.board.candidateList();
    for (var k = 0; k < list.length; k++) {
      var i = list[k];
      var x = i % N;
      var y = (i / N) | 0;
      if (game.board.cells[i] !== 0) continue;
      if (game.side === BLACK && R.forbiddenType(game.board.cells, x, y, 3) !== 0) continue;
      return i;
    }
    return null;
  }

  function endGame(result, forbiddenKind) {
    game.over = true;
    game.result = result;
    game.forbiddenKind = forbiddenKind;
    game.thinking = false;
    updateGameStatus();
    if (result === "win") {
      sound("correct_low_.mp3");
      showModal({
        crown: true,
        title: t("game.youWin"),
        text: "",
        actions: [
          { label: t("game.backHome"), onClick: function () { show("home", { replace: true }); } },
          { label: t("game.again"), primary: true, onClick: startGame },
        ],
      });
    } else if (result === "lose") {
      sound("notice2.wav");
      showModal({
        title: t("game.youLose"),
        actions: [
          { label: t("game.backHome"), onClick: function () { show("home", { replace: true }); } },
          { label: t("game.again"), primary: true, onClick: startGame },
        ],
      });
    } else if (result === "draw") {
      showModal({
        title: t("game.draw"),
        actions: [{ label: t("common.ok"), primary: true, onClick: function () {} }],
      });
    }
  }

  bindTap(document.getElementById("gameBoard"), function (ev) {
    if (!game || game.over || game.thinking) return;
    var hit = gameBoard.hit(ev.clientX, ev.clientY);
    if (!hit) return;
    unlockAudio();
    humanPlay(hit.x, hit.y);
  });

  function countStones() {
    var c = 0;
    for (var i = 0; i < 225; i++) if (game.board.cells[i]) c++;
    return c;
  }

  document.getElementById("undoBtn").addEventListener("click", function () {
    if (!game || game.thinking) return;
    if (!game.board.history.length) return;
    var undone = 0;
    game.over = false;
    game.result = null;
    var side = game.side;
    while (game.board.history.length && undone < 3) {
      game.board.undo();
      undone++;
      var cnt = countStones();
      side = cnt % 2 === 0 ? BLACK : WHITE;
      if (side === game.playerColor) break;
    }
    game.side = side;
    game.thinking = false;
    renderGame();
    updateGameStatus();
  });

  document.getElementById("resignBtn").addEventListener("click", function () {
    if (!game || game.over) return;
    showModal({
      title: t("game.resign"),
      text: t("game.resignConfirm"),
      actions: [
        { label: t("common.cancel"), onClick: function () {} },
        {
          label: t("game.resign"),
          primary: true,
          onClick: function () {
            endGame("lose");
          },
        },
      ],
    });
  });

  document.getElementById("restartBtn").addEventListener("click", function () {
    hideModal();
    startGame();
  });

  // ------------------------------------------------------------------ VCF
  var vcfBoard = new BoardView(document.getElementById("vcfBoard"));
  var vcf = null;

  /*
   * 题库体积 208 KB，不再随首屏加载：
   *   · 先用 problems-meta.js 里的索引（约 1 KB）撑起列表和进度
   *   · 真正进入挑战页时才注入 problems.js，再解码题目
   *   · 单文件版把 problems.js 内联在 ui.js 之前，因此这里会直接命中
   */
  var SETS = [];

  function buildSetList() {
    var full = window.PROBLEM_SETS || [];
    var meta = window.PROBLEM_SETS_META || [];
    var base = full.length ? full : meta;
    SETS = base.map(function (s) {
      return { id: s.id, group: s.group, moves: s.moves, count: s.count, puzzles: null };
    });
    if (!full.length) return;
    SETS.forEach(function (set, i) {
      var s = full[i];
      if (!s || s.id !== set.id || !s.data) return;
      set.puzzles = s.data.map(function (b64) {
        var bin = atob(b64);
        var out = new Uint8Array(bin.length);
        for (var k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
        return out;
      });
    });
  }
  buildSetList();

  var problemsLoading = null;

  function ensureProblems(cb) {
    if (SETS.length && SETS[0].puzzles) {
      cb();
      return;
    }
    if (problemsLoading) {
      problemsLoading.push(cb);
      return;
    }
    problemsLoading = [cb];
    var s = document.createElement("script");
    s.src = "js/problems.js";
    s.onload = function () {
      buildSetList();
      var list = problemsLoading;
      problemsLoading = null;
      (list || []).forEach(function (fn) {
        fn();
      });
    };
    s.onerror = function () {
      problemsLoading = null;
      toast(document.getElementById("vcfToast"), t("vcf.noHint"));
    };
    document.head.appendChild(s);
  }

  var GROUP_ORDER = ["black", "white_simple", "white_forbid", "misc"];
  var GROUP_LABEL = {
    black: "vcf.black",
    white_simple: "vcf.whiteSimple",
    white_forbid: "vcf.whiteForbid",
    misc: "vcf.misc",
  };

  function solvedOf(setId) {
    var arr = progress[setId];
    return Array.isArray(arr) ? arr : [];
  }

  function isSolved(setId, idx) {
    return solvedOf(setId).indexOf(idx) >= 0;
  }

  function markSolved(setId, idx) {
    var arr = progress[setId] || (progress[setId] = []);
    if (arr.indexOf(idx) < 0) arr.push(idx);
    saveProgress();
  }

  function renderVcfSets() {
    var box = document.getElementById("vcfSetList");
    box.innerHTML = "";
    GROUP_ORDER.forEach(function (g) {
      var inGroup = SETS.filter(function (s) {
        return s.group === g;
      });
      if (!inGroup.length) return;
      var title = document.createElement("div");
      title.className = "group-title";
      title.textContent = t(GROUP_LABEL[g]);
      box.appendChild(title);
      inGroup.forEach(function (set) {
        var solved = solvedOf(set.id).length;
        var card = document.createElement("div");
        card.className = "set-card";
        var pct = Math.round((solved / set.count) * 100);
        card.innerHTML =
          '<div class="info">' +
          '<div class="name"></div>' +
          '<div class="bar"><i style="width:' +
          pct +
          '%"></i></div>' +
          '<div class="meta"><span></span><span></span></div>' +
          "</div>" +
          '<div class="go">›</div>';
        card.querySelector(".name").textContent = t("vcf.movesN", { n: set.moves }) + " · " + set.id.toUpperCase();
        card.querySelectorAll(".meta span")[0].textContent = t("vcf.progress", { solved: solved, total: set.count });
        card.querySelectorAll(".meta span")[1].textContent = pct + "%";
        card.addEventListener("click", function () {
          openVcfSet(set);
        });
        box.appendChild(card);
      });
    });
  }

  var vcfSet = null;

  function openVcfSet(set) {
    vcfSet = set;
    var idx = 0;
    for (var i = 0; i < set.count; i++) {
      if (!isSolved(set.id, i)) {
        idx = i;
        break;
      }
    }
    loadProblem(idx);
    show("vcf-play");
  }

  function loadProblem(idx) {
    var stones = vcfSet.puzzles[idx];
    var board = new R.Board();
    for (var i = 0; i < stones.length; i++) {
      board.place(stones[i] % N, (stones[i] / N) | 0, i % 2 === 0 ? BLACK : WHITE);
    }
    board.refreshAll();
    board.history = [];
    board.lastMove = -1;
    vcf = {
      index: idx,
      board: board,
      side: stones.length % 2 === 0 ? BLACK : WHITE,
      over: false,
      solved: false,
      busy: false,
      moveCount: 0,
      hintCell: -1,
    };
    vcfBoard.applyDesign();
    fitVcfBoard();
    updateVcfChrome();
    updateVcfStatus();
  }

  function fitVcfBoard() {
    vcfBoard.fit();
    renderVcf();
  }

  function renderVcf() {
    if (!vcf) return;
    vcfBoard.render(vcf.board.cells, {
      last: vcf.board.lastMove,
      animateLast: true,
      ghost: vcf.hintCell >= 0 ? vcf.hintCell : null,
    });
  }

  function updateVcfChrome() {
    document.getElementById("vcfSetName").textContent = vcfSet.id.toUpperCase() + " · " + t("vcf.movesN", { n: vcfSet.moves });
    document.getElementById("vcfProgress").textContent =
      t("vcf.problemNo", { n: vcf.index + 1 }) + " / " + vcfSet.count + "  ·  " +
      t("vcf.progress", { solved: solvedOf(vcfSet.id).length, total: vcfSet.count });
  }

  function updateVcfStatus() {
    var dot = document.getElementById("vcfTurnDot");
    var el = document.getElementById("vcfStatus");
    if (!vcf) return;
    dot.classList.remove("hidden");
    dot.classList.toggle("white", vcf.side === WHITE);
    if (vcf.over) {
      dot.classList.add("hidden");
      el.textContent = vcf.solved ? t("vcf.success") : t("vcf.wrong");
      return;
    }
    var who = vcf.side === BLACK ? t("vcf.blackToMove") : t("vcf.whiteToMove");
    el.textContent = who + " · " + t("vcf.goal");
  }

  function vcfTap(x, y) {
    if (!vcf || vcf.over || vcf.busy) return;
    var i = y * N + x;
    if (vcf.board.cells[i] !== 0) return;
    var player = vcf.side;
    var opp = 3 - player;

    if (player === BLACK && R.forbiddenType(vcf.board.cells, x, y, 3) !== 0) {
      toast(document.getElementById("vcfToast"), t("illegal.three"));
      sound("incorrect.wav");
      return;
    }

    vcf.hintCell = -1;
    vcf.board.place(x, y, player);
    vcf.moveCount++;
    sound("koma2.wav");
    renderVcf();

    // 判定胜负 / 计算对手应手（逻辑在 vcf.js，便于测试）
    var res = VCF.replyAfter(vcf.board, player);
    if (res.win) {
      finishVcf(true);
      return;
    }
    if (res.reply == null || res.reply < 0) {
      vcf.side = player;
      updateVcfStatus();
      toast(document.getElementById("vcfToast"), t("vcf.noFourLeft"));
      return;
    }

    vcf.busy = true;
    setTimeout(function () {
      if (!vcf) return;
      var rx = res.reply % N;
      var ry = (res.reply / N) | 0;
      if (vcf.board.cells[res.reply] === 0) {
        vcf.board.place(rx, ry, opp);
        sound("koma2.wav");
        renderVcf();
      }
      vcf.busy = false;
      // 对手反手连五，本局失败
      if (vcf.board.cells[res.reply] === opp && R.makesFive(vcf.board.cells, rx, ry, opp)) {
        finishVcf(false);
        return;
      }
      vcf.side = player;
      updateVcfStatus();

      if (vcf.board.count >= 225) {
        finishVcf(false);
        return;
      }
      // 没有可继续冲四的点时，给个提示但不打断
      if (VCF.fourMoves(vcf.board, player).length === 0) {
        toast(document.getElementById("vcfToast"), t("vcf.noFourLeft"));
      }
    }, 180);
  }

  function finishVcf(success) {
    vcf.over = true;
    vcf.solved = success;
    updateVcfStatus();
    if (success) {
      sound("correct_low_.mp3");
      markSolved(vcfSet.id, vcf.index);
      updateVcfChrome();
      var isLast = vcf.index + 1 >= vcfSet.count;
      showModal({
        crown: true,
        title: t("vcf.success"),
        text: t("vcf.movesN", { n: vcfSet.moves }) + " · " + (vcf.index + 1) + " / " + vcfSet.count,
        actions: isLast
          ? [{ label: t("common.ok"), primary: true, onClick: function () { show("vcf-sets", { replace: true }); } }]
          : [
              { label: t("vcf.retry"), onClick: function () { loadProblem(vcf.index); } },
              { label: t("vcf.next"), primary: true, onClick: nextProblem },
            ],
      });
    } else {
      sound("notice2.wav");
      showModal({
        title: t("vcf.wrong"),
        text: "",
        actions: [
          { label: t("vcf.retry"), primary: true, onClick: function () { loadProblem(vcf.index); } },
        ],
      });
    }
  }

  function nextProblem() {
    if (!vcfSet) return;
    var idx = vcf.index + 1;
    if (idx >= vcfSet.count) idx = 0;
    loadProblem(idx);
  }

  bindTap(document.getElementById("vcfBoard"), function (ev) {
    var hit = vcfBoard.hit(ev.clientX, ev.clientY);
    if (!hit) return;
    unlockAudio();
    vcfTap(hit.x, hit.y);
  });

  document.getElementById("vcfHintBtn").addEventListener("click", function () {
    if (!vcf || vcf.over) return;
    var res = VCF.find(vcf.board, vcf.side, { depth: vcfSet.moves + 2, timeMs: 900 });
    if (res.ok) {
      vcf.hintCell = res.move;
      renderVcf();
      toast(document.getElementById("vcfToast"), t("vcf.answer"));
    } else {
      toast(document.getElementById("vcfToast"), t("vcf.noHint"));
    }
  });

  document.getElementById("vcfRetryBtn").addEventListener("click", function () {
    if (vcfSet) loadProblem(vcf.index);
  });

  document.getElementById("vcfNextBtn").addEventListener("click", function () {
    nextProblem();
  });

  // ------------------------------------------------------------------ 课程
  function renderLectureList() {
    var box = document.getElementById("lectureList");
    box.innerHTML = "";
    var titles = [
      "lecture.lesson1",
      "lecture.lesson2",
      "lecture.lesson3",
      "lecture.lesson4",
      "lecture.lesson5",
      "lecture.lesson6",
      "lecture.lesson7",
    ];
    titles.forEach(function (key, i) {
      var card = document.createElement("div");
      card.className = "lesson-card";
      card.innerHTML = '<div class="no">' + (i + 1) + "</div><div class=\"name\"></div><div class=\"go\">›</div>";
      card.querySelector(".name").textContent = t(key);
      card.addEventListener("click", function () {
        openLecture(i);
      });
      box.appendChild(card);
    });
  }

  var lectureIndex = 0;

  function decodeSquare(s) {
    // "hh" -> x=7, y=7；行号字母 a..o，a 为第 1 行
    var x = s.charCodeAt(0) - 97;
    var y = s.charCodeAt(1) - 97;
    return { x: x, y: y };
  }

  function parseStones(str) {
    // ";B[cc];W[dd]" -> [{x,y,color}]
    if (!str) return [];
    return str
      .split(";")
      .map(function (s) {
        s = s.trim();
        if (!s) return null;
        var m = /^([BW])\[([a-o])([a-o])\]$/.exec(s);
        if (!m) return null;
        var pos = decodeSquare(m[2] + m[3]);
        return { x: pos.x, y: pos.y, color: m[1] === "B" ? BLACK : WHITE };
      })
      .filter(Boolean);
  }

  var lecturesLoading = null;
  function ensureLectures(cb) {
    if (window.LECTURES) {
      cb();
      return;
    }
    if (lecturesLoading) {
      lecturesLoading.push(cb);
      return;
    }
    lecturesLoading = [cb];
    var s = document.createElement("script");
    s.src = "js/lectures.js";
    s.onload = function () {
      var list = lecturesLoading;
      lecturesLoading = null;
      (list || []).forEach(function (fn) {
        fn();
      });
    };
    s.onerror = function () {
      lecturesLoading = null;
    };
    document.head.appendChild(s);
  }

  function openLecture(i) {
    lectureIndex = i;
    ensureLectures(function () {
      renderLecture();
    });
    show("lecture");
  }

  function renderLecture() {
    var lessons = (window.LECTURES && window.LECTURES[cfg.lang]) || window.LECTURES.zh;
    var html = lessons[lectureIndex];
    document.getElementById("lectureTitle").textContent = t("lecture.lesson" + (lectureIndex + 1));
    document.getElementById("lectureIndex").textContent = lectureIndex + 1 + " / " + lessons.length;

    var body = document.getElementById("lectureBody");
    body.innerHTML = html;
    body.scrollTop = 0;

    // 把 <board> 替换成可交互棋盘
    body.querySelectorAll("board").forEach(function (el) {
      var staticStones = parseStones(el.getAttribute("board") || "");
      var moves = parseStones(el.getAttribute("moves") || "");
      var crossesStr = el.getAttribute("crosses") || "";
      var cursorAttr = el.getAttribute("cursor");
      var cursor = cursorAttr != null ? parseInt(cursorAttr, 10) : moves.length;
      if (isNaN(cursor)) cursor = moves.length;
      if (!moves.length) cursor = 0;

      var wrap = document.createElement("div");
      wrap.className = "lecture-board";

      var boardEl = document.createElement("div");
      boardEl.className = "board";
      wrap.appendChild(boardEl);

      var ctrl = document.createElement("div");
      ctrl.className = "board-ctrl";
      var prevBtn = document.createElement("button");
      prevBtn.textContent = "◀";
      var label = document.createElement("span");
      var nextBtn = document.createElement("button");
      nextBtn.textContent = "▶";
      ctrl.appendChild(prevBtn);
      ctrl.appendChild(label);
      ctrl.appendChild(nextBtn);
      wrap.appendChild(ctrl);

      el.parentNode.replaceChild(wrap, el);

      var view = new BoardView(boardEl);
      view.applyDesign();

      var crosses = crossesStr
        ? crossesStr.split(",").map(function (s) {
            var p = decodeSquare(s.trim());
            return p.y * N + p.x;
          })
        : [];

      function paint() {
        var cells = new Int8Array(225);
        staticStones.forEach(function (s) {
          cells[s.y * N + s.x] = s.color;
        });
        var last = -1;
        for (var k = 0; k < cursor && k < moves.length; k++) {
          var m = moves[k];
          cells[m.y * N + m.x] = m.color;
          last = m.y * N + m.x;
        }
        view.render(cells, { last: last, crosses: crosses });
        label.textContent = moves.length ? cursor + " / " + moves.length : "";
        prevBtn.disabled = cursor <= 0;
        nextBtn.disabled = cursor >= moves.length;
        var w = wrap.clientWidth;
        if (w > 0) {
          boardEl.style.width = w + "px";
          boardEl.style.height = w + "px";
        }
      }

      prevBtn.addEventListener("click", function () {
        if (cursor > 0) {
          cursor--;
          paint();
        }
      });
      nextBtn.addEventListener("click", function () {
        if (cursor < moves.length) {
          cursor++;
          paint();
          sound("koma2.wav");
        }
      });

      // 立即绘制（读取 clientWidth 会强制完成布局），稍后再校正一次尺寸
      paint();
      setTimeout(paint, 60);
    });
  }

  document.getElementById("lecPrev").addEventListener("click", function () {
    if (lectureIndex > 0) {
      lectureIndex--;
      renderLecture();
    }
  });
  document.getElementById("lecNext").addEventListener("click", function () {
    var lessons = (window.LECTURES && window.LECTURES[cfg.lang]) || window.LECTURES.zh;
    if (lectureIndex < lessons.length - 1) {
      lectureIndex++;
      renderLecture();
    }
  });

  // ------------------------------------------------------------------ 设置
  var BOARD_DESIGNS = [
    { id: "normal", file: "normal.jpg", key: "board.normal" },
    { id: "sky", file: "sky.jpg", key: "board.sky" },
    { id: "green", file: "green.png", key: "board.green" },
    { id: "book", file: "book.png", key: "board.book" },
  ];

  function boardFile(id) {
    for (var i = 0; i < BOARD_DESIGNS.length; i++) {
      if (BOARD_DESIGNS[i].id === id) return BOARD_DESIGNS[i].file;
    }
    return "normal.jpg";
  }

  var STONE_STYLES = [
    { id: "classic", key: "stone.classic" },
    { id: "clam", key: "stone.clam" },
    { id: "green", key: "stone.green" },
  ];

  function renderSettings() {
    // 语言
    var langBox = document.getElementById("langChips");
    langBox.innerHTML = "";
    var LANG_LABEL = { zh: "简体中文", en: "English", ja: "日本語", ko: "한국어" };
    LANGS.forEach(function (lg) {
      var b = document.createElement("button");
      b.className = "chip" + (cfg.lang === lg ? " active" : "");
      b.textContent = LANG_LABEL[lg];
      b.addEventListener("click", function () {
        cfg.lang = lg;
        saveCfg();
        document.documentElement.lang = lg === "zh" ? "zh-CN" : lg;
        applyI18n();
        renderSettings();
        updateHomeAssets();
      });
      langBox.appendChild(b);
    });

    // 棋盘
    var boardBox = document.getElementById("boardGrid");
    boardBox.innerHTML = "";
    BOARD_DESIGNS.forEach(function (d) {
      var item = document.createElement("div");
      item.className = "design-item" + (cfg.board === d.id ? " active" : "");
      var thumbUrl = assetUrl("assets/boards/" + d.file);
      item.innerHTML = '<div class="thumb" style="background-image:url(\'' + thumbUrl + "')\"></div><div class=\"cap\"></div>";
      item.querySelector(".cap").textContent = t(d.key);
      item.addEventListener("click", function () {
        cfg.board = d.id;
        saveCfg();
        gameBoard.applyDesign();
        vcfBoard.applyDesign();
        renderSettings();
      });
      boardBox.appendChild(item);
    });

    // 棋子
    var stoneBox = document.getElementById("stoneGrid");
    stoneBox.innerHTML = "";
    STONE_STYLES.forEach(function (s) {
      var item = document.createElement("div");
      item.className = "stone-item" + (cfg.stone === s.id ? " active" : "");
      item.innerHTML =
        '<div class="pair">' +
        '<img src="' + assetUrl("assets/stones/black_" + s.id + ".png") + '" alt="">' +
        '<img src="' + assetUrl("assets/stones/white_" + s.id + ".png") + '" alt="">' +
        "</div>" +
        '<div class="cap"></div>';
      item.querySelector(".cap").textContent = t(s.key);
      item.addEventListener("click", function () {
        cfg.stone = s.id;
        saveCfg();
        renderSettings();
      });
      stoneBox.appendChild(item);
    });

    document.getElementById("bgmToggle").checked = !!cfg.bgm;
    document.getElementById("sfxToggle").checked = !!cfg.sfx;
    document.getElementById("doubleTapToggle").checked = !!cfg.doubleTap;
  }

  document.getElementById("bgmToggle").addEventListener("change", function (e) {
    cfg.bgm = e.target.checked;
    saveCfg();
    if (cfg.bgm) startBgm();
    else stopBgm();
  });
  document.getElementById("sfxToggle").addEventListener("change", function (e) {
    cfg.sfx = e.target.checked;
    saveCfg();
  });
  document.getElementById("doubleTapToggle").addEventListener("change", function (e) {
    cfg.doubleTap = e.target.checked;
    saveCfg();
  });

  // ------------------------------------------------------------------ 关于
  function renderAbout() {
    document.getElementById("aboutText").textContent = t("about.body");
    document.getElementById("aboutSource").textContent = t("about.source");
    document.getElementById("aboutLogo").src = assetUrl("assets/logo/" + cfg.lang + "_top_title1.png");
  }

  // ------------------------------------------------------------------ 首页
  function updateHomeAssets() {
    var l1 = document.getElementById("logo1");
    var l2 = document.getElementById("logo2");
    l1.onerror = function () {
      l1.style.display = "none";
    };
    l2.onerror = function () {
      l2.style.display = "none";
    };
    l1.style.display = "";
    l2.style.display = "";
    l1.src = assetUrl("assets/logo/" + cfg.lang + "_top_title1.png");
    l2.src = assetUrl("assets/logo/" + cfg.lang + "_top_title2.png");
    document.documentElement.lang = cfg.lang === "zh" ? "zh-CN" : cfg.lang;
  }

  function updateHomeStats() {
    var total = 0;
    var solved = 0;
    SETS.forEach(function (s) {
      total += s.count;
      solved += solvedOf(s.id).length;
    });
    document.getElementById("homeStats").textContent = t("vcf.progress", { solved: solved, total: total });
  }

  // ------------------------------------------------------------------ 尺寸
  function relayout() {
    if (current === "game") fitGameBoard();
    if (current === "vcf-play") fitVcfBoard();
    if (current === "lecture") {
      document.querySelectorAll("#lectureBody .lecture-board .board").forEach(function (el) {
        var wrap = el.parentElement.parentElement;
        var w = wrap.clientWidth - 2;
        el.style.width = w + "px";
        el.style.height = w + "px";
      });
    }
  }

  window.addEventListener("resize", relayout);
  window.addEventListener("orientationchange", function () {
    setTimeout(relayout, 260);
  });

  // ------------------------------------------------------------------ 启动
  function boot() {
    applyI18n();
    document.documentElement.style.setProperty(
      "--home-bg",
      "url('" + assetUrl("assets/bg/home.jpg") + "')",
    );
    updateHomeAssets();
    updateHomeStats();
    resetSetupScreen();
    document.documentElement.lang = cfg.lang === "zh" ? "zh-CN" : cfg.lang;

    // 首次交互解锁音频
    document.addEventListener(
      "pointerdown",
      function () {
        unlockAudio();
      },
      { once: true },
    );

    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () {});
      });
    }

    // 预置棋盘背景
    gameBoard.applyDesign();
    vcfBoard.applyDesign();

    setupInstallHint();

    // 首屏渲染完之后，在空闲时把按需加载的两个脚本悄悄拉下来，
    // 这样断网状态下也能正常进入挑战页和课程页（Service Worker 会顺手缓存）
    var warm = function () {
      ["js/problems.js", "js/lectures.js"].forEach(function (src) {
        try {
          fetch(src).catch(function () {});
        } catch (e) {}
      });
    };
    if (window.requestIdleCallback) {
      window.requestIdleCallback(warm, { timeout: 6000 });
    } else {
      setTimeout(warm, 4500);
    }
  }

  /*
   * iOS Safari 里提示「添加到主屏幕」。
   * 已经在桌面图标里运行（standalone）或用户关掉过一次，都不再显示。
   */
  function setupInstallHint() {
    var bar = document.getElementById("installBar");
    if (!bar) return;
    var ua = navigator.userAgent || "";
    var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var standalone =
      navigator.standalone === true ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
    var KEY = "gomoku.installHint";
    var dismissed = false;
    try {
      dismissed = localStorage.getItem(KEY) === "1";
    } catch (e) {}
    if (!isIOS || standalone || dismissed) return;

    document.getElementById("installTitle").textContent = t("install.title");
    document.getElementById("installDesc").textContent = t("install.iosStep");
    bar.hidden = false;
    document.getElementById("installClose").addEventListener("click", function () {
      bar.hidden = true;
      try {
        localStorage.setItem(KEY, "1");
      } catch (e) {}
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  // 自动化测试句柄
  window.__gomoku = {
    get cfg() {
      return cfg;
    },
    get game() {
      return game;
    },
    get vcf() {
      return vcf;
    },
    get sets() {
      return SETS;
    },
    show: show,
    startGame: startGame,
    openVcfSet: openVcfSet,
    loadProblem: loadProblem,
    openLecture: openLecture,
    renderLecture: renderLecture,
    renderSettings: renderSettings,
    renderVcfSets: renderVcfSets,
    gameBoard: gameBoard,
    vcfBoard: vcfBoard,
    t: t,
    progress: function () {
      return progress;
    },
  };
})();
