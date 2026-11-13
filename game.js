/* běng-k-běng 界面与流程 */
(function () {
  'use strict';
  var R = window.BKB.rules;
  var AI = window.BKB.ai;

  var NAMES = ['你', '小胖', '阿珍', '铁蛋', '豆豆侠', '老李', '小美', '阿福'];
  /* 按人数计份的招式（刀/豆），其余招式不管打几个人都是固定价 */
  var PER_TARGET = {};
  R.ACTIONS.forEach(function (a) { if (a.perTarget) PER_TARGET[a.id] = true; });

  /* 动作对应的图片名（诅咒 0–3 级共用一张，保佑 0–3 级共用一张） */
  /* ICON_VER：换图后改这个数字，浏览器就会重新拉图，不会被缓存骗到 */
  var ICON_VER = '6';
  function iconSrc(id) { return 'img/' + iconFor(id) + '.png?v=' + ICON_VER; }
  function iconFor(id) {
    if (/^curse[0-3]$/.test(id)) return 'curse';
    if (/^bless[0-3]$/.test(id)) return 'bless';
    return id;
  }

  var S = {
    players: [], round: 1, history: [], phase: 'choose',
    me: null, difficulty: 1, pick: { kind: 'attack', actionId: null, queue: [] },
    revealed: {}, busy: false, botCount: 7, turnNo: 1, preview: []
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {};

  function boot() {
    el.circle = $('circle'); el.chant = $('chant'); el.hint = $('hint'); el.center = $('center');
    el.log = $('log'); el.actions = $('actions'); el.picks = $('picks');
    el.go = $('go'); el.msg = $('msg'); el.tabs = $('tabs');
    el.round = $('roundLabel'); el.alive = $('aliveLabel'); el.stage = $('stageLabel');

    $('difficulty').value = String(S.difficulty);
    $('difficulty').onchange = function () { S.difficulty = Number(this.value); };

    /* 字体大小：默认「大」，选择后记在本地 */
    var fsSel = $('fontSize');
    if (fsSel) {
      var savedFs = 'l';
      try { savedFs = localStorage.getItem('bkb_fs') || 'l'; } catch (e) {}
      document.documentElement.setAttribute('data-fs', savedFs);
      fsSel.value = savedFs;
      fsSel.onchange = function () {
        document.documentElement.setAttribute('data-fs', this.value);
        try { localStorage.setItem('bkb_fs', this.value); } catch (e) {}
      };
    }
    $('players').value = String(S.botCount);
    $('players').onchange = function () { S.botCount = Number(this.value); newGame(); };
    $('restart').onclick = function () { newGame(); };
    el.go.onclick = function () { submitTurn(); };
    var cancelBtn = $('cancel');
    if (cancelBtn) cancelBtn.onclick = function () { clearPick(); };
    el.tabs.querySelectorAll('button').forEach(function (b) {
      b.onclick = function () {
        if (S.phase !== 'choose' || !S.me.alive) return;
        S.pick.kind = b.dataset.kind;
        S.pick.actionId = null;
        S.pick.queue = [];
        el.tabs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
        renderComposer();
      };
    });
    document.addEventListener('keydown', function (e) {
      if (S.tutOpen) {
        e.preventDefault();
        if (e.key === 'Enter') {
          if (tutIdx >= TUT.length - 1) closeTut(true);
          else { tutIdx++; renderTut(); }
        }
        if (e.key === 'Escape') closeTut(true);
        return;
      }
      if (e.key === 'Enter') { e.preventDefault(); submitTurn(); }
      if (e.key === 'Escape') { clearPick(); }
    });
    newGame();

    /* 开场教程：第一次来就弹，之后可用右上角「规则」再看 */
    if ($('tut')) {
      $('tutClose').onclick = function () { closeTut(true); };
      $('tutPrev').onclick = function () { if (tutIdx > 0) { tutIdx--; renderTut(); } };
      $('tutNext').onclick = function () {
        if (tutIdx >= TUT.length - 1) closeTut(true);
        else { tutIdx++; renderTut(); }
      };
      var rulesBtn = $('btnRules');
      if (rulesBtn) rulesBtn.onclick = function () { openTut(); };
      var seen = false;
      try { seen = !!localStorage.getItem(TUT_KEY); } catch (e) { seen = false; }
      if (!seen) setTimeout(openTut, 250);
    }
  }

  function newGame() {
    S.round = 1; S.history = []; S.revealed = {}; S.busy = false;
    S.players = NAMES.slice(0, S.botCount + 1).map(function (nm, i) {
      return {
        id: 'p' + i, name: nm, isHuman: i === 0, alive: true, stage: 0,
        /* 每个 AI 的性格：影响它偏向进攻 / 防守 / 攒气 */
        persona: {
          aggr: 0.85 + Math.random() * 0.45,
          def: 0.85 + Math.random() * 0.45,
          luck: 0.80 + Math.random() * 0.50
        }
      };
    });
    S.me = S.players[0];
    el.log.innerHTML = '';
    newRound();
  }

  function newRound() {
    S.players.forEach(function (p) { p.alive = true; p.stage = 0; p.lastText = ''; p.actId = null; });
    S.history = []; S.revealed = {}; S.phase = 'choose'; S.busy = false;
    S.turnNo = 1;
    S.pick.kind = 'attack'; S.pick.actionId = null; S.pick.queue = [];
    el.tabs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x.dataset.kind === 'attack'); });
    buildCircle();
    logLine('—— 第 ' + S.round + ' 局开始，全员复活 ——', 'warn');
    startTurn();
  }

  /* ---------- 圆圈布局 ---------- */
  function buildCircle() {
    var center = el.center;
    el.circle.innerHTML = '';
    var n = S.players.length;
    S.players.forEach(function (p, i) {
      var ang = Math.PI / 2 + i * 2 * Math.PI / n;
      var t = document.createElement('div');
      t.className = 'token';
      t.id = 'tk-' + p.id;
      t.style.left = (50 + 39 * Math.cos(ang)) + '%';
      t.style.top = (50 + 39 * Math.sin(ang)) + '%';
      t.innerHTML = '<div class="nm"></div><div class="qi"></div><div class="act"></div><div class="mv"></div>'
        + '<span class="badge">点</span>';
      t.onclick = function () { onTokenClick(p); };
      t.onmouseenter = function () {
        if (S.phase !== 'choose' || S.pick.actionId !== 'sweep') return;
        if (!p.alive || p.id === S.me.id) return;
        sweepPreview(p.id);
      };
      t.onmouseleave = function () {
        if (S.phase !== 'choose' || S.pick.actionId !== 'sweep') return;
        sweepPreview(defaultSweepCenter());
      };
      el.circle.appendChild(t);
    });
    if (center) el.circle.appendChild(center);
    syncCircle();
  }

  /* ---------- 出招箭头 ---------- */
  var NS = 'http://www.w3.org/2000/svg';

  function ensureArrows() {
    var svg = document.getElementById('arrows');
    if (!svg) {
      svg = document.createElementNS(NS, 'svg');
      svg.id = 'arrows';
      document.getElementById('arena').appendChild(svg);
    }
    return svg;
  }

  function clearArrows() {
    var svg = document.getElementById('arrows');
    if (svg) while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function drawArrows(intents) {
    var svg = ensureArrows();
    clearArrows();
    var arena = document.getElementById('arena');
    var ab = arena.getBoundingClientRect();
    var defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = '<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">'
      + '<path d="M0,0 L10,5 L0,10 z" fill="#e05a4f"/></marker>';
    svg.appendChild(defs);

    function center(el) {
      var r = el.getBoundingClientRect();
      return {
        x: r.left - ab.left + r.width / 2,
        y: r.top - ab.top + r.height / 2,
        w: r.width, h: r.height
      };
    }

    S.players.forEach(function (p) {
      var it = intents[p.id];
      if (!it || it.kind !== 'attack') return;
      (it.strikes || []).forEach(function (s) {
        var a = R.act(s.actionId);
        var src = document.getElementById('tk-' + p.id);
        if (!a || !src) return;
        (s.targets || []).forEach(function (tid) {
          var dst = document.getElementById('tk-' + tid);
          if (!dst) return;
          var c1 = center(src), c2 = center(dst);
          var dx = c2.x - c1.x, dy = c2.y - c1.y;
          var len = Math.sqrt(dx * dx + dy * dy) || 1;
          var ux = dx / len, uy = dy / len;
          var sx = c1.x + ux * (c1.w * 0.42), sy = c1.y + uy * (c1.h * 0.42);
          var ex = c2.x - ux * (c2.w * 0.55), ey = c2.y - uy * (c2.h * 0.55);

          var line = document.createElementNS(NS, 'line');
          line.setAttribute('x1', sx); line.setAttribute('y1', sy);
          line.setAttribute('x2', ex); line.setAttribute('y2', ey);
          line.setAttribute('stroke', '#e05a4f');
          line.setAttribute('stroke-width', '3.5');
          line.setAttribute('stroke-linecap', 'round');
          line.setAttribute('opacity', '0.9');
          line.setAttribute('marker-end', 'url(#ah)');
          svg.appendChild(line);

          /* 靠近 A 的线旁放该招式的小图 */
          var px = -uy * 22, py = ux * 22;
          var img = document.createElementNS(NS, 'image');
          var iconUrl = iconSrc(a.id);
          img.setAttribute('href', iconUrl);
          img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', iconUrl);
          img.setAttribute('x', sx + px + ux * 26 - 14);
          img.setAttribute('y', sy + py + uy * 26 - 14);
          img.setAttribute('width', '28');
          img.setAttribute('height', '28');
          svg.appendChild(img);
        });
      });
    });
  }

  function syncCircle() {
    S.players.forEach(function (p) {
      var t = document.getElementById('tk-' + p.id);
      if (!t) return;
      t.classList.toggle('me', p.isHuman);
      t.classList.toggle('dead', !p.alive);
      t.querySelector('.nm').textContent = p.isHuman ? '你' : p.name;
      t.querySelector('.qi').textContent = p.alive
        ? (p.stage === 0 ? '0 阶 · 1 份' : R.qiLabel(p.stage) + ' 气 · ' + R.units(p.stage) + ' 份')
        : '';
      var mv = S.revealed[p.id] || p.lastText || '';
      var cell = t.querySelector('.mv');
      cell.textContent = mv;
      cell.style.color = S.revealed[p.id] ? 'var(--ink)' : 'var(--dim)';

      /* 招式小图：位置高度永远占着，只有图片有无的变化，框不会抖 */
      var actBox = t.querySelector('.act');
      var ic = p.alive ? p.actId : null;
      if (actBox) {
        if (ic) {
          if (!actBox.firstChild) actBox.innerHTML = '<img alt="">';
          var im = actBox.firstChild;
          var src = iconSrc(ic);
          if (im.getAttribute('src') !== src) im.setAttribute('src', src);
        } else if (actBox.firstChild) {
          actBox.innerHTML = '';
        }
      }
      var canPick = S.phase === 'choose' && S.pick.actionId && S.me && S.me.alive;
      t.classList.toggle('hot', !!(canPick && p.alive && p.id !== S.me.id));
      var picked = S.pick.queue.some(function (s) { return (s.targets || []).indexOf(p.id) >= 0; })
        || (S.preview || []).indexOf(p.id) >= 0;
      t.classList.toggle('pick', picked);
    });
    var alive = S.players.filter(function (p) { return p.alive; });
    el.round.textContent = S.round;
    el.alive.textContent = alive.length;
    el.stage.textContent = S.me.alive ? (S.me.stage === 0 ? '0 阶' : R.qiLabel(S.me.stage) + ' 气 / ' + R.units(S.me.stage) + ' 份') : '已出局';
  }

  /* ---------- 出招面板 ---------- */
  function costOf(action, targets) {
    var n = (targets && targets.length) || 0;
    return action.cost * (PER_TARGET[action.id] ? Math.max(n, 1) : 1);
  }
  function queueCost() {
    return S.pick.queue.reduce(function (sum, s) {
      return sum + costOf(R.act(s.actionId), s.targets);
    }, 0);
  }

  function renderComposer() {
    var stage = S.me.stage, units = R.units(stage);
    var used = queueCost();
    var kind = S.pick.kind;
    el.actions.innerHTML = '';

    R.ACTIONS.forEach(function (a) {
      if (kind === 'attack' && a.kind !== 'attack') return;
      if (kind === 'defense' && a.kind !== 'defense') return;
      if (kind === 'special' && a.kind !== 'special') return;
      var blocked = !S.me.alive || a.minStage > stage || (costOf(a, [1]) > units - used && !PER_TARGET[a.id])
        || (PER_TARGET[a.id] && a.cost > units - used);
      var chip = document.createElement('button');
      chip.className = 'chip cost' + (blocked ? ' off' : '') + (S.pick.actionId === a.id ? ' sel' : '');
      chip.innerHTML = '<img class="ic" src="' + iconSrc(a.id) + '" alt="">' + a.name + ' <b>' + fmtCost(a) + '</b>';
      chip.title = a.desc || '';
      chip.onclick = function () {
        if (blocked || S.phase !== 'choose') return;
        if (a.kind === 'attack') {
          S.pick.actionId = (S.pick.actionId === a.id) ? null : a.id;
          el.hint.textContent = S.pick.actionId
            ? (a.id === 'sweep' ? '横扫：红框是高亮的三个人，点谁就换成以谁为中心' : '点圈里的玩家选目标（再点一次取消）')
            : '选一个招式';
          renderComposer();
          if (S.pick.actionId === 'sweep') sweepPreview(defaultSweepCenter());
          else { S.preview = []; syncCircle(); }
        } else {
          S.pick.actionId = null;
          S.pick.queue.push({ actionId: a.id, targets: [] });
          afterQueueChange();
        }
      };
      el.actions.appendChild(chip);
    });

    var near = R.ACTIONS.filter(function (a) {
      return a.minStage > stage && ((kind === 'attack' && a.kind === 'attack') || (kind === 'defense' && a.kind === 'defense'));
    }).slice(0, 3);
    if (near.length) {
      var tip = document.createElement('span');
      tip.style.color = 'var(--dim)'; tip.style.fontSize = '12px'; tip.style.alignSelf = 'center';
      tip.textContent = '未解锁：' + near.map(function (a) { return a.name + '(' + a.minStage + '阶)'; }).join('、');
      el.actions.appendChild(tip);
    }

    el.picks.innerHTML = '';
    S.pick.queue.forEach(function (s, i) {
      var a = R.act(s.actionId);
      var names = (s.targets || []).map(function (id) {
        var p = S.players.find(function (x) { return x.id === id; }); return p ? p.name : id;
      });
      var span = document.createElement('span');
      span.className = 'pick';
      span.innerHTML = '<img class="ic" src="' + iconSrc(a.id) + '" alt="">'
        + a.name + (names.length ? ' → ' + names.join('、') : '');
      span.title = '点一下撤掉';
      span.style.cursor = 'pointer';
      span.onclick = function () { S.pick.queue.splice(i, 1); afterQueueChange(); };
      el.picks.appendChild(span);
    });
    if (S.pick.queue.length) {
      var tot = document.createElement('span');
      tot.textContent = '合计 ' + used + ' / ' + units + ' 份';
      tot.style.marginLeft = '4px';
      el.picks.appendChild(tot);
    }
    el.go.disabled = !(S.pick.queue.length > 0 && used <= units && S.phase === 'choose' && S.me.alive);
    el.msg.textContent = S.phase === 'choose'
      ? (S.me.alive ? '一回合只做一件事：攻击 / 防御 / 运气' : '你已出局，正在观战……')
      : '';
    syncCircle();
  }

  function fmtCost(a) {
    if (PER_TARGET[a.id]) return a.cost + '/下';
    return String(a.cost);
  }

  function afterQueueChange() {
    S.pick.actionId = null;
    S.preview = [];
    el.hint.textContent = S.pick.queue.length ? '可以继续加招，或按「出招」' : '选一个招式';
    renderComposer();
  }

  function clearPick() {
    if (S.phase !== 'choose') return;
    S.pick.queue = [];
    S.pick.actionId = null;
    S.preview = [];
    el.hint.textContent = '已取消，重新选招';
    renderComposer();
  }

  /* 横扫：以选中的人为中心，左右各带一个。
     - 不能跨过自己横扫，所以自己的左右手不能当中心（除非场上只剩两三人）
     - 活着不到 4 人时可以少于三个 */
  function sweepValidCenters() {
    var alive = S.players.filter(function (p) { return p.alive; });
    var n = alive.length;
    var mi = -1;
    alive.forEach(function (p, i) { if (p.id === S.me.id) mi = i; });
    var out = [];
    alive.forEach(function (p, i) {
      if (p.id === S.me.id) return;
      if (n <= 3) { out.push(p.id); return; }
      var d1 = (i - mi + n) % n, d2 = (mi - i + n) % n;
      if (d1 >= 2 && d2 >= 2) out.push(p.id);
    });
    return out;
  }

  function sweepGroup(centerId) {
    var alive = S.players.filter(function (p) { return p.alive; });
    var n = alive.length;
    var others = alive.filter(function (p) { return p.id !== S.me.id; });
    var maxTargets = Math.min(3, others.length);
    var ci = -1;
    alive.forEach(function (p, i) { if (p.id === centerId) ci = i; });
    if (ci < 0) return [centerId];
    if (n <= 3) {
      var grp = [centerId];
      others.forEach(function (p) { if (p.id !== centerId && grp.length < maxTargets) grp.push(p.id); });
      return grp;
    }
    var arcs = [
      [alive[(ci - 1 + n) % n], alive[ci], alive[(ci + 1) % n]],
      [alive[ci], alive[(ci + 1) % n], alive[(ci + 2) % n]],
      [alive[(ci - 2 + n) % n], alive[(ci - 1 + n) % n], alive[ci]]
    ];
    var pick = null, bestLen = -1;
    arcs.forEach(function (arc) {
      if (arc.some(function (p) { return p.id === S.me.id; })) return;
      var ids = arc.map(function (p) { return p.id; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
      if (ids.indexOf(centerId) < 0) return;
      if (ids.length > bestLen) { bestLen = ids.length; pick = ids; }
    });
    if (!pick) {
      var fallback = [centerId];
      others.forEach(function (p) { if (fallback.length < maxTargets) fallback.push(p.id); });
      return fallback;
    }
    return pick.slice(0, maxTargets);
  }

  function defaultSweepCenter() {
    var valid = sweepValidCenters();
    if (!valid.length) return null;
    /* 优先选正对面的人 */
    var alive = S.players.filter(function (p) { return p.alive; });
    var mi = -1;
    alive.forEach(function (p, i) { if (p.id === S.me.id) mi = i; });
    var opposite = alive[(mi + Math.floor(alive.length / 2)) % alive.length];
    if (valid.indexOf(opposite.id) >= 0) return opposite.id;
    return valid[0];
  }

  function sweepPreview(centerId) {
    if (!centerId) { S.preview = []; syncCircle(); return; }
    if (sweepValidCenters().indexOf(centerId) < 0) {
      S.preview = [];
      el.hint.textContent = '不能跨过自己横扫：左右手不能当中心（场上只剩两三人时才行）';
      syncCircle();
      return;
    }
    S.preview = sweepGroup(centerId);
    el.hint.textContent = '横扫：红框这三个人，点谁就换成以谁为中心';
    syncCircle();
  }

  function onTokenClick(p) {
    if (S.phase !== 'choose' || !S.pick.actionId) return;
    if (!p.alive || p.id === S.me.id) return;
    var a = R.act(S.pick.actionId);
    var units = R.units(S.me.stage);
    /* 已经在队列里的同一招，换目标时先扣掉旧的，避免误报份数不足 */
    var withoutSame = S.pick.queue.filter(function (s) { return s.actionId !== a.id; });
    var used = withoutSame.reduce(function (sum, s) { return sum + costOf(R.act(s.actionId), s.targets); }, 0);

    if (a.maxT > 1 && !PER_TARGET[a.id]) {
      if (sweepValidCenters().indexOf(p.id) < 0) {
        el.hint.textContent = '不能跨过自己横扫：左右手不能当中心（人少了才行）';
        return;
      }
      var group = sweepGroup(p.id);
      if (used + costOf(a, group) > units) { el.hint.textContent = '份数不够了，先出招'; return; }
      S.pick.queue = withoutSame;
      S.pick.queue.push({ actionId: a.id, targets: group });
      S.pick.actionId = null;
      S.preview = [];
      afterQueueChange();
      return;
    }
    if (used + costOf(a, [p.id]) > units) { el.hint.textContent = '份数不够了，先出招'; return; }
    S.pick.queue.push({ actionId: a.id, targets: [p.id] });
    afterQueueChange();
  }

  /* ---------- 日志 ---------- */
  function logLine(text, cls) {
    var li = document.createElement('li');
    li.textContent = text;
    if (cls) li.className = cls;
    el.log.appendChild(li);
    el.log.scrollTop = el.log.scrollHeight;
  }
  function logEvents(events) {
    events.forEach(function (e) { logLine(e.text, e.cls); });
  }

  function actionText(intent) {
    if (!intent) return '';
    if (intent.kind === 'special') return R.act(intent.actionId).name;
    return (intent.strikes || []).map(function (s) {
      var nm = R.act(s.actionId).name;
      var ts = (s.targets || []).map(function (id) {
        var p = S.players.find(function (x) { return x.id === id; });
        return p ? p.name : id;
      });
      return ts.length ? nm + '→' + ts.join('、') : nm;
    }).join(' + ');
  }

  /* ---------- 回合流程 ---------- */
  function startTurn() {
    S.phase = 'choose'; S.busy = false; S.revealed = {};
    S.pick.queue = []; S.pick.actionId = null; S.preview = [];
    el.chant.textContent = '准备';
    el.chant.style.color = 'var(--gold)';
    el.hint.textContent = S.me.alive ? '选一个招式，再点圈里的玩家定目标' : '你已出局，正在观战……';
    renderComposer();
    if (!S.me.alive) setTimeout(function () { submitTurn(); }, 1400);
  }

  function buildHumanIntent() {
    var q = S.pick.queue;
    if (!q.length) return null;
    var first = R.act(q[0].actionId);
    if (first.kind === 'special') return { kind: 'special', actionId: q[0].actionId };
    return {
      kind: first.kind,
      strikes: q.map(function (s) { return { actionId: s.actionId, targets: (s.targets || []).slice() }; })
    };
  }

  function submitTurn() {
    if (S.phase !== 'choose' || S.busy) return;
    var intents = {};
    if (S.me.alive) {
      var mine = buildHumanIntent();
      if (!mine) return;
      if (R.intentCost(mine) > R.units(S.me.stage)) { el.hint.textContent = '份数不够，撤掉一招'; return; }
      if (mine.kind === 'attack') {
        var bad = mine.strikes.filter(function (s) { return !s.targets || !s.targets.length; });
        if (bad.length) { el.hint.textContent = '还有招式没选目标'; return; }
      }
      intents[S.me.id] = mine;
    }
    var state = { players: S.players, history: S.history, turnNo: S.turnNo, lastHits: S.lastHits || {} };
    S.players.forEach(function (p) {
      if (!p.alive || p.id === S.me.id) return;
      var it = AI.decide(p, state, S.difficulty);
      if (!it || R.intentCost(it) > R.units(p.stage)) it = { kind: 'special', actionId: 'qi' };
      intents[p.id] = it;
    });
    S.phase = 'chant'; S.busy = true;
    S.pendingIntents = intents;
    clearArrows();
    renderComposer();
    chantSequence(function () { revealAndResolve(intents); });
  }

  function chantSequence(done) {
    var beats = [
      { m: 'běng！', s: '左手拍左邻右手 · 右手拍右邻左手' },
      { m: 'k', s: '自己双手击掌' },
      { m: 'běng！', s: '再和两侧各拍一次' },
      { m: '出 手！', s: '同时亮招，谁都不许改' }
    ];
    var i = 0;
    (function step() {
      el.chant.textContent = beats[i].m;
      el.hint.textContent = beats[i].s;
      el.chant.style.color = i === 3 ? 'var(--red)' : 'var(--gold)';
      i++;
      if (i < beats.length) setTimeout(step, 600);
      else setTimeout(done, 450);
    })();
  }

  function revealAndResolve(intents) {
    S.revealed = {};
    S.players.forEach(function (p) {
      if (intents[p.id]) S.revealed[p.id] = actionText(intents[p.id]);
    });
    syncCircle();
    el.chant.textContent = '亮招';
    el.chant.style.color = 'var(--green)';
    drawArrows(intents);
    logLine('—— 亮招：' + S.players.filter(function (p) { return p.alive; })
      .map(function (p) { return p.name + '《' + (S.revealed[p.id] || '—') + '》'; }).join('，'));
    setTimeout(function () { resolveNow(intents); }, 1000);
  }

  function resolveNow(intents) {
    var result = R.resolveTurn(S.players, intents);
    S.players.forEach(function (p) {
      if (!intents[p.id]) return;
      p.lastText = actionText(intents[p.id]);
      var it = intents[p.id];
      p.actId = (it.kind === 'special') ? it.actionId : (it.strikes && it.strikes[0] ? it.strikes[0].actionId : null);
    });
    logEvents(result.events);
    /* 记录历史，供 AI 读习惯 */
    var recs = S.players.filter(function (p) { return intents[p.id]; }).map(function (p) {
      var it = intents[p.id];
      var cat = null, actId = null;
      var tgt = [];
      if (it.kind === 'attack' && it.strikes && it.strikes[0]) {
        cat = R.act(it.strikes[0].actionId).cat;
        actId = it.strikes[0].actionId;
        it.strikes.forEach(function (s) { tgt = tgt.concat(s.targets || []); });
      } else if (it.kind === 'defense' && it.strikes && it.strikes[0]) {
        actId = it.strikes[0].actionId;
      } else if (it.kind === 'special') {
        actId = it.actionId;
      }
      return { id: p.id, kind: it.kind, cat: cat, act: actId, targets: tgt, turn: S.round };
    });
    S.history = S.history.concat(recs).slice(-48);
    /* 记录本轮谁被打了多少次，下一轮 AI 会避开"刚被打过"的人，避免连续集火 */
    var hits = {};
    S.players.forEach(function (p) {
      var it = intents[p.id];
      if (!it) return;
      (it.strikes || []).forEach(function (s) {
        (s.targets || []).forEach(function (t) { hits[t] = (hits[t] || 0) + 1; });
      });
    });
    S.lastHits = hits;

    var alive = S.players.filter(function (p) { return p.alive; });
    syncCircle();
    if (alive.length <= 1) { endRound(alive[0]); return; }
    S.turnNo++;
    S.phase = 'choose';
    setTimeout(startTurn, 700);
  }

  function endRound(winner) {
    S.phase = 'over'; S.busy = true;
    S.players.forEach(function (p) { p.alive = true; p.stage = 0; });
    if (winner) {
      el.chant.textContent = '🏆 ' + winner.name + ' 获胜';
      logLine('🏆 第 ' + S.round + ' 局结束，' + winner.name + ' 最后站着。全员复活，准备下一局。', 'warn');
    } else {
      el.chant.textContent = '💥 同归于尽';
      logLine('💥 第 ' + S.round + ' 局同归于尽，全员复活重开。', 'warn');
    }
    S.players.forEach(function (p) { p.alive = true; });
    syncCircle();
    S.round++;
    setTimeout(function () { newRound(); }, 2600);
  }

  /* ---------- 开场教程 ---------- */
  var TUT_KEY = 'bkb_tut_v1';
  var TUT = [
    {
      h: '一回合只做一件事',
      list: [
        '每回合三选一：<b>攻击 / 防御 / 运气</b>，不能既打又挡',
        '全场喊「běng—k—běng」后<b>同时出手</b>，出手不能改',
        '攻击的那一回合<b>没有防御</b>——敢打就要敢挨打'
      ],
      imgs: [['knife', '刀'], ['reboundS', '小反弹'], ['qi', '运气']]
    },
    {
      h: '同等级才挡得住',
      list: [
        '攻击等级 <b>等于</b> 防御等级 → 挡住，双方无事',
        '攻击 <b>高于</b> 防御 → 破盾，<b>防御者出局</b>',
        '攻击 <b>低于</b> 防御 → 反噬，<b>攻击者出局</b>',
        '所以出手前先看对方阶位，别拿 0 级招去撞高级防御'
      ],
      imgs: [['knife', '0 阶攻击'], ['reboundM', '1 阶防御'], ['reboundL', '4 阶防御']]
    },
    {
      h: '气 = 阶位，不是钱',
      list: [
        '「运气」升一阶，一回合能用的份数翻倍：<b>1 → 2 → 4 → 8</b>',
        '没花完的份数<b>留到下一回合</b>',
        '<b>只要有人出局，全场的气立即清零</b>',
        '攻击的回合，气的自动防御失效（真气被牵动）'
      ],
      imgs: [['qi', '运气'], ['crossChop', '6 气解锁横劈']]
    },
    {
      h: '两个要命的细节',
      list: [
        '<b>豆只杀三种人</b>：正在运气的人、气功、咒术之刃；其他人打了也没事',
        '<b>互攻比点数</b>：相等则僵持都不死；谁点数低，谁那一下作废',
        '<b>竖劈谁都躲不掉</b>（飞天、下地都没用），只能用反弹类挡'
      ],
      imgs: [['bean', '打豆豆'], ['chopDown', '竖劈'], ['reboundM', '中反弹']]
    },
    {
      h: '开打吧',
      list: [
        '0 阶先出「刀」和「小反弹」，稳一点',
        '出局不用慌：本局结束<b>全员复活</b>',
        '想重看规则，点右上角「<b>规则</b>」'
      ],
      imgs: [['knife', '刀'], ['reboundS', '小反弹'], ['suicide', '自杀（别乱用）']]
    }
  ];
  var tutIdx = 0;

  function renderTut() {
    var body = $('tutBody'), dots = $('tutDots');
    if (!body) return;
    var s = TUT[tutIdx];
    var html = '<h3>' + s.h + '</h3><ul>' + s.list.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>';
    if (s.imgs && s.imgs.length) {
      html += '<div class="tut-imgs">' + s.imgs.map(function (p) {
        return '<figure><img src="' + iconSrc(p[0]) + '" alt=""><figcaption>' + p[1] + '</figcaption></figure>';
      }).join('') + '</div>';
    }
    body.innerHTML = html;
    dots.innerHTML = TUT.map(function (_, i) {
      return '<span class="dot' + (i === tutIdx ? ' on' : '') + '"></span>';
    }).join('');
    $('tutPrev').disabled = tutIdx === 0;
    $('tutNext').textContent = (tutIdx === TUT.length - 1) ? '开始游戏' : '下一步';
    var counter = document.querySelector('.tut-head b');
    if (counter) counter.textContent = '崩K崩 · 30 秒上手（' + (tutIdx + 1) + '/' + TUT.length + '）';
  }

  function openTut() {
    tutIdx = 0; renderTut();
    $('tut').classList.remove('hidden');
    S.tutOpen = true;
  }

  function closeTut(done) {
    $('tut').classList.add('hidden');
    S.tutOpen = false;
    if (done) { try { localStorage.setItem(TUT_KEY, '1'); } catch (e) {} }
  }

  window.BKB_UI = {
    S: S, boot: boot, renderComposer: renderComposer, syncCircle: syncCircle,
    logLine: logLine, logEvents: logEvents, actionText: actionText,
    queueCost: queueCost, costOf: costOf
  };
  document.addEventListener('DOMContentLoaded', boot);
})();
