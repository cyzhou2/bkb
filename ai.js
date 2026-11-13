/* běng-k-běng 人机 AI —— 三档：新手(0) / 老手(1) / 高手(2) */
window.BKB = window.BKB || {};
(function (BKB) {
  'use strict';
  var R = BKB.rules;

  function foesOf(state, me) {
    return state.players.filter(function (p) { return p.alive && p.id !== me.id; });
  }
  function lastRecord(state, id) {
    for (var i = state.history.length - 1; i >= 0; i--) if (state.history[i].id === id) return state.history[i];
    return null;
  }
  /* 这人下一轮有多大概率"正在运气/气功/咒术之刃"——豆只杀这三种状态 */
  function beanProb(state, id) {
    var rec = lastRecord(state, id);
    if (!rec) return 0.08;
    if (rec.act === 'qi') return 0.55;
    if (rec.act === 'qigong' || rec.act === 'curseBlade') return 0.4;
    if (rec.kind === 'defense') return 0.12;
    return 0.05;
  }
  /* 敌人这一轮有多可能攻击我（0~1） */
  function threat(state, me) {
    var foes = foesOf(state, me);
    if (!foes.length) return 0;
    var t = 0;
    foes.forEach(function (f) {
      var rec = lastRecord(state, f.id);
      var p = 0.45;
      if (rec && rec.kind === 'attack') p = 0.75;
      if (rec && rec.kind === 'qi') p = 0.3;
      if (rec && rec.kind === 'defense') p = 0.25;
      t += p;
    });
    return Math.min(1, t / foes.length);
  }
  /* 敌人上一轮攻击的类别分布 */
  function catMix(state) {
    var mix = { physical: 0, curse: 0, celestial: 0, total: 0 };
    state.history.forEach(function (h) {
      if (h.kind !== 'attack' || !h.cat) return;
      if (mix[h.cat] === undefined) return;
      mix[h.cat]++; mix.total++;
    });
    if (!mix.total) { mix.physical = 0.5; mix.curse = 0.3; mix.celestial = 0.2; mix.total = 1; }
    return mix;
  }

  function hasQiHolder(state, me) {
    return foesOf(state, me).some(function (f) { return f.stage >= 1; });
  }

  /* 选目标：不打"啥都没干"的老实人。
     加分：上轮在攻击（爱动手）、上轮打过我（报仇）；减分：上轮在运气/防御。
     再加随机噪声，避免全场按同一条规则集火同一个人。 */
  function targetScore(state, me, f, level) {
    var rec = lastRecord(state, f.id);
    var s = Math.random() * 40;
    if (rec && rec.kind === 'attack') s += 12;
    else if (rec && rec.kind === 'defense') s -= 18;
    else if (rec && rec.kind === 'qi') s -= 14;
    if (rec && rec.targets && rec.targets.indexOf(me.id) >= 0) s += 20;
    /* 别扎堆：上一轮已经被好几个人打过的，这一轮就放过他 */
    var lh = state.lastHits || {};
    s -= (lh[f.id] || 0) * 12;
    if (level >= 2) s += (f.stage >= me.stage ? 4 : -4);
    else s += (f.stage <= me.stage ? 4 : -4);
    return s;
  }
  function chooseTarget(state, me, foes, level) {
    if (!foes.length) return null;
    var best = foes[0], bs = -1e9;
    foes.forEach(function (f) {
      var s = targetScore(state, me, f, level);
      if (s > bs) { bs = s; best = f; }
    });
    return best;
  }

  function attackCandidates(me, state, level) {
    var u = R.units(me.stage);
    var foes = foesOf(state, me);
    var out = [];
    R.ACTIONS.forEach(function (a) {
      if (a.kind !== 'attack' || a.minStage > me.stage || a.cost > u) return;
      if (a.maxT > 1) {
        var n = Math.min(a.maxT, foes.length);
        if (a.id === 'bean' || a.id === 'singleBean') {
          /* 豆是猜拳：只点"最可能正在运气/气功/咒术"的人；被打过的先放过 */
          var lh0 = state.lastHits || {};
          var ranked = foes.map(function (f) {
            return { f: f, p: beanProb(state, f.id) - (lh0[f.id] || 0) * 0.12 + Math.random() * 0.12 };
          }).sort(function (x, y) { return y.p - x.p; });
          var lucky = ranked.filter(function (x) { return x.p >= 0.12; }).slice(0, n);
          if (lucky.length) out.push({ id: a.id, targets: lucky.map(function (x) { return x.f.id; }), p: lucky[0].p });
        } else if (a.id === 'knife') {
          var t1 = chooseTarget(state, me, foes, level);
          var rest = foes.filter(function (f) { return f.id !== t1.id; });
          var t2 = rest.length ? chooseTarget(state, me, rest, level) : null;
          out.push({ id: a.id, targets: [t1.id] });
          if (t2 && Math.random() < 0.45) out.push({ id: a.id, targets: [t1.id, t2.id] });
        } else {
          /* 横扫：必须扫满三人，且三人里不能有自己，也不能以自己左右手为中心 */
          var ring = state.players.filter(function (p) { return p.alive; });
          var mi = ring.findIndex(function (p) { return p.id === me.id; });
          var tris = [];
          for (var i = 0; i < ring.length; i++) {
            var g = [ring[i], ring[(i + 1) % ring.length], ring[(i + 2) % ring.length]];
            if (g.some(function (p) { return p.id === me.id; })) continue;
            var ids = g.map(function (p) { return p.id; });
            if (new Set(ids).size < 3) continue;
            if (ring.length > 3) {
              var ci = (i + 1) % ring.length;
              var d1 = (ci - mi + ring.length) % ring.length, d2 = (mi - ci + ring.length) % ring.length;
              if (d1 < 2 || d2 < 2) continue;
            }
            tris.push(ids);
          }
          if (tris.length) {
            var scored = tris.map(function (ids) {
              var sum = ids.reduce(function (acc, id) {
                var f = foes.find(function (x) { return x.id === id; });
                return acc + (f ? targetScore(state, me, f, level) : 0);
              }, 0);
              return { ids: ids, s: sum };
            }).sort(function (x, y) { return y.s - x.s; });
            out.push({ id: a.id, targets: scored[0].ids });
          } else {
            var others = ring.filter(function (p) { return p.id !== me.id; });
            if (others.length) out.push({ id: a.id, targets: others.slice(0, 3).map(function (p) { return p.id; }) });
          }
        }
        return;
      }
      var best = null;
      if (a.id === 'bean' || a.id === 'singleBean') {
        var lh1 = state.lastHits || {};
        var cand = null;
        foes.forEach(function (f) {
          var pr = beanProb(state, f.id) - (lh1[f.id] || 0) * 0.12 + Math.random() * 0.12;
          if (!cand || pr > cand.p) cand = { f: f, p: pr };
        });
        if (cand && cand.p >= 0.12) out.push({ id: a.id, targets: [cand.f.id], p: cand.p });
        return;
      } else {
        best = chooseTarget(state, me, foes, level);
      }
      if (best) out.push({ id: a.id, targets: [best.id] });
    });
    return out;
  }

  /* 返回一个合法出招 */
  function decide(me, state, level) {
    var rnd = Math.random;
    var alive = state.players.filter(function (p) { return p.alive; });
    var u = R.units(me.stage);
    var th = threat(state, me);
    var mix = catMix(state);
    var cands = [];

    var pf = me.persona || { aggr: 1, def: 1, luck: 1 };
    /* 节奏：打得凶一点，宁可战死也别站桩 */
    var turnNo = state.turnNo || 1;
    var aggression = turnNo <= 2 ? 0.55 : (alive.length <= 4 ? 1.25 : 0.95);
    var defenseBoost = turnNo <= 2 ? 1.2 : 1.0;
    if (me.stage < R.MAX_STAGE) cands.push({ kind: 'qi', score: (30 + (me.stage < 2 ? 16 : 0) + (th < 0.35 ? 12 : 0) - me.stage * 4 + (turnNo <= 2 ? 8 : 0)) * pf.luck });
    cands.push({ kind: 'suicide', score: (alive.length === 2 && me.stage === 0) ? 40 : -500 });

    R.legalActions(me.stage, 'defense', 0).forEach(function (a) {
      var fit = 0.3;
      if (a.cat === 'physical') fit = mix.physical / mix.total;
      if (a.cat === 'curse') fit = mix.curse / mix.total;
      if (a.cat === 'celestial') fit = mix.celestial / mix.total;
      if (a.mode === 'absolute') fit = Math.max(fit, 0.5);
      /* 习惯：大家默认更爱防物理 */
      if (a.cat === 'physical') fit *= 1.25;
      cands.push({
        kind: 'defense', id: a.id,
        score: (14 + th * 45 * (0.3 + fit) - a.cost * 1.2) * pf.def * defenseBoost
      });
    });

    attackCandidates(me, state, level).forEach(function (c) {
      if (c.id === 'bean' || c.id === 'singleBean') {
        var bp = c.p || 0.1;
        cands.push({ kind: 'attack', id: c.id, targets: c.targets, score: (12 + 70 * bp) * pf.aggr * aggression });
        return;
      }
      var tgt = c.targets[0];
      var tp = state.players.find(function (p) { return p.id === tgt; });
      var a = R.act(c.id);
      var s = 45 + a.level * 4 - a.cost * 1.2;
      if (tp && tp.stage <= me.stage) s += 12;
      if (tp && tp.stage >= 2) s += level >= 2 ? 14 : -6;
      if (th > 0.55 && me.stage <= 1) s -= 10;
      cands.push({ kind: 'attack', id: c.id, targets: c.targets, score: s * pf.aggr * aggression });
    });

    /* 新手：给所有选项加巨大噪声，实质上就是乱出 */
    var sigma = level === 0 ? 55 : level === 1 ? 16 : 5;
    var scored = cands.map(function (c) { return { c: c, v: c.score + (rnd() - 0.5) * sigma * 2 }; });
    scored.sort(function (x, y) { return y.v - x.v; });
    var pick = scored[0].c;

    if (pick.kind === 'qi') return { kind: 'special', actionId: 'qi' };
    if (pick.kind === 'suicide') return { kind: 'special', actionId: 'suicide' };
    if (pick.kind === 'defense') return { kind: 'defense', strikes: [{ actionId: pick.id }] };
    return { kind: 'attack', strikes: [{ actionId: pick.id, targets: pick.targets }] };
  }

  BKB.ai = { decide: decide, threat: threat };
})(window.BKB);
