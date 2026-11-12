/* ============================================================
   闻息 · scentviz.js  v3
   香方配比可视化：环形分段（弧长 = ratio）+ 环内香雾流体 + 图例
   ------------------------------------------------------------
   对外 API（全局 window.ScentViz）：
     ScentViz.init(vizEl, legendEl)   初始化；可重复调用（幂等）
     ScentViz.set(list)               list = [{key,name,ratio,color}]
                                      配比按 0~1 传入，内部归一化；
                                      可先于 init 调用（自动暂存）
     ScentViz.setBreath(v)            0~1，跟随呼吸轻微脉动，可每帧调
     ScentViz.pulse()                 系统建议变化时的一次强调（涟漪）
     ScentViz.destroy()               销毁并解绑全部监听

   技术约束：纯静态 · 零依赖 · 无 import/export/fetch · ES5
             单 rAF 循环 · devicePixelRatio ≤ 2 · 粒子 54 ≤ 80
             容器隐藏 / 页面不可见时停止 rAF，不空转
             prefers-reduced-motion 时降级为静态环

   主题：颜色全部从 style.css 的 CSS 变量读取（--bg-0 / --line /
         --text / --gold / --gold-hi …），本文件不写死深色。
         暗主题：香雾用加法混色发光（'lighter'）
         亮主题：香雾用纸上淡彩叠加（'source-over'），环体加深以压住纸底
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
     0. 常量
     ============================================================ */
  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;
  var MAX_DPR = 2;

  var VEIL_N = 3;      // 大香团（颜色直接对应配比项）
  var DRIFT_N = 27;    // 流动雾团
  var MOTE_N = 24;     // 细小微尘
  var PARTICLE_TOTAL = VEIL_N + DRIFT_N + MOTE_N;   // 54，远低于 80 上限

  var GAP_DEG = 1.6;   // 分段缝隙（1~2°）
  var TICK_N = 72;     // 环外刻度：每 5°
  var RING_RATIO = 0.725;
  var PULSE_DUR = 0.95;
  var MOTE_RECOLOR_EVERY = 0.55;

  var DEFAULT_ITEMS = [
    { key: 'chenxiang', name: '沉香', ratio: 0.40, color: '#C9A063' },
    { key: 'zhuqing',   name: '竹青', ratio: 0.40, color: '#7A9E7E' },
    { key: 'longnao',   name: '龙脑', ratio: 0.20, color: '#C05A4E' }
  ];
  var FALLBACK_COLORS = ['#C9A063', '#7A9E7E', '#C05A4E', '#A63A2C', '#8C7F6A', '#4A6B8A'];

  /* 刻度方向预计算（角度固定，只有半径随尺寸/脉动变化） */
  var TICKS = (function () {
    var out = [], i, a;
    for (i = 0; i < TICK_N; i++) {
      a = -Math.PI / 2 + i * TAU / TICK_N;
      out.push({
        c: Math.cos(a),
        s: Math.sin(a),
        cls: (i % 18 === 0) ? 0 : ((i % 6 === 0) ? 1 : 2)
      });
    }
    return out;
  })();

  /* rAF 兜底（极端环境无 requestAnimationFrame 时用定时器） */
  var raf = window.requestAnimationFrame
    ? function (cb) { return window.requestAnimationFrame(cb); }
    : function (cb) {
        return window.setTimeout(function () {
          cb(new Date().getTime());
        }, 16);
      };
  var caf = window.cancelAnimationFrame
    ? function (id) { window.cancelAnimationFrame(id); }
    : function (id) { window.clearTimeout(id); };

  /* ============================================================
     1. 模块状态
     ============================================================ */
  var inited = false;
  var vizEl = null;
  var legendEl = null;
  var stageEl = null;
  var canvas = null;
  var ctx = null;

  var W = 0, H = 0, cx = 0, cy = 0, baseR = 0, ringR = 0, ringW = 7, innerR = 0, dpr = 1;

  var items = [];              // 每一项：key/name/color/rgb/tgt/cur/legend DOM 引用
  var pendingList = null;      // init 之前的 set()
  var pendingBreath = null;

  var veils = [];              // 3 个大香团
  var particles = [];          // 27 雾团 + 24 微尘
  var spriteCache = {};        // 颜色字符串 -> 预渲染柔光精灵
  var recolorLeft = 0;         // 强制换色队列（主题/香方项变化时）
  var recolorCursor = 0;
  var moteAcc = 0;
  var moteCursor = 0;

  var time = 0;
  var lastTs = 0;
  var breath = 0.4;
  var breathTarget = 0.4;
  var pulseStart = -999;
  var rafId = 0;
  var visible = false;
  var reduced = false;
  var drawn = false;

  var palette = null;

  var ro = null, io = null, themeObs = null, motionMq = null;
  var motionHandler = null, visHandler = null, winResize = null;

  /* ============================================================
     2. 工具：数学 / 颜色 / 噪声
     ============================================================ */
  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function smoothstep(a, b, x) {
    if (b === a) return x < a ? 0 : 1;
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return t * t * (3 - 2 * t);
  }

  function parseColor(c) {
    if (!c) return null;
    var s = String(c).replace(/^\s+|\s+$/g, '');
    if (!s) return null;
    if (s.charAt(0) === '#') {
      var h = s.slice(1);
      if (h.length === 3 || h.length === 4) {
        return [
          parseInt(h.charAt(0) + h.charAt(0), 16),
          parseInt(h.charAt(1) + h.charAt(1), 16),
          parseInt(h.charAt(2) + h.charAt(2), 16)
        ];
      }
      if (h.length >= 6) {
        return [
          parseInt(h.slice(0, 2), 16),
          parseInt(h.slice(2, 4), 16),
          parseInt(h.slice(4, 6), 16)
        ];
      }
      return null;
    }
    var m = s.match(/rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i);
    if (m) {
      return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
    }
    return null;
  }

  function rgba(rgb, a) {
    a = a < 0 ? 0 : (a > 1 ? 1 : a);
    a = Math.round(a * 1000) / 1000;
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (a % 1 === 0 ? a + '.0' : a) + ')';
  }

  function mixRgb(a, b, k) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * k),
      Math.round(a[1] + (b[1] - a[1]) * k),
      Math.round(a[2] + (b[2] - a[2]) * k)
    ];
  }

  function luminance(rgb) {
    return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  }

  /* 轻量 2D value noise（0~1），够香雾这种极慢流场用，零依赖 */
  function hash2(x, y) {
    var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function vnoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf);
    var v = yf * yf * (3 - 2 * yf);
    var a = hash2(xi, yi);
    var b = hash2(xi + 1, yi);
    var c = hash2(xi, yi + 1);
    var d = hash2(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  function pulseEnv() {
    if (pulseStart < 0) return 0;
    var k = (time - pulseStart) / PULSE_DUR;
    if (k <= 0 || k >= 1) return 0;
    if (k < 0.16) return k / 0.16;
    var u = (k - 0.16) / 0.84;
    return (1 - u) * (1 - u);
  }

  function sumRatio() {
    var s = 0, i;
    for (i = 0; i < items.length; i++) {
      if (items[i].cur > 0) s += items[i].cur;
    }
    return s;
  }

  function mixColor(sum) {
    if (!palette) readPalette();
    if (!sum || sum <= 0.0001) return palette ? palette.gold : [201, 160, 99];
    var r = 0, g = 0, b = 0, i, it, k;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      k = Math.max(0, it.cur);
      r += it.rgb[0] * k;
      g += it.rgb[1] * k;
      b += it.rgb[2] * k;
    }
    return [Math.round(r / sum), Math.round(g / sum), Math.round(b / sum)];
  }

  /* ============================================================
     3. 主题取色：只读 CSS 变量
     ============================================================ */
  function readPalette() {
    var cs;
    try {
      cs = window.getComputedStyle(document.documentElement);
    } catch (e) {
      cs = null;
    }
    var csBody = null;
    if (document.body) {
      try { csBody = window.getComputedStyle(document.body); } catch (e2) { csBody = null; }
    }

    function grab(name) {
      var v = cs ? cs.getPropertyValue(name) : '';
      if (!v && csBody) v = csBody.getPropertyValue(name);
      return v ? String(v).replace(/^\s+|\s+$/g, '') : '';
    }

    var themeAttr = (document.documentElement && document.documentElement.getAttribute('data-theme')) || '';
    if (!themeAttr && document.body) {
      themeAttr = document.body.getAttribute('data-theme') || '';
    }

    var bg = parseColor(grab('--bg-0'));
    var light = bg ? (luminance(bg) > 0.5) : (themeAttr === 'day');

    var gold = parseColor(grab('--gold')) || (light ? [169, 120, 47] : [201, 160, 99]);
    var goldHi = parseColor(grab('--gold-hi')) || (light ? [192, 138, 62] : [228, 192, 137]);
    var line = parseColor(grab('--line')) || gold;
    var text = parseColor(grab('--text')) || (light ? [46, 40, 32] : [230, 220, 200]);

    palette = {
      light: light,
      gold: gold,
      goldHi: goldHi,
      line: line,
      text: text,
      fogBlend: light ? 'source-over' : 'lighter',
      fogScale: light ? 1.6 : 1.2,
      ringAlpha: light ? 0.94 : 0.90,
      edgeAlpha: light ? 0.55 : 0.42,
      tickBoost: light ? 1.3 : 1
    };
    return palette;
  }

  /* ============================================================
     4. 香方数据：归一化 / 应用 / 缓动
     ============================================================ */
  function normalizeList(list) {
    var out = [], sum = 0, i, it, r, key, color;
    if (!list || typeof list.length !== 'number') return out;
    for (i = 0; i < list.length; i++) {
      it = list[i];
      if (!it || typeof it !== 'object') continue;
      r = +it.ratio;
      if (!isFinite(r) || r < 0) r = 0;
      key = (it.key === 0 || it.key) ? String(it.key) : ('scent' + i);
      color = it.color ? String(it.color) : FALLBACK_COLORS[i % FALLBACK_COLORS.length];
      if (!parseColor(color)) color = FALLBACK_COLORS[i % FALLBACK_COLORS.length];
      out.push({
        key: key,
        name: it.name ? String(it.name) : key,
        ratio: r,
        color: color
      });
      sum += r;
    }
    if (!out.length) return out;
    if (sum <= 0) {
      for (i = 0; i < out.length; i++) out[i].ratio = 1 / out.length;
    } else {
      for (i = 0; i < out.length; i++) out[i].ratio = out[i].ratio / sum;
    }
    return out;
  }

  function fallbackColorAt(index) {
    return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
  }

  function makeItem(src, order) {
    var rgb = parseColor(src.color) || parseColor(fallbackColorAt(order)) || [201, 160, 99];
    return {
      key: src.key,
      name: src.name,
      color: src.color,
      rgb: rgb,
      tgt: src.ratio,
      cur: 0,
      order: order,
      dead: false,
      seen: true,
      el: null,
      swEl: null,
      nameEl: null,
      pctEl: null,
      pctNum: null,
      shownPct: -1,
      shownColor: ''
    };
  }

  function removeItemAt(index) {
    var it = items[index];
    if (!it) return;
    if (it.el && it.el.parentNode) it.el.parentNode.removeChild(it.el);
    it.el = null;
    items.splice(index, 1);
  }

  function applyList(list, immediate) {
    var i, j, src, old, order = 0;
    var keysChanged = false;
    var colorChanged = false;

    for (i = 0; i < items.length; i++) items[i].seen = false;

    for (i = 0; i < list.length; i++) {
      src = list[i];
      old = null;
      for (j = 0; j < items.length; j++) {
        if (items[j].key === src.key) { old = items[j]; break; }
      }
      if (old) {
        old.seen = true;
        if (old.order !== order) keysChanged = true;   // 顺序变了，图例 DOM 需要重排
        old.order = order++;
        old.dead = false;
        if (old.name !== src.name) {
          old.name = src.name;
          if (old.nameEl) old.nameEl.textContent = src.name;
        }
        if (old.color !== src.color) {
          old.color = src.color;
          old.rgb = parseColor(src.color) || old.rgb;
          colorChanged = true;
          if (old.swEl) {
            old.swEl.style.setProperty('--sv-c', old.color);
            old.shownColor = old.color;
          }
        }
        old.tgt = src.ratio;
        if (immediate) old.cur = src.ratio;
      } else {
        old = makeItem(src, order++);
        if (immediate) old.cur = old.tgt;
        items.push(old);
        keysChanged = true;
      }
    }

    for (i = items.length - 1; i >= 0; i--) {
      if (!items[i].seen) {
        if (immediate) {
          removeItemAt(i);
        } else {
          items[i].dead = true;
          items[i].tgt = 0;
        }
      }
    }

    items.sort(function (a, b) { return a.order - b.order; });

    if (!immediate && (keysChanged || colorChanged)) {
      recolorLeft = particles.length;
      recolorCursor = 0;
    }

    /* app.js 在配比过渡期每帧都会 set()：只有项数/顺序变化时才重建图例节点，
       颜色与百分比交给 syncLegend 增量改，避免逐帧 DOM 重建 */
    if (keysChanged || !legendEl || !legendEl.firstChild) rebuildLegend();
    syncLegend();
    requestDraw();
  }

  function set(list) {
    var norm = normalizeList(list);
    if (!norm.length) norm = normalizeList(DEFAULT_ITEMS);
    if (!inited) {
      pendingList = norm;
      return;
    }
    applyList(norm, false);
  }

  function setBreath(v) {
    var x = +v;
    if (!isFinite(x)) return;
    x = clamp01(x);
    if (!inited) {
      pendingBreath = x;
      return;
    }
    breathTarget = x;
    if (!reduced) startLoop();
  }

  function pulse() {
    if (!inited) return;
    pulseStart = time;
    requestDraw();
  }

  /* ============================================================
     5. 图例
     ============================================================ */
  function makeLegendItem(it, index) {
    var wrap = document.createElement('span');
    wrap.className = 'sv-leg';
    wrap.setAttribute('role', 'listitem');
    wrap.setAttribute('data-key', it.key);
    if (index) wrap.style.animationDelay = (index * 70) + 'ms';

    var sw = document.createElement('i');
    sw.className = 'sv-swatch';
    sw.style.setProperty('--sv-c', it.color);

    var nm = document.createElement('b');
    nm.className = 'sv-name';
    nm.textContent = it.name;

    var pc = document.createElement('em');
    pc.className = 'sv-pct';
    var num = document.createTextNode(String(Math.round(it.cur * 100)));
    var unit = document.createElement('span');
    unit.className = 'sv-pct-u';
    unit.textContent = '%';
    pc.appendChild(num);
    pc.appendChild(unit);

    wrap.appendChild(sw);
    wrap.appendChild(nm);
    wrap.appendChild(pc);

    it.el = wrap;
    it.swEl = sw;
    it.nameEl = nm;
    it.pctEl = pc;
    it.pctNum = num;
    it.shownPct = Math.round(it.cur * 100);
    it.shownColor = it.color;
    return wrap;
  }

  function rebuildLegend() {
    if (!legendEl) return;
    if (!legendEl.getAttribute('role')) legendEl.setAttribute('role', 'list');

    var i, it, keep = [];
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (!it.el) makeLegendItem(it, i);
      if (it.nameEl && it.nameEl.textContent !== it.name) it.nameEl.textContent = it.name;
      if (it.swEl && it.shownColor !== it.color) {
        it.swEl.style.setProperty('--sv-c', it.color);
        it.shownColor = it.color;
      }
      keep.push(it.el);
      legendEl.appendChild(it.el);   // appendChild 会移动节点，天然完成排序
    }

    var ch = legendEl.childNodes, j;
    for (j = ch.length - 1; j >= 0; j--) {
      if (ch[j].nodeType === 1 && keep.indexOf(ch[j]) === -1) {
        legendEl.removeChild(ch[j]);
      }
    }
  }

  function syncLegend() {
    var i, it, pct;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (!it.pctNum) continue;
      pct = Math.round(clamp01(it.cur) * 100);
      if (pct !== it.shownPct) {
        it.pctNum.nodeValue = String(pct);
        it.shownPct = pct;
      }
      if (it.nameEl && it.nameEl.textContent !== it.name) {
        it.nameEl.textContent = it.name;
      }
      if (it.swEl && it.shownColor !== it.color) {
        it.swEl.style.setProperty('--sv-c', it.color);
        it.shownColor = it.color;
      }
    }
  }

  /* ============================================================
     6. 香雾：柔光精灵 / 粒子
     ============================================================ */
  function getSprite(colorStr) {
    var sp = spriteCache[colorStr];
    if (sp) return sp;
    var size = 96;
    var c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    var g = c.getContext ? c.getContext('2d') : null;
    if (!g) return null;
    var rgb = parseColor(colorStr) || [201, 160, 99];
    var grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, rgba(rgb, 0.62));
    grad.addColorStop(0.40, rgba(rgb, 0.23));
    grad.addColorStop(0.74, rgba(rgb, 0.060));
    grad.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    spriteCache[colorStr] = c;
    return c;
  }

  function pickColor() {
    var i, total = 0;
    for (i = 0; i < items.length; i++) total += Math.max(0, items[i].cur);
    if (total <= 0.0001) return items.length ? items[0].color : FALLBACK_COLORS[0];
    var x = Math.random() * total;
    for (i = 0; i < items.length; i++) {
      x -= Math.max(0, items[i].cur);
      if (x <= 0) return items[i].color;
    }
    return items[items.length - 1].color;
  }

  function buildVeils() {
    veils = [];
    for (var i = 0; i < VEIL_N; i++) {
      veils.push({
        ang: i * (TAU / VEIL_N) + 0.55,
        rf: 0.16 + i * 0.08,
        vr: 0.0035 + i * 0.0015,
        av: 0.0040 + i * 0.0007,
        sz: 0.60 + i * 0.08,
        nx: 11 + i * 37.9,
        ny: 7 + i * 21.3,
        a: 0.105
      });
    }
  }

  function makeParticle(kind) {
    var drift = kind === 0;
    return {
      kind: kind,
      ang: Math.random() * TAU,
      rf: drift ? (0.10 + Math.random() * 0.72) : (0.16 + Math.random() * 0.76),
      rfMin: drift ? 0.09 : 0.14,
      rfMax: drift ? 0.86 : 0.94,
      vr: (Math.random() - 0.5) * (drift ? 0.006 : 0.010),
      av: (Math.random() - 0.5) * (drift ? 0.012 : 0.020) - 0.004,
      sz: drift ? (0.13 + Math.random() * 0.22) : (0.016 + Math.random() * 0.040),
      a: drift ? (0.070 * (0.75 + Math.random() * 0.5)) : (0.200 * (0.70 + Math.random() * 0.60)),
      nx: Math.random() * 200,
      ny: Math.random() * 200,
      color: pickColor()
    };
  }

  function buildParticles() {
    particles = [];
    var i;
    for (i = 0; i < DRIFT_N; i++) particles.push(makeParticle(0));
    for (i = 0; i < MOTE_N; i++) particles.push(makeParticle(1));
  }

  function updateFog(dt) {
    var i, v, p, n1, n2;

    for (i = 0; i < veils.length; i++) {
      v = veils[i];
      v.ang += (v.av + (vnoise(v.nx + time * 0.011, v.ny - time * 0.007) - 0.5) * 0.006) * dt;
      v.rf += (v.vr + (vnoise(v.nx - 13.1, v.ny + time * 0.009) - 0.5) * 0.006) * dt;
      if (v.rf < 0.12) { v.rf = 0.12; v.vr = Math.abs(v.vr); }
      else if (v.rf > 0.44) { v.rf = 0.44; v.vr = -Math.abs(v.vr); }
    }

    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      n1 = vnoise(p.nx + time * 0.013, p.ny - time * 0.010);
      n2 = vnoise(p.nx * 1.7 + 31.4, p.ny * 1.7 + time * 0.008);
      p.ang += (p.av + (n1 - 0.5) * 0.012 + (n2 - 0.5) * 0.006) * dt;
      p.rf += (p.vr + (n2 - 0.5) * 0.014) * dt;
      if (p.rf < p.rfMin) { p.rf = p.rfMin; p.vr = Math.abs(p.vr); }
      else if (p.rf > p.rfMax) { p.rf = p.rfMax; p.vr = -Math.abs(p.vr); }
    }

    /* 主题切换 / 香方项变化：分批重取颜色，避免一次性跳色 */
    if (recolorLeft > 0 && particles.length) {
      var steps = 2;
      while (steps-- > 0 && recolorLeft > 0) {
        recolorLeft--;
        particles[recolorCursor % particles.length].color = pickColor();
        recolorCursor++;
      }
    }

    /* 微尘缓慢换色：香雾里的颜色长期缓慢地跟着配比流动 */
    if (items.length > 1 && particles.length) {
      moteAcc += dt;
      if (moteAcc >= MOTE_RECOLOR_EVERY) {
        moteAcc = 0;
        var guard = 0;
        while (guard++ < particles.length) {
          var idx = moteCursor % particles.length;
          moteCursor++;
          if (particles[idx].kind === 1) {
            particles[idx].color = pickColor();
            break;
          }
        }
      }
    }
  }

  /* ============================================================
     7. 画布尺寸 / 舞台
     ============================================================ */
  function buildStage() {
    if (!vizEl) return;
    stageEl = document.createElement('div');
    stageEl.className = 'sv-stage';
    canvas = document.createElement('canvas');
    canvas.className = 'sv-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('role', 'presentation');
    stageEl.appendChild(canvas);
    vizEl.appendChild(stageEl);

    ctx = canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) {
      var note = document.createElement('p');
      note.className = 'sv-noctx';
      note.textContent = '当前浏览器不支持 Canvas';
      vizEl.appendChild(note);
    }
  }

  function resize() {
    if (!vizEl || !canvas) return false;
    var w = vizEl.clientWidth || 0;
    var h = vizEl.clientHeight || 0;
    if (w < 40 || h < 40) {
      W = 0;
      H = 0;
      return false;
    }
    W = w;
    H = h;
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (dpr < 1) dpr = 1;

    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cx = W / 2;
    cy = H / 2;
    baseR = Math.min(W, H) / 2;
    ringR = baseR * RING_RATIO;
    ringW = Math.max(4.5, Math.min(10, ringR * 0.105));
    innerR = Math.max(10, ringR - ringW * 0.5 - 6);
    return true;
  }

  function hasSize() {
    return !!(vizEl && (vizEl.clientWidth || 0) > 40 && (vizEl.clientHeight || 0) > 40);
  }

  /* ============================================================
     8. 绘制
     ============================================================ */
  function strokeArc(r, a0, a1) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1, false);
    ctx.stroke();
  }

  function strokeCircle(r) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU, false);
    ctx.stroke();
  }

  function radialLine(a, r0, r1) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }

  /* 环内底色：一层极淡的"香心"暖光，让雾有落脚的底 */
  function drawAura(sum) {
    var mix = mixColor(sum);
    var env = pulseEnv();
    var a = (palette.light ? 0.035 : 0.090) + breath * 0.030 + env * 0.050;
    var r = Math.max(4, innerR * 1.02);
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(mix, a));
    g.addColorStop(0.55, rgba(mix, a * 0.38));
    g.addColorStop(1, rgba(mix, 0));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU, false);
    ctx.fillStyle = g;
    ctx.fill();
  }

  /* 香雾流体：3 个大香团（颜色 = 配比项颜色，浓度跟随 ratio）+ 51 个流动粒子 */
  function drawFog(sum) {
    var clipR = ringR - ringW * 0.5 + 1.5;
    if (clipR < 8) return;

    var env = pulseEnv();
    var bfac = 0.84 + breath * 0.16 + env * 0.18;
    var scale = palette.fogScale;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, clipR, 0, TAU, false);
    ctx.clip();
    ctx.globalCompositeOperation = palette.fogBlend;

    var i, it, v, p, sp, pr, rr, x, y, rad, alpha, shim, edge;

    for (i = 0; i < veils.length; i++) {
      it = items[i];
      if (!it) continue;
      pr = sum > 0 ? Math.max(0, it.cur) / sum : 0;
      if (pr < 0.004) continue;
      v = veils[i];
      sp = getSprite(it.color);
      if (!sp) continue;
      rr = v.rf * innerR;
      x = cx + Math.cos(v.ang) * rr;
      y = cy + Math.sin(v.ang) * rr;
      rad = v.sz * innerR;
      shim = 0.72 + 0.28 * vnoise(v.nx + time * 0.021, v.ny - time * 0.017);
      alpha = v.a * (0.40 + 0.95 * pr) * shim * bfac * scale;
      if (alpha < 0.003) continue;
      ctx.globalAlpha = alpha > 0.9 ? 0.9 : alpha;
      ctx.drawImage(sp, x - rad, y - rad, rad * 2, rad * 2);
    }

    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      sp = getSprite(p.color);
      if (!sp) continue;
      rr = p.rf * innerR;
      x = cx + Math.cos(p.ang) * rr;
      y = cy + Math.sin(p.ang) * rr;
      rad = Math.max(1.4, p.sz * innerR);
      shim = 0.62 + 0.38 * vnoise(p.nx * 2.3 + 9.1, p.ny * 2.3 - time * 0.05);
      edge = 1 - 0.92 * smoothstep(0.78, 0.99, p.rf);
      alpha = p.a * shim * edge * bfac * scale;
      if (alpha < 0.004) continue;
      ctx.globalAlpha = alpha > 0.9 ? 0.9 : alpha;
      ctx.drawImage(sp, x - rad, y - rad, rad * 2, rad * 2);
    }

    ctx.restore();
  }

  /* 环形分段：每段弧长 = ratio，段间 1.6° 缝隙，细金线描边 + 端头金线 */
  function drawRing(sum) {
    if (sum < 0.0001) return;

    var env = pulseEnv();
    var light = palette.light;
    var rr = ringR * (1 + 0.010 * env + 0.006 * (breath - 0.5));
    var lw = ringW * (1 + 0.06 * env);
    var gap = GAP_DEG * DEG * (rr / ringR);
    var start = -Math.PI / 2;
    var i, it, ratio, span, a0, a1, rgb;

    /* 环外刻度：合批成 3 条 path（长 / 中 / 短），只 stroke 3 次 */
    drawTicks(rr, lw, env);

    for (i = 0; i < items.length; i++) {
      it = items[i];
      span = (sum > 0 ? Math.max(0, it.cur) / sum : 0) * TAU;
      if (span < 0.010) { start += span; continue; }

      a0 = start + gap * 0.5;
      a1 = start + span - gap * 0.5;
      if (a1 <= a0) {
        a0 = start + span * 0.15;
        a1 = start + span * 0.85;
      }

      rgb = it.rgb;
      if (light) rgb = mixRgb(rgb, palette.text, 0.20);

      /* 外侧柔光（暗主题才加，亮主题会显脏） */
      if (!light) {
        ctx.lineWidth = lw * 2.5;
        ctx.strokeStyle = rgba(rgb, 0.055 + env * 0.030);
        strokeArc(rr, a0, a1);
        ctx.lineWidth = lw * 1.6;
        ctx.strokeStyle = rgba(rgb, 0.100 + env * 0.040);
        strokeArc(rr, a0, a1);
      } else {
        ctx.lineWidth = lw * 2.2;
        ctx.strokeStyle = rgba(rgb, 0.055);
        strokeArc(rr, a0, a1);
      }

      /* 主体 */
      ctx.lineWidth = lw;
      ctx.strokeStyle = rgba(rgb, palette.ringAlpha - env * 0.10);
      strokeArc(rr, a0, a1);

      /* 内圈高光：让环看起来有厚度，而不是一条平色 */
      ctx.lineWidth = Math.max(0.8, lw * 0.22);
      ctx.strokeStyle = rgba(mixRgb(rgb, [255, 244, 224], 0.55), light ? 0.14 : 0.28);
      strokeArc(rr - lw * 0.20, a0, a1);

      /* 金色描边（内 + 外） */
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = rgba(palette.gold, palette.edgeAlpha);
      strokeArc(rr + lw * 0.5, a0, a1);
      strokeArc(rr - lw * 0.5, a0, a1);

      /* 端头金线：把每段的起止"描"出来 */
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(palette.goldHi, light ? 0.72 : 0.60);
      radialLine(a0, rr - lw * 0.82, rr + lw * 0.82);
      radialLine(a1, rr - lw * 0.82, rr + lw * 0.82);

      start += span;
    }
  }

  function drawTicks(rr, lw, env) {
    var light = palette.light;
    var r0 = rr + lw * 0.5 + 9;
    var boost = (1 + env * 0.6) * palette.tickBoost;
    var len = [9.5, 6.0, 3.0];
    var wid = [1.1, 0.95, 0.8];
    var alp = [0.40, 0.24, 0.12];
    var cls, i, t, r1;

    for (cls = 0; cls < 3; cls++) {
      ctx.beginPath();
      for (i = 0; i < TICKS.length; i++) {
        t = TICKS[i];
        if (t.cls !== cls) continue;
        r1 = r0 + len[cls];
        ctx.moveTo(cx + t.c * r0, cy + t.s * r0);
        ctx.lineTo(cx + t.c * r1, cy + t.s * r1);
      }
      ctx.lineWidth = wid[cls];
      ctx.strokeStyle = rgba(palette.gold, Math.min(1, alp[cls] * boost));
      ctx.stroke();
    }
  }

  /* 香心：跟呼吸一起明灭的一点金 */
  function drawCore() {
    var env = pulseEnv();
    var r = 1.7 + 2.4 * breath + env * 1.4;
    var haloR = Math.max(6, r * 8);
    var a = (palette.light ? 0.28 : 0.52) + env * 0.20;
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
    g.addColorStop(0, rgba(palette.goldHi, a));
    g.addColorStop(0.35, rgba(palette.goldHi, a * 0.26));
    g.addColorStop(1, rgba(palette.goldHi, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, haloR, 0, TAU, false);
    ctx.fill();

    ctx.fillStyle = rgba(mixRgb(palette.goldHi, [255, 250, 240], 0.45), 0.9);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0.8, r * 0.55), 0, TAU, false);
    ctx.fill();
  }

  /* 建议变化：两圈向外散开的金线涟漪 */
  function drawPulse() {
    if (pulseStart < 0) return;
    var k = (time - pulseStart) / PULSE_DUR;
    if (k <= 0 || k >= 1) return;
    var i, off, rr, alpha;
    for (i = 0; i < 2; i++) {
      off = k - i * 0.16;
      if (off <= 0) continue;
      rr = ringR + ringW * 0.5 + 12 + off * (ringR * 0.23);
      alpha = (1 - off) * (1 - off) * (i === 0 ? 0.42 : 0.22);
      ctx.lineWidth = i === 0 ? 1.1 : 0.8;
      ctx.strokeStyle = rgba(palette.goldHi, alpha);
      strokeCircle(rr);
    }
  }

  function reveal() {
    if (drawn || !vizEl) return;
    drawn = true;
    vizEl.classList.add('sv-in');
  }

  function drawFrame() {
    if (!ctx || !W || !H) return;
    if (!palette) readPalette();
    var sum = sumRatio();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    drawAura(sum);
    drawFog(sum);
    drawRing(sum);
    drawCore();
    drawPulse();
    reveal();
  }

  /* ============================================================
     9. 主循环 / 暂停策略
     ============================================================ */
  function update(dt) {
    var q = 1 - Math.exp(-dt * 3.4);
    var i, it;
    for (i = items.length - 1; i >= 0; i--) {
      it = items[i];
      it.cur += (it.tgt - it.cur) * q;
      if (Math.abs(it.tgt - it.cur) < 0.0006) it.cur = it.tgt;
      if (it.dead && it.cur < 0.0015) removeItemAt(i);
    }
    breath += (breathTarget - breath) * Math.min(1, dt * 5);
    updateFog(dt);
    syncLegend();
  }

  function snapItems() {
    var i;
    for (i = 0; i < items.length; i++) items[i].cur = items[i].tgt;
    for (i = items.length - 1; i >= 0; i--) {
      if (items[i].dead && items[i].cur < 0.0015) removeItemAt(i);
    }
    syncLegend();
  }

  function tick(ts) {
    rafId = 0;
    if (!inited) return;
    if (document.hidden || !visible || !W || !H) return;   // 不空转：交给 IO / visibilitychange 唤醒

    var dt = lastTs ? (ts - lastTs) / 1000 : 0.016;
    lastTs = ts;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.05) dt = 0.05;

    time += dt;
    update(dt);
    drawFrame();

    if (reduced) return;            // 降级为静态后不再逐帧
    rafId = raf(tick);
  }

  function startLoop() {
    if (!inited || reduced || rafId || !ctx) return;
    if (document.hidden || !visible) return;
    if (!W || !H) {
      if (!resize()) return;
    }
    lastTs = 0;
    rafId = raf(tick);
  }

  function stopLoop() {
    if (rafId) {
      caf(rafId);
      rafId = 0;
    }
  }

  function drawStatic() {
    if (!inited || !ctx || !W || !H) return;
    if (time < 0.8) time = 0.8;   // 固定在一个舒服的相位上
    drawFrame();
  }

  function requestDraw() {
    if (!inited) return;
    if (reduced) {
      snapItems();
      drawStatic();
    } else {
      startLoop();
    }
  }

  function setVisible(v) {
    v = !!v;
    if (v === visible) {
      if (v && !reduced) startLoop();
      return;
    }
    visible = v;
    if (!v) {
      stopLoop();
      return;
    }
    if (!resize()) return;
    if (reduced) {
      snapItems();
      drawStatic();
    } else {
      startLoop();
    }
  }

  function onResize() {
    if (!inited) return;
    if (!resize()) {
      stopLoop();
      return;
    }
    if (!io) setVisible(true);
    if (reduced) drawStatic();
    else startLoop();
  }

  function onThemeChange() {
    if (!inited) return;
    readPalette();
    spriteCache = {};           // 主题变了，雾的混合方式与明度也跟着变
    if (reduced) {
      snapItems();
      drawStatic();
    } else {
      startLoop();
    }
  }

  /* ============================================================
     10. 监听绑定
     ============================================================ */
  function bindObservers() {
    if (!vizEl) return;

    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(function () { onResize(); });
      ro.observe(vizEl);
    }

    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(function (entries) {
        var vis = false, i;
        for (i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) vis = true;
        }
        setVisible(vis);
      }, { threshold: 0 });
      io.observe(vizEl);
    }

    if (window.matchMedia) {
      motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
      reduced = !!motionMq.matches;
      motionHandler = function () {
        reduced = !!motionMq.matches;
        if (reduced) {
          stopLoop();
          snapItems();
          drawStatic();
        } else {
          requestDraw();
        }
      };
      if (motionMq.addEventListener) motionMq.addEventListener('change', motionHandler);
      else if (motionMq.addListener) motionMq.addListener(motionHandler);
    } else {
      reduced = false;
    }

    if (window.MutationObserver && document.documentElement) {
      themeObs = new MutationObserver(onThemeChange);
      themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      if (document.body) {
        themeObs.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
      }
    }

    winResize = function () { onResize(); };
    window.addEventListener('resize', winResize);

    visHandler = function () {
      if (document.hidden) stopLoop();
      else requestDraw();
    };
    document.addEventListener('visibilitychange', visHandler);
  }

  /* ============================================================
     11. 生命周期
     ============================================================ */
  function init(viz, legend) {
    var keepList = pendingList;
    var keepBreath = pendingBreath;

    destroy();
    pendingList = keepList;
    pendingBreath = keepBreath;

    vizEl = viz || document.getElementById('scentViz');
    legendEl = legend || document.getElementById('scentLegend');
    if (!vizEl) return false;

    inited = true;
    time = 0;
    lastTs = 0;
    pulseStart = -999;
    breath = 0.4;
    breathTarget = 0.4;
    drawn = false;
    visible = false;
    reduced = false;

    readPalette();
    buildStage();
    resize();

    items = [];
    var norm = pendingList || normalizeList(DEFAULT_ITEMS);
    pendingList = null;
    applyList(norm, true);

    buildVeils();
    buildParticles();

    var pv = pendingBreath;
    pendingBreath = null;
    if (pv != null) {
      breath = pv;
      breathTarget = pv;
    }

    bindObservers();
    setVisible(hasSize());
    if (reduced) {
      snapItems();
      drawStatic();
    }
    return true;
  }

  function destroy() {
    stopLoop();

    if (ro) { try { ro.disconnect(); } catch (e) {} ro = null; }
    if (io) { try { io.disconnect(); } catch (e) {} io = null; }
    if (themeObs) { try { themeObs.disconnect(); } catch (e2) {} themeObs = null; }

    if (motionMq && motionHandler) {
      if (motionMq.removeEventListener) motionMq.removeEventListener('change', motionHandler);
      else if (motionMq.removeListener) motionMq.removeListener(motionHandler);
    }
    motionMq = null;
    motionHandler = null;

    if (winResize) {
      window.removeEventListener('resize', winResize);
      winResize = null;
    }
    if (visHandler) {
      document.removeEventListener('visibilitychange', visHandler);
      visHandler = null;
    }

    if (stageEl && stageEl.parentNode) stageEl.parentNode.removeChild(stageEl);
    stageEl = null;
    canvas = null;
    ctx = null;

    if (vizEl) {
      vizEl.classList.remove('sv-in');
      var fb = vizEl.getElementsByClassName ? vizEl.getElementsByClassName('sv-noctx') : null;
      while (fb && fb.length) {
        if (fb[0].parentNode) fb[0].parentNode.removeChild(fb[0]);
        else break;
      }
    }

    if (legendEl) {
      legendEl.innerHTML = '';
      legendEl.removeAttribute('role');
    }

    items = [];
    veils = [];
    particles = [];
    spriteCache = {};
    recolorLeft = 0;
    recolorCursor = 0;
    moteAcc = 0;
    moteCursor = 0;

    W = 0; H = 0; cx = 0; cy = 0; dpr = 1;
    baseR = 0; ringR = 0; ringW = 7; innerR = 0;

    inited = false;
    drawn = false;
    visible = false;
    reduced = false;
    vizEl = null;
    legendEl = null;
    pendingList = null;
    pendingBreath = null;
  }

  /* ============================================================
     12. 对外 API
     ============================================================ */
  window.ScentViz = {
    init: init,
    set: set,
    setBreath: setBreath,
    pulse: pulse,
    destroy: destroy,
    version: 'v3',
    isReady: function () { return inited; },
    particleCount: PARTICLE_TOTAL
  };
})();
