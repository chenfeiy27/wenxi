/* ============================================================
   闻息 · smoke.js（贴图版）
   用程序生成的"烟丝"贴图做旋转广告牌，叠加成写实香烟：
     · 3 张 256² 细丝贴图（assets/smoke/wisp*.png），运行时按主题染色
     · 每个烟团缓慢旋转、变大、淡出；上升速度约 100–140 px/s
     · 两层绘制（大而淡 + 小而实），得到体积感而不是硬线条
   公共接口与旧版保持一致（app.js 无需改动）
   ============================================================ */

var Smoke = (function () {
  'use strict';

  var MAX = 110;
  var SRC = ['assets/smoke/wisp1.png', 'assets/smoke/wisp2.png', 'assets/smoke/wisp3.png'];

  var canvas = null;
  var ctx = null;
  var W = 0, H = 0, dpr = 1;

  var imgs = [];        /* 原始贴图 */
  var tinted = [];      /* 染色后的离屏 canvas */
  var tintKey = '';

  var particles = [];
  var noise = new Noise.Simplex(8817);
  var rnd = Noise.mulberry32(2026);

  var origin = { x: 0, y: 0 };
  var intensity = 0;
  var target = 0;
  var turbulence = 0.9;
  var density = 1;
  var spawnAcc = 0;

  var pointer = { x: -9999, y: -9999 };
  var style = { r: 234, g: 144, b: 170, blend: 'source-over', gain: 1 };

  function loadImages() {
    if (imgs.length) return;
    for (var i = 0; i < SRC.length; i++) {
      var im = new Image();
      im.src = SRC[i];
      imgs.push(im);
    }
  }

  /* 把白色贴图染成主题色（source-in），结果缓存 */
  function buildTinted() {
    var key = style.r + ',' + style.g + ',' + style.b;
    if (key === tintKey && tinted.length === imgs.length) return;
    tintKey = key;
    tinted = [];
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      if (!im.complete || !im.naturalWidth) { tinted.push(null); continue; }
      var c = document.createElement('canvas');
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      var g = c.getContext('2d');
      g.drawImage(im, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = 'rgb(' + style.r + ',' + style.g + ',' + style.b + ')';
      g.fillRect(0, 0, c.width, c.height);
      tinted.push(c);
    }
  }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    loadImages();
    particles = [];
    for (var i = 0; i < MAX; i++) particles.push({ alive: false });
  }

  function setStyle(opt) {
    opt = opt || {};
    if (opt.color) { style.r = opt.color[0]; style.g = opt.color[1]; style.b = opt.color[2]; }
    if (opt.blend) style.blend = opt.blend;
    if (opt.gain != null) style.gain = opt.gain;
    tintKey = '';
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
    p.life = 3.6 + rnd() * 1.9;
    p.x = origin.x + (rnd() - 0.5) * 12;
    p.y = origin.y + (rnd() - 0.5) * 10;
    p.vx = (rnd() - 0.5) * 34;
    p.vy = -(86 + rnd() * 40) * (boost ? 1.2 : 1);
    p.size0 = 22 + rnd() * 16;
    p.grow = 30 + rnd() * 26;
    p.rot = rnd() * Math.PI * 2;
    p.spin = (rnd() - 0.5) * 0.5;
    p.seed = rnd() * 720;
    p.alpha = 0.15 + rnd() * 0.12;
    p.sprite = (rnd() * 3) | 0;
    return true;
  }

  function burst(n) {
    var count = Math.min(24, n | 0);
    for (var i = 0; i < count; i++) if (!spawnOne(true)) break;
  }

  function update(dt, time) {
    if (!ctx) return;
    dt = Math.min(dt, 0.05);

    if (imgs.length && imgs[0].complete) buildTinted();

    intensity += (target - intensity) * Math.min(1, dt * 3.4);
    if (Math.abs(target - intensity) < 0.001) intensity = target;

    var rate = intensity * 13 * density;
    spawnAcc += rate * dt;
    var guard = 0;
    while (spawnAcc >= 1 && guard++ < 6) {
      spawnAcc -= 1;
      if (!spawnOne(false)) { spawnAcc = 0; break; }
    }

    var turb = turbulence;
    for (var i = 0; i < MAX; i++) {
      var p = particles[i];
      if (!p.alive) continue;

      p.age += dt;
      if (p.age >= p.life) { p.alive = false; continue; }

      /* 两层噪声：慢的横向漂移 + 快的抖动，形成 S 形上升 */
      var n1 = noise.noise2D(p.seed + p.y * 0.0032, time * 0.30);
      var n2 = noise.noise2D(p.seed * 1.9 + p.x * 0.007, time * 0.55 + 30);
      p.vx += (n1 * 120 + n2 * 64 + Math.sin(time * 1.35 + p.seed * 0.01) * 92) * dt * turb;

      /* 越往上越飘（烟在高处扩散） */
      var high = Math.max(0, (origin.y - p.y) / 400);
      p.vx += n1 * 34 * dt * high;

      p.vx *= (1 - Math.min(0.6, dt * 1.1));

      /* 指针扰动 */
      var dx = p.x - pointer.x, dy = p.y - pointer.y;
      var d2 = dx * dx + dy * dy;
      var R = 130;
      if (d2 < R * R && d2 > 4) {
        var d = Math.sqrt(d2);
        var f = (1 - d / R) * 260 * dt;
        p.x += (dx / d) * f;
        p.y += (dy / d) * f * 0.55;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.size0 += p.grow * dt;

      if (p.y < -260 || p.x < -300 || p.x > W + 300) p.alive = false;
    }
  }

  function drawParticle(p, extraScale, alphaMul) {
    var k = p.age / p.life;
    var fadeIn = k < 0.14 ? k / 0.14 : 1;
    var fadeOut = 1 - Math.pow(k, 1.8);
    var a = p.alpha * fadeIn * fadeOut * alphaMul * Math.min(2.0, style.gain) * 0.5;
    if (a < 0.004) return;
    var img = tinted[p.sprite];
    if (!img) return;
    var s = p.size0 * extraScale;
    ctx.globalAlpha = Math.min(1, a);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.drawImage(img, -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (!tinted.length || !tinted[0]) return;
    ctx.globalCompositeOperation = style.blend === 'lighter' ? 'lighter' : 'source-over';

    for (var i = 0; i < MAX; i++) {
      var p = particles[i];
      if (!p.alive) continue;
      /* 大而淡的一层，负责体积 */
      drawParticle(p, 1.45, 0.5);
      /* 小而实的一层，负责细丝 */
      drawParticle(p, 0.92, 1.0);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  return {
    clear: function () {
      for (var i = 0; i < MAX; i++) particles[i].alive = false;
      intensity = 0;
      if (ctx) ctx.clearRect(0, 0, W, H);
    },
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
    render: render
  };
})();
