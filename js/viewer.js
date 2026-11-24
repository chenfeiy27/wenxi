/* ============================================================
   闻息 · viewer.js
   样机 360° 查看器：144 帧（每 2.5°）透明渲染，canvas 绘制。
     · 入口：顶栏「360°」胶囊 / 快捷键 V
     · 两个样机：香薰仪 / 手环，顶部胶囊切换（按需加载，首次切换才下载手环帧）
     · 拖动旋转、滚轮缩放、←/→ 逐帧、Esc 关闭
     · 打开时预解码当前样机的全部帧，拖动不掉帧
   ============================================================ */
(function () {
  'use strict';

  var N = 144;
  var STEP = 360 / N;

  var MODELS = {
    censer: { name: '香薰仪', dir: 'assets/censer/viewer/' },
    band:   { name: '手环',   dir: 'assets/band/viewer/' }
  };
  var ORDER = ['censer', 'band'];

  function frameSrc(model, i) {
    var s = String(i);
    while (s.length < 3) s = '0' + s;
    return MODELS[model].dir + 'f' + s + '.webp';
  }

  var root = null;
  var canvas = null;
  var ctx = null;

  var model = 'censer';
  var sets = {};          // model -> { imgs, decoded, started }
  var imgs = new Array(N);
  var decoded = 0;

  var angle = 0;
  var frame = 0;
  var zoom = 1;
  var dirty = true;
  var raf = 0;
  var open = false;

  var down = false, dragging = false, startX = 0, baseAngle = 0;

  /* ---------------- 构建浮层 ---------------- */
  function build() {
    root = document.createElement('div');
    root.className = 'viewer';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = [
      '<div class="viewer-head">',
      '  <span class="viewer-title">闻息 · 样机 360°</span>',
      '  <button class="viewer-close" type="button">合上</button>',
      '</div>',
      '<div class="viewer-tabs" role="tablist">',
      '  <button class="viewer-tab is-on" type="button" role="tab" data-model="censer">香薰仪</button>',
      '  <button class="viewer-tab" type="button" role="tab" data-model="band">手环</button>',
      '</div>',
      '<div class="viewer-stage"><canvas class="viewer-canvas"></canvas></div>',
      '<p class="viewer-hint">拖动旋转 · 滚轮缩放 · ← → 逐帧 · Esc 关闭</p>',
      '<p class="viewer-load" aria-live="polite"></p>'
    ].join('');
    document.body.appendChild(root);

    canvas = root.querySelector('.viewer-canvas');
    ctx = canvas.getContext('2d');

    root.querySelector('.viewer-close').addEventListener('click', close);
    root.addEventListener('click', function (e) {
      if (e.target === root) close();
    });

    var tabs = root.querySelectorAll('.viewer-tab');
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].addEventListener('click', function (e) {
        e.stopPropagation();
        switchModel(this.getAttribute('data-model'));
      });
    }

    canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      down = true; dragging = false; startX = e.clientX; baseAngle = angle;
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    });
    window.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      if (!dragging && Math.abs(dx) > 4) dragging = true;
      if (dragging) setAngle(baseAngle + dx * 0.8);
    }, { passive: true });
    window.addEventListener('pointerup', function () {
      if (!down) return;
      down = false; dragging = false;
      baseAngle = angle;
    });

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      setZoom(zoom * (e.deltaY > 0 ? 0.92 : 1.08));
    }, { passive: false });

    window.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowLeft') { setAngle(angle - STEP); e.preventDefault(); }
      if (e.key === 'ArrowRight') { setAngle(angle + STEP); e.preventDefault(); }
      if (e.key === 'v' || e.key === 'V') { close(); }
      e.stopPropagation();
    }, true);

    window.addEventListener('resize', function () { if (open) requestDraw(); });
  }

  /* ---------------- 载入帧（按样机缓存） ---------------- */
  function ensureSet(m) {
    if (sets[m]) return sets[m];
    var set = { imgs: new Array(N), decoded: 0, started: true };
    sets[m] = set;
    for (var i = 0; i < N; i++) {
      (function (idx) {
        var im = new Image();
        im.src = frameSrc(m, idx);
        set.imgs[idx] = im;
        var done = function () {
          set.decoded++;
          if (m === model) {
            if (idx === 0) requestDraw();
            updateLoad();
          }
        };
        if (im.decode) im.decode().then(done, done);
        else { im.onload = done; im.onerror = done; }
      })(i);
    }
    return set;
  }

  function load() {
    var set = ensureSet(model);
    imgs = set.imgs;
    decoded = set.decoded;
    updateLoad();
  }

  function switchModel(m) {
    if (!m || !MODELS[m] || m === model) return;
    model = m;
    var set = ensureSet(m);
    imgs = set.imgs;
    decoded = set.decoded;
    if (root) {
      var tabs = root.querySelectorAll('.viewer-tab');
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('is-on', tabs[i].getAttribute('data-model') === m);
      }
      root.setAttribute('data-model', m);
      var loadEl = root.querySelector('.viewer-load');
      if (loadEl) loadEl.textContent = '';
    }
    updateLoad();
    requestDraw();
  }

  function decodedOf(m) {
    return sets[m] ? sets[m].decoded : 0;
  }

  function updateLoad() {
    var el = root && root.querySelector('.viewer-load');
    if (!el) return;
    var d = decodedOf(model);
    if (d >= N) { el.textContent = ''; return; }
    el.textContent = '载入中（' + MODELS[model].name + '）' + d + ' / ' + N;
  }

  /* ---------------- 绘制 ---------------- */
  function sizeCanvas() {
    var stage = root.querySelector('.viewer-stage');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = stage.clientWidth, h = stage.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  function draw() {
    raf = 0;
    if (!dirty || !open) return;
    dirty = false;
    sizeCanvas();
    var cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    var im = imgs[frame];
    if (!im || !im.complete || !im.naturalWidth) return;
    var s = Math.min(cw / im.naturalWidth, ch / im.naturalHeight) * zoom;
    var dw = im.naturalWidth * s, dh = im.naturalHeight * s;
    ctx.drawImage(im, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }

  function requestDraw() {
    dirty = true;
    if (!raf) raf = window.requestAnimationFrame(draw);
  }

  function apply() {
    var a = ((angle % 360) + 360) % 360;
    var f = Math.round(a / STEP) % N;
    if (f !== frame) { frame = f; requestDraw(); }
  }

  function setAngle(a) {
    var a2 = ((a % 360) + 360) % 360;
    angle = a2;
    apply();
  }

  function setZoom(z) {
    zoom = Math.max(0.7, Math.min(2.2, z));
    requestDraw();
  }

  /* ---------------- 开关 ---------------- */
  function openViewer() {
    if (!root) build();
    load();
    open = true;
    root.classList.add('is-on');
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('viewer-open');
    sizeCanvas();
    requestDraw();
  }

  function close() {
    if (!root) return;
    open = false;
    root.classList.remove('is-on');
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('viewer-open');
  }

  function toggle() { open ? close() : openViewer(); }

  /* ---------------- 入口按钮 ---------------- */
  function bindEntry() {
    var btn = document.getElementById('btnViewer');
    if (btn) btn.addEventListener('click', function () { toggle(); });

    document.addEventListener('keydown', function (e) {
      if (open) return;
      if ((e.key === 'v' || e.key === 'V') && !e.metaKey && !e.ctrlKey) {
        var tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        openViewer();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindEntry);
  } else {
    bindEntry();
  }

  window.Viewer360 = {
    open: openViewer,
    close: close,
    toggle: toggle,
    frame: function (i) { setAngle(i * STEP); },
    count: N,
    ready: function () { return decodedOf(model); },
    model: function (m) {
      if (m) switchModel(m);
      return model;
    },
    models: function () { return ORDER.slice(); },
    readyOf: function (m) { return decodedOf(m); }
  };
})();
