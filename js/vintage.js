/* ============================================================
   闻息 · vintage.js
   手绘复古皮肤的交互层：
     · 背景暗纹随鼠标局部提色（边缘亮、进入控件复原）
     · 「更多」书页菜单
     · 主题 / 桌宠图标随状态切换
     · 长按完成的一瞬微光
     · 调节页：12 帧辛夷花呼吸、半圆配比拖点、三色浮瓣（可碰飞）
     · 记录页：月份标签
   不改变任何原有业务逻辑，只读取/同步 __wenxi 的状态。
   ============================================================ */
(function () {
  'use strict';

  var doc = document;
  var body = doc.body;
  var html = doc.documentElement;

  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---------------- 背景暗纹 · 鼠标局部提色 ---------------- */
  var bgLayer = $('.vintage-bg');
  var lastX = 0, lastY = 0, bgRaf = 0, bgIdle = 0;

  function isOverContent(t) {
    return !!(t && t.closest && t.closest(
      '.topbar, .view, .sheet, .ref-sheet, .snd-sheet, .coach-card, .safety, .suggest, .toast, .viewer'
    ));
  }

  function paintInk() {
    bgRaf = 0;
    if (!bgLayer) return;
    bgLayer.style.setProperty('--ink-x', lastX + 'px');
    bgLayer.style.setProperty('--ink-y', lastY + 'px');
  }

  doc.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    lastX = e.clientX;
    lastY = e.clientY;
    window.clearTimeout(bgIdle);
    var hot = !isOverContent(e.target);
    body.classList.toggle('is-ink-hot', hot);
    if (hot) {
      if (!bgRaf) bgRaf = window.requestAnimationFrame(paintInk);
      bgIdle = window.setTimeout(function () { body.classList.remove('is-ink-hot'); }, 900);
    }
  }, { passive: true });

  doc.addEventListener('pointerleave', function () {
    body.classList.remove('is-ink-hot');
  });

  /* ---------------- 更多 · 书页菜单 ---------------- */
  var moreBtn = $('#btnMore');
  var moreMenu = $('#moreMenu');

  function setMore(on) {
    if (!moreBtn || !moreMenu) return;
    moreMenu.classList.toggle('is-on', !!on);
    moreMenu.setAttribute('aria-hidden', on ? 'false' : 'true');
    moreBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
  }

  if (moreBtn && moreMenu) {
    moreBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setMore(!moreMenu.classList.contains('is-on'));
    });
    doc.addEventListener('pointerdown', function (e) {
      if (!moreMenu.classList.contains('is-on')) return;
      if (moreMenu.contains(e.target) || moreBtn.contains(e.target)) return;
      setMore(false);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setMore(false);
    });
    // 菜单里点任何一项都先收起纸页
    $$('button', moreMenu).forEach(function (b) {
      b.addEventListener('click', function () {
        window.setTimeout(function () { setMore(false); }, 60);
      });
    });
  }

  /* ---------------- 主题 / 桌宠图标 ---------------- */
  var themeIcon = $('#themeIcon');
  var petIcon = $('#petIcon');

  function syncTheme() {
    var night = html.getAttribute('data-theme') === 'night';

    if (themeIcon) {
      themeIcon.src = 'assets/vintage/icons/' + (night ? 'night' : 'day') + '.png';
      themeIcon.alt = '';
    }
    if (petIcon) petIcon.src = 'assets/vintage/icons/' + (night ? 'pet-night' : 'pet-day') + '.png';
    var caret = $('.tool-caret');
    if (caret) caret.src = 'assets/vintage/arrow/arrow-down-' + (night ? 'night' : 'day') + '.png';
  }

  new MutationObserver(syncTheme).observe(html, { attributes: true, attributeFilter: ['data-theme'] });
  syncTheme();


  /* ---------------- 长按烫金：按 --press 分段点亮 ----------------
     app.js 在 #censer 上写 --press(0..1)。CSS 的 min()/calc() 在部分
     Edge 版本里对 opacity 不生效，这里直接读值写 opacity。 */
  var glowTimer = 0;

  function glowRamp(v, from) {
    return Math.max(0, Math.min(1, (v - from) * 3.4));
  }

  function glowSync() {
    var c = doc.getElementById("censer");
    var petals = doc.querySelector(".glow-petals");
    var lid = doc.querySelector(".glow-lid");
    var base = doc.querySelector(".glow-base");
    if (!c) return;
    var p = parseFloat(c.style.getPropertyValue("--press")) || 0;
    var lit = body.classList.contains("is-lit");
    var igniting = body.classList.contains("is-igniting");
    if (petals) petals.style.opacity = lit ? "0.5" : String(glowRamp(p, 0));
    if (lid) lid.style.opacity = lit ? "0.22" : String(glowRamp(p, 0.30));
    if (base) base.style.opacity = lit ? "0.18" : String(glowRamp(p, 0.58));
    if (!lit && !igniting && p === 0) {
      if (petals) petals.style.opacity = "0";
      if (lid) lid.style.opacity = "0";
      if (base) base.style.opacity = "0";
    }
  }

  window.setInterval(glowSync, 100);

  /* ---------------- 长按完成的一瞬微光 ---------------- */
  var censer = $('#censer');
  var wasLit = body.classList.contains('is-lit');

  new MutationObserver(function () {
    var lit = body.classList.contains('is-lit');
    if (lit && !wasLit && censer) {
      censer.classList.add('is-flash');
      window.setTimeout(function () { censer.classList.remove('is-flash'); }, 260);
    }
    wasLit = lit;
  }).observe(body, { attributes: true, attributeFilter: ['class'] });

  /* ============================================================
     调节页：12 帧呼吸花 + 半圆配比 + 浮瓣
     ============================================================ */
  var FRAMES = 12;
  var flowerImg = $('#tuneFlowerImg');
  var tuneMain = $('#tuneMain');
  var petalCanvas = $('#petalLayer');
  var arcSvg = $('#mixArc');
  var handles = [$('#arcH0'), $('#arcH1')];
  var legend = $('#mixLegend');
  var viewAdjust = $('#view-adjust');

  var SEQ = [];
  var seqState = { raf: 0, start: 0, i0: -1, i1: -1, running: false };
  var SEQ_MS = 3600;          // 一轮 3.6 秒（交接说明的建议值）
  var frameA = $('#tuneFlowerA');
  var frameB = $('#tuneFlowerB');

  for (var i = 1; i <= FRAMES; i++) {
    var im = new Image();
    im.src = 'assets/vintage/flower/f' + (i < 10 ? '0' + i : i) + '.webp';
    SEQ.push(im);
  }

  function seqSrc(idx) {
    return 'assets/vintage/flower/f' + (idx < 9 ? '0' + (idx + 1) : (idx + 1)) + '.webp';
  }

  /* 12 帧只有 12 个关键姿态，直接换图会一顿一顿。
     这里用两张 img 叠着做连续交叉淡入：任意时刻只差一个混合量，
     观感是连续的，不需要更多素材。 */
  function seqTick(now) {
    if (!seqState.running) return;
    if (!seqState.start) seqState.start = now;
    var t = ((now - seqState.start) % SEQ_MS) / SEQ_MS;
    var pos = t * FRAMES;
    var i0 = Math.floor(pos) % FRAMES;
    var i1 = (i0 + 1) % FRAMES;
    var f = pos - Math.floor(pos);
    if (!frameA || !frameB) return;
    if (i0 !== seqState.i0) { frameA.src = seqSrc(i0); seqState.i0 = i0; }
    if (i1 !== seqState.i1) { frameB.src = seqSrc(i1); seqState.i1 = i1; }
    frameB.style.opacity = f.toFixed(3);
    seqState.raf = window.requestAnimationFrame(seqTick);
  }

  function startSequence() {
    if (seqState.running || !frameA) return;
    seqState.running = true;
    seqState.start = 0;
    seqState.raf = window.requestAnimationFrame(seqTick);
  }

  function stopSequence() {
    seqState.running = false;
    if (seqState.raf) window.cancelAnimationFrame(seqState.raf);
    seqState.raf = 0;
  }

  /* ---------- 半圆配比 ---------- */
  var ARC = { x0: 18, y0: 40, cx: 260, cy: 160, x1: 502, y1: 40 };   // 与 HTML 里的 path 一致
  var mix = { chenxiang: 0.40, zhuqing: 0.40, longnao: 0.20 };
  var targets = [];
  var mixDirty = false;

  function quadPoint(t) {
    var mt = 1 - t;
    return {
      x: mt * mt * ARC.x0 + 2 * mt * t * ARC.cx + t * t * ARC.x1,
      y: mt * mt * ARC.y0 + 2 * mt * t * ARC.cy + t * t * ARC.y1
    };
  }

  function arcPath(t0, t1) {
    var steps = 18, d = '';
    for (var k = 0; k <= steps; k++) {
      var t = t0 + (t1 - t0) * (k / steps);
      var p = quadPoint(t);
      d += (k === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
    }
    return d;
  }

  function paintMix(pct) {
    var a = pct[0], b = pct[1], c = pct[2];
    var t1 = a, t2 = a + b;
    var segs = [$('#arcSeg0'), $('#arcSeg1'), $('#arcSeg2')];
    var geom = [[0.01, t1], [t1, t2], [t2, 0.99]];
    for (var k = 0; k < 3; k++) {
      if (!segs[k]) continue;
      segs[k].setAttribute('d', arcPath(geom[k][0], geom[k][1]));
    }
    var h0 = quadPoint(t1), h1 = quadPoint(t2);
    if (handles[0]) {
      handles[0].setAttribute('transform', 'translate(' + h0.x.toFixed(1) + ' ' + h0.y.toFixed(1) + ')');
      handles[0].setAttribute('aria-valuenow', Math.round(t1 * 100));
    }
    if (handles[1]) {
      handles[1].setAttribute('transform', 'translate(' + h1.x.toFixed(1) + ' ' + h1.y.toFixed(1) + ')');
      handles[1].setAttribute('aria-valuenow', Math.round(t2 * 100));
    }
    if (legend) {
      var bs = $$('.mix-item', legend);
      var vals = [Math.round(a * 100), Math.round(b * 100), Math.round(c * 100)];
      bs.forEach(function (el, idx) {
        var bEl = $('b', el);
        if (bEl) bEl.textContent = vals[idx] + '%';
      });
    }
  }

  function normalise(m) {
    var sum = m.chenxiang + m.zhuqing + m.longnao;
    if (!sum) { m.chenxiang = .4; m.zhuqing = .4; m.longnao = .2; return m; }
    m.chenxiang /= sum; m.zhuqing /= sum; m.longnao /= sum;
    return m;
  }

  function readStateMix() {
    var st = window.__wenxi && window.__wenxi.state;
    if (!st || !st.mix) return null;
    return { chenxiang: st.mix.chenxiang, zhuqing: st.mix.zhuqing, longnao: st.mix.longnao };
  }

  function syncMixFromState() {
    var m = readStateMix();
    if (!m) return;
    if (Math.abs(m.chenxiang - mix.chenxiang) < .002 &&
        Math.abs(m.zhuqing - mix.zhuqing) < .002 &&
        Math.abs(m.longnao - mix.longnao) < .002) return;
    mix = normalise(m);
    paintMix([mix.chenxiang, mix.zhuqing, mix.longnao]);
  }

  function commitMix() {
    var pct = [mix.chenxiang, mix.zhuqing, mix.longnao];
    var st = window.__wenxi && window.__wenxi.state;
    if (st && st.mix) {
      st.mix.chenxiang = pct[0];
      st.mix.zhuqing = pct[1];
      st.mix.longnao = pct[2];
      if (st.targetMix) {
        st.targetMix.chenxiang = pct[0];
        st.targetMix.zhuqing = pct[1];
        st.targetMix.longnao = pct[2];
      }
    }
    try { if (window.Botanical) window.Botanical.setMix({ chenxiang: pct[0], zhuqing: pct[1], longnao: pct[2] }); } catch (e) {}
    paintMix(pct);
  }

  /* 拖点：只动相邻两段，总和保持 100% */
  function beginDrag(which, ev) {
    if (!arcSvg) return;
    var rect = arcSvg.getBoundingClientRect();
    var vx = (ev.clientX - rect.left) / rect.width * 520;
    var vy = (ev.clientY - rect.top) / rect.height * 132;

    function nearestT() {
      var best = 0, bestD = 1e9;
      for (var k = 0; k <= 100; k++) {
        var t = k / 100, p = quadPoint(t);
        var d = (p.x - vx) * (p.x - vx) + (p.y - vy) * (p.y - vy);
        if (d < bestD) { bestD = d; best = t; }
      }
      return best;
    }

    var t = nearestT();
    if (which === 0) {
      t = clamp(t, 0.06, mix.chenxiang + mix.zhuqing - 0.06);
      mix.chenxiang = t;
      mix.zhuqing = 1 - mix.longnao - t;
    } else {
      t = clamp(t, mix.chenxiang + 0.06, 0.94);
      mix.zhuqing = t - mix.chenxiang;
      mix.longnao = 1 - t;
    }
    normalise(mix);
    paintMix([mix.chenxiang, mix.zhuqing, mix.longnao]);
    if (handles[which]) handles[which].classList.add('is-drag');
  }

  function bindArc() {
    handles.forEach(function (h, idx) {
      if (!h) return;
      h.addEventListener('pointerdown', function (ev) {
        ev.preventDefault();
        h.setPointerCapture && h.setPointerCapture(ev.pointerId);
        beginDrag(idx, ev);
        function move(e) { beginDrag(idx, e); }
        function up() {
          h.classList.remove('is-drag');
          h.removeEventListener('pointermove', move);
          h.removeEventListener('pointerup', up);
          commitMix();
        }
        h.addEventListener('pointermove', move);
        h.addEventListener('pointerup', up);
      });
      h.addEventListener('keydown', function (ev) {
        var step = ev.shiftKey ? 0.05 : 0.01;
        if (ev.key === 'ArrowLeft') { if (idx === 0) mix.chenxiang = clamp(mix.chenxiang - step, 0.02, 1 - mix.longnao - 0.06); else mix.zhuqing = clamp(mix.zhuqing - step, 0.06, 0.96); }
        else if (ev.key === 'ArrowRight') { if (idx === 0) mix.chenxiang = clamp(mix.chenxiang + step, 0.02, 1 - mix.longnao - 0.06); else mix.zhuqing = clamp(mix.zhuqing + step, 0.06, 0.96); }
        else return;
        ev.preventDefault();
        mix.longnao = 1 - mix.chenxiang - mix.zhuqing;
        normalise(mix);
        paintMix([mix.chenxiang, mix.zhuqing, mix.longnao]);
        commitMix();
      });
    });
  }

  /* ---------- 三色浮瓣 ---------- */
  var petals = [];
  var PETAL_SRC = {
    purple: ['assets/vintage/petals/purple-curl.webp', 'assets/vintage/petals/purple-open.webp'],
    cyan: ['assets/vintage/petals/cyan-curl.webp', 'assets/vintage/petals/cyan-open.webp'],
    white: ['assets/vintage/petals/white-curl.webp', 'assets/vintage/petals/white-open.webp']
  };
  var petalImgs = {};
  Object.keys(PETAL_SRC).forEach(function (k) {
    petalImgs[k] = PETAL_SRC[k].map(function (src) { var im = new Image(); im.src = src; return im; });
  });

  var petalCtx = petalCanvas ? petalCanvas.getContext('2d') : null;
  var petalRaf = 0, petalLast = 0, spawnAcc = 0;
  var pointer = { x: -999, y: -999, inside: false };

  function pickColor() {
    var r = Math.random();
    if (r < mix.chenxiang) return 'purple';
    if (r < mix.chenxiang + mix.zhuqing) return 'cyan';
    return 'white';
  }

  function spawnPetal() {
    if (!tuneMain || !petalCanvas) return;
    var box = tuneMain.getBoundingClientRect();
    var stage = $('#tuneFlower');
    var sbox = stage ? stage.getBoundingClientRect() : box;
    var color = pickColor();
    var size = 17 + Math.random() * 13;
    petals.push({
      color: color,
      variant: Math.random() < .5 ? 0 : 1,
      x: sbox.left - box.left + sbox.width * (0.24 + Math.random() * 0.52),
      y: sbox.top - box.top + sbox.height * (0.40 + Math.random() * 0.26),
      vx: (Math.random() - .5) * 16,
      vy: -(26 + Math.random() * 22),
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - .5) * 1.6,
      size: size,
      life: 0,
      ttl: 3.5 + Math.random() * 1.5,
      alpha: 0,
      gone: false,
      fly: null
    });
    if (petals.length > 14) petals.shift();
  }

  function petalTick(now) {
    if (!petalCtx) { petalRaf = 0; return; }
    var dt = petalLast ? Math.min((now - petalLast) / 1000, .05) : .016;
    petalLast = now;

    var w = petalCanvas.clientWidth, h = petalCanvas.clientHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (petalCanvas.width !== Math.round(w * dpr) || petalCanvas.height !== Math.round(h * dpr)) {
      petalCanvas.width = Math.round(w * dpr);
      petalCanvas.height = Math.round(h * dpr);
    }
    petalCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    petalCtx.clearRect(0, 0, w, h);

    spawnAcc += dt;
    var gap = 0.45 + Math.random() * 0.2;   // 450–650 ms 一片
    if (spawnAcc > gap && petals.length < 11) {
      spawnAcc = 0;
      spawnPetal();
    }

    for (var k = petals.length - 1; k >= 0; k--) {
      var p = petals[k];
      p.life += dt;

      if (p.fly) {
        p.fly.t += dt;
        p.x += p.fly.vx * dt;
        p.y += p.fly.vy * dt;
        p.rot += p.fly.spin * dt;
        p.alpha = clamp(1 - p.fly.t / 0.5, 0, 1);
        if (p.fly.t > 0.5) { petals.splice(k, 1); continue; }
      } else {
        p.x += p.vx * dt + Math.sin((p.life + p.rot) * 2.1) * 12 * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        p.alpha = p.life < .5 ? p.life / .5 : clamp(1 - (p.life - .5) / p.ttl, 0, 1);

        // 鼠标命中：向内收的椭圆判定，命中即向外飞走
        if (pointer.inside) {
          var dx = p.x - pointer.x, dy = (p.y - pointer.y) * 1.25;
          if (dx * dx + dy * dy < Math.pow(p.size * .62 + 5, 2)) {
            var dir = dx >= 0 ? 1 : -1;
            p.fly = {
              t: 0,
              vx: dir * (150 + Math.random() * 90),
              vy: -(90 + Math.random() * 60),
              spin: dir * (2 + Math.random() * 2)
            };
            continue;
          }
        }
        if (p.life > p.ttl + 1.2 || p.y < -40) { petals.splice(k, 1); continue; }
      }

      var img = petalImgs[p.color][p.variant];
      if (!img || !img.complete) continue;
      petalCtx.save();
      petalCtx.globalAlpha = p.alpha * .95;
      petalCtx.translate(p.x, p.y);
      petalCtx.rotate(p.rot);
      petalCtx.drawImage(img, -p.size / 2, -p.size / 2, p.size, p.size);
      petalCtx.restore();
    }

    petalRaf = window.requestAnimationFrame(petalTick);
  }

  window.__vintagePetals = petals;

  function startPetals() {
    if (!petalCtx) return;
    if (!petalRaf) { petalLast = 0; petalRaf = window.requestAnimationFrame(petalTick); }
  }

  function stopPetals() {
    if (petalRaf) window.cancelAnimationFrame(petalRaf);
    petalRaf = 0;
    petals.length = 0;
    if (petalCtx) petalCtx.clearRect(0, 0, petalCanvas.width, petalCanvas.height);
  }

  if (tuneMain) {
    tuneMain.addEventListener('pointermove', function (e) {
      var box = petalCanvas.getBoundingClientRect();
      pointer.x = e.clientX - box.left;
      pointer.y = e.clientY - box.top;
      pointer.inside = true;
    }, { passive: true });
    tuneMain.addEventListener('pointerleave', function () { pointer.inside = false; });
  }

  /* ---------- 进入/离开调节页 ---------- */
  function onViewChange(v) {
    if (v === 'adjust') {
      startSequence();
      startPetals();
      syncMixFromState();
      paintMix([mix.chenxiang, mix.zhuqing, mix.longnao]);
    } else {
      stopSequence();
      stopPetals();
    }
  }

  new MutationObserver(function () {
    var v = body.getAttribute('data-view');
    onViewChange(v);
  }).observe(body, { attributes: true, attributeFilter: ['data-view'] });

  /* ---------- 记录页月份标签 ---------- */
  function syncMonthLabel() {
    var lab = $('#recMonthLabel');
    if (!lab) return;
    var now = new Date();
    lab.textContent = now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月';
  }
  syncMonthLabel();

  /* ---------- 初始化 ---------- */
  function init() {
    if (viewAdjust) {
      paintMix([mix.chenxiang, mix.zhuqing, mix.longnao]);
      bindArc();
    }
    // 配比被场景/系统改动时同步（不覆盖正在拖动的状态）
    window.setInterval(function () {
      if (body.getAttribute('data-view') !== 'adjust') return;
      if (handles.some(function (h) { return h && h.classList.contains('is-drag'); })) return;
      syncMixFromState();
    }, 700);
    onViewChange(body.getAttribute('data-view'));
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
