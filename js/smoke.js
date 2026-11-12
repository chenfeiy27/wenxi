/* ============================================================
   闻息 · smoke.js
   Canvas 粒子烟雾。粒子池固定上限 120，单 rAF 由 app.js 驱动。
   · 升腾 + simplex 湍流扰动
   · 指针靠近时被推开（"烟受指针扰动"）
   · 点香瞬间 burst() 让烟骤然转浓
   · 高压时 setTurbulence() 让烟变乱
   ============================================================ */

var Smoke = (function () {
  'use strict';

  var MAX = 120;

  var canvas = null;
  var ctx = null;
  var W = 0, H = 0, dpr = 1;

  var particles = [];
  var sprite = null;
  var noise = new Noise.Simplex(8817);
  var rnd = Noise.mulberry32(2026);

  var origin = { x: 0, y: 0 };
  var intensity = 0;      // 当前烟浓度 0~1.3（缓动到 target）
  var target = 0;
  var turbulence = 0.9;   // 湍流强度，高压时升高
  var density = 1;        // 全局密度（reduced-motion 时降低）
  var spawnAcc = 0;

  var pointer = { x: -9999, y: -9999 };

  var style = { r: 228, g: 222, b: 206, blend: 'lighter', gain: 1 };

  function makeSprite() {
    var size = 128;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var r = size / 2;
    var R = style.r, G = style.g, B = style.b;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0.00, 'rgba(' + R + ',' + G + ',' + B + ',0.60)');
    grad.addColorStop(0.30, 'rgba(' + R + ',' + G + ',' + B + ',0.26)');
    grad.addColorStop(0.62, 'rgba(' + R + ',' + G + ',' + B + ',0.08)');
    grad.addColorStop(1.00, 'rgba(' + R + ',' + G + ',' + B + ',0.00)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  /* 主题换色：夜间白光烟（lighter），白天墨烟（source-over） */
  function setStyle(opt) {
    opt = opt || {};
    if (opt.color) { style.r = opt.color[0]; style.g = opt.color[1]; style.b = opt.color[2]; }
    if (opt.blend) style.blend = opt.blend;
    if (opt.gain != null) style.gain = opt.gain;
    if (canvas) sprite = makeSprite();
  }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    sprite = makeSprite();
    for (var i = 0; i < MAX; i++) particles.push({ alive: false });
  }

  function resize(w, h, ratio) {
    if (!canvas) return;
    W = w; H = h;
    dpr = Math.max(1, ratio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setOrigin(x, y) { origin.x = x; origin.y = y; }
  function setIntensity(v) { target = v; }
  function setTurbulence(v) { turbulence = Math.max(0, v); }
  function setDensity(v) { density = Math.max(0, Math.min(1, v)); }
  function setPointer(x, y) { pointer.x = x; pointer.y = y; }
  function clearPointer() { pointer.x = -9999; pointer.y = -9999; }

  function spawnOne(boost) {
    var p = null;
    for (var i = 0; i < MAX; i++) {
      if (!particles[i].alive) { p = particles[i]; break; }
    }
    if (!p) return false;

    p.alive = true;
    p.age = 0;
    p.life = 4.2 + rnd() * 3.4;
    p.x = origin.x + (rnd() - 0.5) * 13;
    p.y = origin.y + (rnd() - 0.5) * 6;
    p.vx = (rnd() - 0.5) * 13;
    p.vy = -(13 + rnd() * 11) * (boost ? 1.7 : 1);
    p.size = 12 + rnd() * 14;
    p.grow = 16 + rnd() * 26;
    p.seed = rnd() * 480;
    p.alpha = 0.55 + rnd() * 0.45;
    return true;
  }

  function burst(n) {
    var count = Math.min(48, n | 0);
    for (var i = 0; i < count; i++) {
      if (!spawnOne(true)) break;
    }
  }

  function update(dt, time) {
    if (!ctx) return;
    dt = Math.min(dt, 0.05);

    // 浓度缓动（点香瞬间 target=1，约 0.3s 到位）
    intensity += (target - intensity) * Math.min(1, dt * 2.4);
    if (Math.abs(target - intensity) < 0.001) intensity = target;

    // 生成
    var rate = intensity * 26 * density;
    spawnAcc += rate * dt;
    var guard = 0;
    while (spawnAcc >= 1 && guard++ < 8) {
      spawnAcc -= 1;
      if (!spawnOne(false)) { spawnAcc = 0; break; }
    }

    var turb = turbulence;
    var baseUp = -(16 + 12 * intensity);

    for (var i = 0; i < MAX; i++) {
      var p = particles[i];
      if (!p.alive) continue;

      p.age += dt;
      if (p.age >= p.life) { p.alive = false; continue; }

      // 两层 simplex 湍流
      var n1 = noise.noise2D(p.x * 0.0042 + p.seed, p.y * 0.0042 - time * 0.22);
      var n2 = noise.noise2D(p.x * 0.012 + p.seed * 1.7, p.y * 0.012 + time * 0.13);
      p.vx += (n1 * 36 + n2 * 14) * dt * turb;
      p.vy += (baseUp - p.vy) * Math.min(1, dt * 0.8);

      // 指针扰动
      var dx = p.x - pointer.x;
      var dy = p.y - pointer.y;
      var d2 = dx * dx + dy * dy;
      var R = 118;
      if (d2 < R * R && d2 > 0.4) {
        var d = Math.sqrt(d2);
        var f = (1 - d / R) * 340 * dt;
        p.vx += (dx / d) * f;
        p.vy += (dy / d) * f * 0.65;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt * 0.34;

      // 出屏回收
      if (p.y < -140 || p.x < -160 || p.x > W + 160) p.alive = false;
    }
  }

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = style.blend;

    var glow = (0.052 + intensity * 0.020) * style.gain;

    for (var i = 0; i < MAX; i++) {
      var p = particles[i];
      if (!p.alive) continue;

      var k = p.age / p.life;
      var fadeIn = k < 0.16 ? k / 0.16 : 1;
      var alpha = fadeIn * (1 - k) * (1 - k * 0.35) * p.alpha * glow;
      if (alpha < 0.0025) continue;

      ctx.globalAlpha = alpha;
      var s = p.size;
      ctx.drawImage(sprite, p.x - s, p.y - s, s * 2, s * 2);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  return {
    clear: function () { particles.forEach(function (p) { p.alive = false; }); intensity = 0; if (ctx) ctx.clearRect(0, 0, W, H); },
    MAX: MAX,
    init: init,
    setStyle: setStyle,
    resize: resize,
    setOrigin: setOrigin,
    setIntensity: setIntensity,
    setTurbulence: setTurbulence,
    setDensity: setDensity,
    setPointer: setPointer,
    clearPointer: clearPointer,
    burst: burst,
    update: update,
    render: render,
  };
})();
