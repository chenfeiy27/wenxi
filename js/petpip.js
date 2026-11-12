/* ============================================================
   闻息 · 桌宠悬浮窗（视频 PiP 方案）
   canvas → captureStream → <video> → requestPictureInPicture()
   这个窗口没有标题栏/地址栏，系统级置顶，只在悬停时浮出原生控件。
   代价：窗口里收不到鼠标事件，所以是「只能看」的活摆件。
   ============================================================ */
(function () {
  'use strict';

  var W = 320, H = 260;
  var canvas = null, ctx = null, video = null, stream = null;
  var active = false;
  var raf = 0;
  var t0 = 0;

  var S = {
    lit: false,
    theme: 'night',
    line: '等你点香',
    remain: '',
    stress: 0.1
  };

  var wisps = [];
  for (var i = 0; i < 14; i++) {
    wisps.push({ p: i / 14, sp: 0.10 + Math.random() * 0.10, xoff: (Math.random() - .5) * 10, r: 3 + Math.random() * 5 });
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function build() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    ctx = canvas.getContext('2d');

    video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(canvas);
    document.body.appendChild(video);

    stream = canvas.captureStream(30);
    video.srcObject = stream;

    // 先画一帧，避免 PiP 刚弹出时是黑的
    draw(window.performance.now());

    video.addEventListener('leavepictureinpicture', function () {
      stop();
      try {
        if (window.PetPip && typeof window.PetPip.onExit === 'function') window.PetPip.onExit();
      } catch (e) { /* noop */ }
    });
  }

  function supported() {
    try {
      return !!(document.pictureInPictureEnabled &&
        HTMLVideoElement.prototype &&
        HTMLVideoElement.prototype.requestPictureInPicture &&
        HTMLCanvasElement.prototype.captureStream);
    } catch (e) { return false; }
  }

  function isActive() { return active; }

  function set(partial) {
    if (!partial) return;
    for (var k in partial) if (partial.hasOwnProperty(k)) S[k] = partial[k];
  }

  /* ---------------- 绘制 ---------------- */
  function draw(now) {
    if (!ctx) return;
    var t = now / 1000;
    var night = (S.theme !== 'day');
    var breath = 0.5 + 0.5 * Math.sin(t * (Math.PI * 2 / 9));   // 9 秒一循

    // 背景
    var bg = ctx.createRadialGradient(W / 2, H * 0.34, 8, W / 2, H * 0.55, W * 0.82);
    if (night) { bg.addColorStop(0, '#1B1612'); bg.addColorStop(1, '#090807'); }
    else { bg.addColorStop(0, '#FBF5E7'); bg.addColorStop(1, '#E6D8BE'); }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    var cx = W / 2;
    var rimY = 118;
    var rx = 74, ry = 17;

    // 炉火 / 呼吸光
    if (S.lit) {
      var gl = ctx.createRadialGradient(cx, rimY + 4, 2, cx, rimY + 4, rx * 1.5);
      var a = (0.10 + breath * 0.22) * (night ? 1 : 0.6);
      gl.addColorStop(0, 'rgba(255,214,150,' + a.toFixed(3) + ')');
      gl.addColorStop(1, 'rgba(255,190,120,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(0, 0, W, H);
    }

    // 烟
    if (S.lit) {
      for (var i = 0; i < wisps.length; i++) {
        var w = wisps[i];
        w.p += 0.0016 * w.sp * 60 / 60;
        if (w.p > 1) w.p -= 1;
        var y = rimY - w.p * (78 + S.stress * 30);
        var x = cx + w.xoff + Math.sin((w.p * 3 + i) * 2.1) * (6 + w.p * 16);
        var al = Math.sin(w.p * Math.PI) * (night ? 0.30 : 0.24);
        var rr = w.r * (0.6 + w.p * 2.2);
        var g2 = ctx.createRadialGradient(x, y, 0, x, y, rr);
        var col = night ? '206,214,206' : '255,255,255';
        g2.addColorStop(0, 'rgba(' + col + ',' + al.toFixed(3) + ')');
        g2.addColorStop(1, 'rgba(' + col + ',0)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 三足
    ctx.fillStyle = night ? '#3A2A1B' : '#C9B99C';
    drawLeg(cx - 42, 168, 12, 26);
    drawLeg(cx + 42, 168, -12, 26);
    drawLeg(cx, 172, 0, 22);

    // 炉身
    var bodyG = ctx.createLinearGradient(cx - rx, 120, cx + rx, 175);
    if (night) {
      bodyG.addColorStop(0, '#9A7448');
      bodyG.addColorStop(0.45, '#6C5130');
      bodyG.addColorStop(1, '#2A1E13');
    } else {
      bodyG.addColorStop(0, '#FFFDF7');
      bodyG.addColorStop(0.45, '#EFE4CE');
      bodyG.addColorStop(1, '#BFAE8E');
    }
    ctx.beginPath();
    ctx.moveTo(cx - rx, rimY);
    ctx.bezierCurveTo(cx - rx - 4, 160, cx - 46, 176, cx, 176);
    ctx.bezierCurveTo(cx + 46, 176, cx + rx + 4, 160, cx + rx, rimY);
    ctx.ellipse(cx, rimY, rx, ry, 0, 0, Math.PI, true);
    ctx.closePath();
    ctx.fillStyle = bodyG;
    ctx.fill();

    // 炉口
    ctx.beginPath();
    ctx.ellipse(cx, rimY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = night ? '#0B0805' : '#6E5C41';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, rimY + 2, rx * 0.88, ry * 0.72, 0, 0, Math.PI * 2);
    ctx.fillStyle = night ? '#060403' : '#4E402D';
    ctx.fill();

    // 口沿描金
    ctx.beginPath();
    ctx.ellipse(cx, rimY, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = night ? 'rgba(228,192,137,.8)' : 'rgba(150,112,58,.75)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 香篆（同心盘香）
    ctx.save();
    ctx.strokeStyle = night ? 'rgba(201,160,99,.5)' : 'rgba(168,132,70,.45)';
    ctx.lineWidth = 1;
    for (var k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.ellipse(cx, rimY + 1, rx * 0.72 * (k / 3), ry * 0.72 * (k / 3), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 燃点
    if (S.lit) {
      var ex = cx + Math.cos(t * 0.6) * rx * 0.5;
      var ey = rimY + 1 + Math.sin(t * 0.6) * ry * 0.36;
      var eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 5);
      eg.addColorStop(0, 'rgba(255,224,166,.95)');
      eg.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(ex, ey, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 状态文字
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = night ? 'rgba(190,178,155,.92)' : 'rgba(74,62,44,.92)';
    ctx.font = '15px "Noto Serif SC","Songti SC",serif';
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '5px';
    ctx.fillText(S.line, cx, H - 44);

    ctx.fillStyle = night ? 'rgba(140,130,114,.8)' : 'rgba(126,112,89,.85)';
    ctx.font = '11px "Noto Sans SC","PingFang SC",sans-serif';
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '2px';
    ctx.fillText(S.remain ? S.remain : (S.lit ? '正在燃' : '待机'), cx, H - 22);
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
  }

  function drawLeg(x, y, skew, h) {
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.lineTo(x - 4, y + h * 0.4);
    ctx.lineTo(x - 6, y + h);
    ctx.lineTo(x + 6 + skew * 0.1, y + h);
    ctx.lineTo(x + 4, y + h * 0.4);
    ctx.lineTo(x + 5, y);
    ctx.closePath();
    ctx.fill();
  }

  function loop(now) {
    if (!active) return;
    if (!t0) t0 = now;
    draw(now);
    raf = window.requestAnimationFrame(loop);
  }

  /* ---------------- 开关 ---------------- */
  function start() {
    if (!supported()) return Promise.reject(new Error('unsupported'));
    build();
    draw(window.performance.now());
    if (video.requestPictureInPicture && document.pictureInPictureElement === video) {
      return Promise.resolve();
    }
    var p = video.play();
    var chain = (p && p.then) ? p : Promise.resolve();
    return chain.then(function () {
      return video.requestPictureInPicture();
    }).then(function () {
      active = true;
      t0 = 0;
      raf = window.requestAnimationFrame(loop);
    });
  }

  function stop() {
    active = false;
    if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
    try {
      if (document.pictureInPictureElement) document.exitPictureInPicture();
    } catch (e) { /* noop */ }
    try { if (video) video.pause(); } catch (e) { /* noop */ }
  }

  window.PetPip = {
    supported: supported,
    isActive: isActive,
    start: start,
    stop: stop,
    set: set,
    onExit: null
  };
})();
