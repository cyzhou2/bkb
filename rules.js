/* běng-k-běng 规则引擎 — 与界面无关，可单独在控制台调试 */
window.BKB = window.BKB || {};
(function (BKB) {
  'use strict';

  var STAGE_UNITS = [1, 2, 4, 8, 16, 32, 64];
  var QI_LABEL = [0, 1, 2, 4, 6, 12, 24];
  var MAX_STAGE = 6;

  /* ---------------- 动作库 ---------------- */
  var ACTIONS = [
    /* 物理攻击 */
    { id: 'knife', name: '刀', kind: 'attack', cat: 'physical', level: 0, cost: 0.5, maxT: 2, minStage: 0, perTarget: true,
      desc: '两手各一刀：可合打一人，也可分打两人' },
    { id: 'spear', name: '枪（dia）', kind: 'attack', cat: 'physical', level: 0, cost: 1, maxT: 1, minStage: 0,
      desc: '两把刀打同一个人，dia～' },
    { id: 'sweep', name: '横扫', kind: 'attack', cat: 'physical', level: 0, cost: 2, maxT: 3, minStage: 1,
      desc: '横扫连续三人：以选中者为中心，左右各带一个；伤害等于一把枪，能被小反弹弹反' },
    { id: 'chopDown', name: '竖劈', kind: 'attack', cat: 'physical', level: 1, cost: 2, maxT: 1, minStage: 1,
      desc: '从上往下劈，位移躲不掉，只能用反弹挡' },
    { id: 'crossChop', name: '横劈', kind: 'attack', cat: 'physical', level: 4, cost: 16, maxT: 1, minStage: 4,
      desc: '高阶大招，6 气才解锁' },

    /* 法术攻击 */
    { id: 'curse0', name: '0 级诅咒', kind: 'attack', cat: 'curse', level: 0, cost: 1, maxT: 1, minStage: 0 },
    { id: 'curse1', name: '1 级诅咒', kind: 'attack', cat: 'curse', level: 1, cost: 2, maxT: 1, minStage: 1 },
    { id: 'curse2', name: '2 级诅咒', kind: 'attack', cat: 'curse', level: 2, cost: 4, maxT: 1, minStage: 2 },
    { id: 'curse3', name: '3 级诅咒', kind: 'attack', cat: 'curse', level: 3, cost: 8, maxT: 1, minStage: 3 },

    /* 特殊攻击：不算法术，任何防御都挡不了，只认三种状态 */
    { id: 'bean', name: '打豆豆', kind: 'attack', cat: 'exotic', level: 0, cost: 1, maxT: 2, minStage: 0, perTarget: true,
      desc: '只手一只豆：只杀正在运气的人、气功、咒术之刃；对其他人完全无效' },
    { id: 'singleBean', name: '单豆', kind: 'attack', cat: 'exotic', level: 0, cost: 0.5, maxT: 1, minStage: 0, perTarget: true,
      desc: '半个打豆豆：只杀运气/气功/咒术之刃，但一次只能点一个人' },

    /* 天体攻击 */
    { id: 'iceBall', name: '冰球', kind: 'attack', cat: 'celestial', element: 'ice', level: 1, cost: 2, maxT: 1, minStage: 1,
      desc: '单点天体；下地、冰盾可挡' },
    { id: 'fireBall', name: '火球', kind: 'attack', cat: 'celestial', element: 'fire', level: 1, cost: 2, maxT: 1, minStage: 1,
      desc: '单点天体；飞天、火盾可挡' },

    /* 防御 */
    { id: 'reboundS', name: '小反弹', kind: 'defense', cat: 'physical', mode: 'reflect', level: 0, cost: 1, maxT: 0, minStage: 0,
      desc: '同级物理打回来（口语直接喊「反弹」）' },
    { id: 'reboundM', name: '中反弹', kind: 'defense', cat: 'physical', mode: 'reflect', level: 1, cost: 2, maxT: 0, minStage: 1,
      desc: '最多反两枪，再多扛不住' },
    { id: 'reboundL', name: '大反弹', kind: 'defense', cat: 'physical', mode: 'reflect', level: 4, cost: 16, maxT: 0, minStage: 4,
      desc: '无限等级、无限数量物理全弹反' },
    { id: 'qigong', name: '气功', kind: 'defense', cat: 'physical', mode: 'absolute', level: 0, cost: 1, maxT: 0, minStage: 0,
      desc: '无限等级无限数量的物理全挡，但怕打豆豆' },
    { id: 'bless0', name: '0 级保佑', kind: 'defense', cat: 'curse', mode: 'shield', level: 0, cost: 1, maxT: 0, minStage: 0 },
    { id: 'bless1', name: '1 级保佑', kind: 'defense', cat: 'curse', mode: 'shield', level: 1, cost: 2, maxT: 0, minStage: 1 },
    { id: 'bless2', name: '2 级保佑', kind: 'defense', cat: 'curse', mode: 'shield', level: 2, cost: 4, maxT: 0, minStage: 2 },
    { id: 'bless3', name: '3 级保佑', kind: 'defense', cat: 'curse', mode: 'shield', level: 3, cost: 8, maxT: 0, minStage: 3 },
    { id: 'curseBlade', name: '咒术之刃', kind: 'defense', cat: 'curse', mode: 'absolute', level: 0, cost: 1, maxT: 0, minStage: 0,
      desc: '无限等级的诅咒全挡，同样怕打豆豆' },
    { id: 'iceShield', name: '冰盾', kind: 'defense', cat: 'celestial', mode: 'shield', level: 0, cost: 1, maxT: 0, minStage: 0,
      element: 'ice', desc: '只挡冰球' },
    { id: 'fireShield', name: '火盾', kind: 'defense', cat: 'celestial', mode: 'shield', level: 0, cost: 1, maxT: 0, minStage: 0,
      element: 'fire', desc: '只挡火球' },
    { id: 'fly', name: '飞天', kind: 'defense', cat: 'move', mode: 'dodge', level: 0, cost: 1, maxT: 0, minStage: 0,
      dodge: ['knife', 'spear', 'sweep', 'crossChop', 'fireBall'], desc: '躲刀枪横扫横劈与火球' },
    { id: 'ground', name: '下地', kind: 'defense', cat: 'move', mode: 'dodge', level: 0, cost: 1, maxT: 0, minStage: 0,
      dodge: ['knife', 'spear', 'sweep', 'crossChop', 'iceBall'], desc: '躲刀枪横扫横劈与冰球' },

    /* 特殊 */
    { id: 'qi', name: '运气', kind: 'special', cat: 'qi', level: 0, cost: 0, maxT: 0, minStage: 0,
      desc: '升一阶：行动力翻倍。全场有人出局则气归零' },
    { id: 'suicide', name: '自杀', kind: 'special', cat: 'suicide', level: 0, cost: 0, maxT: 0, minStage: 0,
      desc: '吃到物理攻击则攻击者死且自己无敌，否则自己死' }
  ];

  var BY_ID = {};
  ACTIONS.forEach(function (a) { BY_ID[a.id] = a; });

  /* 等效伤害（"点数"）：两个互攻的人点数相等，就打成僵持、都不死。
     基准 1 点 = 一枪；横扫、竖劈是范围招，命中一人各算 1 点；
     冰球/火球 = 2，横劈 = 16。 */
  var DMG = {
    knife: 0.5, spear: 1, sweep: 1, chopDown: 1, crossChop: 16,
    curse0: 1, curse1: 2, curse2: 4, curse3: 8, iceBall: 2, fireBall: 2
  };
  ACTIONS.forEach(function (a) { if (DMG[a.id] != null) a.dmg = DMG[a.id]; });

  /* ---------------- 基础工具 ---------------- */
  function units(stage) { return STAGE_UNITS[Math.min(Math.max(stage, 0), MAX_STAGE)]; }
  function qiLabel(stage) { return QI_LABEL[Math.min(Math.max(stage, 0), MAX_STAGE)]; }
  function act(id) { return BY_ID[id]; }

  function intentCost(intent) {
    var total = 0;
    (intent.strikes || []).forEach(function (s) {
      var a = act(s.actionId);
      if (!a) return;
      var n = (s.targets && s.targets.length) || 1;
      /* 只有"一刀算半份"这种按人数计份的招式才乘目标数；横扫是一口气扫三人，仍算一份价 */
      total += a.cost * (a.perTarget ? n : 1);
    });
    return total;
  }

  function legalActions(stage, kind, spent) {
    var left = units(stage) - (spent || 0);
    return ACTIONS.filter(function (a) {
      if (a.kind !== kind) return false;
      if (a.minStage > stage) return false;
      if (a.kind === 'special') return true;
      if (a.cost > left) return false;
      return true;
    });
  }

  /* ---------------- 回合结算 ---------------- */
  function resolveTurn(players, intents) {
    var byId = {};
    players.forEach(function (p) { byId[p.id] = p; });
    var dead = {};
    var events = [];
    var suicideHit = {};

    function log(text, cls) { events.push({ text: text, cls: cls || '' }); }
    function kill(id, reason) {
      if (dead[id]) return;
      var p = byId[id];
      if (!p || !p.alive) return;
      dead[id] = true;
      log('☠ ' + p.name + ' 出局 — ' + reason, 'bad');
    }

    function defensesOf(id) {
      var it = intents[id];
      if (!it || it.kind !== 'defense') return [];
      return (it.strikes || []).map(function (s) { return act(s.actionId); }).filter(Boolean);
    }

    function isSuicide(id) { var it = intents[id]; return it && it.kind === 'special' && it.actionId === 'suicide'; }

    /* 0) 互攻点数相等 → 势均力敌，这一击互相抵消 */
    var dirDmg = {};
    players.forEach(function (attacker) {
      var it = intents[attacker.id];
      if (!it || it.kind !== 'attack') return;
      (it.strikes || []).forEach(function (s) {
        var a = act(s.actionId);
        if (!a || a.cat === 'exotic') return;
        var dmg = a.dmg != null ? a.dmg : 0;
        (s.targets || []).forEach(function (tid) {
          var k = attacker.id + '>' + tid;
          dirDmg[k] = (dirDmg[k] || 0) + dmg;
        });
      });
    });
    /* 互攻：点数相等 → 双方抵消；点数不等 → 低的那一击直接作废，高的照常生效 */
    var cancel = {};
    var voidKind = {};
    Object.keys(dirDmg).forEach(function (k) {
      var parts = k.split('>');
      var rev = parts[1] + '>' + parts[0];
      if (dirDmg[rev] == null) return;
      if (cancel[k] || cancel[rev]) return;
      var mine = dirDmg[k], theirs = dirDmg[rev];
      if (Math.abs(mine - theirs) < 1e-9) {
        cancel[k] = true; cancel[rev] = true; voidKind[k] = 'equal';
      } else if (mine > theirs) {
        cancel[rev] = true; voidKind[rev] = 'weaker';
      } else {
        cancel[k] = true; voidKind[k] = 'weaker';
      }
    });
    var cancelLogged = {};

    /* 1) 自杀登记 + 运气升阶（先升阶，再挨打：升完的这一阶当回合就算数） */
    players.forEach(function (p) {
      if (!p.alive) return;
      if (isSuicide(p.id)) log('💀 ' + p.name + ' 喊出「自杀」', 'warn');
      var it = intents[p.id];
      if (it && it.kind === 'special' && it.actionId === 'qi') p.stage = Math.min(p.stage + 1, MAX_STAGE);
    });

    /* 有气者的自动防御：物理 / 诅咒 / 天体各有一份"全能防御值"，
       值 = 阶位 - 1 点（1 点 = 一枪），按点数消耗；只能挡低两级以上的招。
       但这一回合如果在攻击，真气被牵动 → 不设防。 */
    var autoCap = {};
    function tryAuto(id, d, attack) {
      var it = intents[id];
      if (it && it.kind === 'attack') return false;
      if (d.stage < 2) return false;
      if (['physical', 'curse', 'celestial'].indexOf(attack.cat) < 0) return false;
      if (attack.level > d.stage - 2) return false;
      var cost = attack.dmg != null ? attack.dmg : 1;
      var key = id + '|' + attack.cat;
      var cap = d.stage - 1;
      var used = autoCap[key] || 0;
      if (used + cost > cap + 1e-9) return false;
      autoCap[key] = used + cost;
      return true;
    }

    /* 命中一个目标，返回 'blocked' | 'reflected' | 'killed' */
    function strike(defenderId, attack, attackerId) {
      var d = byId[defenderId];
      if (!d || !d.alive || dead[defenderId]) return 'killed';

      /* 互攻：点数相同僵持，点数低的一击作废 */
      if (cancel[attackerId + '>' + defenderId]) {
        var ck = attackerId < defenderId ? attackerId + '|' + defenderId : defenderId + '|' + attackerId;
        if (!cancelLogged[ck]) {
          cancelLogged[ck] = true;
          var an0 = byId[attackerId] ? byId[attackerId].name : '？';
          var mine0 = dirDmg[attackerId + '>' + defenderId] || 0;
          var theirs0 = dirDmg[defenderId + '>' + attackerId] || 0;
          if (voidKind[attackerId + '>' + defenderId] === 'equal') {
            log('⚔ ' + an0 + ' 与 ' + d.name + ' 点数相同（' + mine0 + ' 点），互相抵消、都不死', 'warn');
          } else {
            log('🗡 ' + an0 + '（' + mine0 + ' 点）低于 ' + d.name + '（' + theirs0 + ' 点），这一击作废', 'warn');
          }
        }
        return 'blocked';
      }

      if (isSuicide(defenderId)) {
        if (attack.cat === 'physical') { suicideHit[defenderId] = true; kill(attackerId, '自杀阵——反杀攻击者'); return 'reflected'; }
        return 'blocked';
      }

      /* 豆系：只认"正在运气 / 气功 / 咒术之刃"，其余人根本不用防 */
      if (attack.cat === 'exotic') {
        var ds0 = defensesOf(defenderId);
        var willLuck = intents[defenderId] && intents[defenderId].kind === 'special' && intents[defenderId].actionId === 'qi';
        var usedAbs = ds0.some(function (x) { return x.id === 'qigong' || x.id === 'curseBlade'; });
        if (willLuck) { kill(defenderId, '正在运气，被打豆豆无视等级直接带走'); return 'killed'; }
        if (usedAbs) { kill(defenderId, '用着气功/咒术之刃，被打豆豆清除'); return 'killed'; }
        return 'blocked';
      }

      var list = defensesOf(defenderId);

      function tryDefense(x) {
        if (attack.cat !== x.cat && x.cat !== 'move') return null;
        if (x.cat === 'move') {
          return (x.dodge || []).indexOf(attack.id) >= 0 ? 'blocked' : null;
        }
        if (x.cat === 'celestial' && x.element && attack.element && x.element !== attack.element) return null;
        if (x.mode === 'absolute') return 'blocked';
        /* 天体盾按属性对口即挡，不看等级 */
        if (x.cat === 'celestial') return 'blocked';
        if (x.mode === 'reflect') {
          if (x.id === 'reboundL') { kill(attackerId, '被大反弹弹反'); return 'reflected'; }
          if (attack.level < x.level) { kill(attackerId, '攻击低于防御，反噬'); return 'reflected'; }
          if (attack.level === x.level) { kill(attackerId, '被' + x.name + '弹反'); return 'reflected'; }
          kill(defenderId, '防御扛不住，破盾');
          return 'killed';
        }
        if (x.mode === 'shield') {
          if (attack.level > x.level) { kill(defenderId, x.name + '挡不住，破盾'); return 'killed'; }
          if (attack.level < x.level) { kill(attackerId, '攻击低于' + x.name + '，反噬'); return 'reflected'; }
          return 'blocked';
        }
        return null;
      }

      var best = null;
      var broke = false;
      list.forEach(function (x) {
        var r = tryDefense(x);
        if (!r) return;
        if (r === 'killed') { broke = true; return; }
        if (r === 'reflected') best = 'reflected';
        else if (!best) best = 'blocked';
      });
      if (broke) { kill(defenderId, '防御被破盾'); return 'killed'; }
      if (best) {
        if (best === 'reflected') {
          var an2 = byId[attackerId] ? byId[attackerId].name : '？';
          log('↩ ' + d.name + ' 挡下并弹反了 ' + an2 + ' 的' + attack.name, 'good');
        } else {
          log('🛡 ' + d.name + ' 用防御挡下' + attack.name, 'good');
        }
        return best;
      }

      /* 有气者的自动防御 */
      if (tryAuto(defenderId, d, attack)) {
        log('✨ ' + d.name + '凭' + qiLabel(d.stage) + '气自动挡下' + attack.name, 'good');
        return 'blocked';
      }

      kill(defenderId, '没有对应防御，被' + attack.name + '击中');
      return 'killed';
    }

    /* 2) 逐个攻击结算（同时出手：先死的人这一击照样打得出去） */
    players.forEach(function (attacker) {
      if (!attacker.alive) return;
      var it = intents[attacker.id];
      if (!it || it.kind !== 'attack') return;
      (it.strikes || []).forEach(function (s) {
        var a = act(s.actionId);
        if (!a) return;
        (s.targets || []).forEach(function (tid) {
          if (!byId[tid] || !byId[tid].alive) return;
          strike(tid, a, attacker.id);
        });
      });
    });

    /* 3) 自杀结算：没吃到物理攻击就自己死 */
    players.forEach(function (p) {
      if (!p.alive || !isSuicide(p.id)) return;
      if (!dead[p.id] && !suicideHit[p.id]) kill(p.id, '自杀未遇到物理攻击');
    });

    /* 4) 死亡结算 → 有人出局则全场气归零 */
    var anyDead = Object.keys(dead).length > 0;
    players.forEach(function (p) {
      if (dead[p.id]) { p.alive = false; p.stage = 0; }
    });
    if (anyDead) {
      players.forEach(function (p) { if (p.alive) p.stage = 0; });
      log('🌪 有人出局 → 全场的气归零', 'warn');
    }

    return { events: events, dead: Object.keys(dead) };
  }

  BKB.rules = {
    ACTIONS: ACTIONS, act: act, units: units, qiLabel: qiLabel,
    intentCost: intentCost, legalActions: legalActions,
    resolveTurn: resolveTurn, MAX_STAGE: MAX_STAGE, STAGE_UNITS: STAGE_UNITS
  };
})(window.BKB);
