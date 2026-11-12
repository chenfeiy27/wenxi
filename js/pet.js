/* ============================================================
   闻息 v3 · pet.js — 桌面桌宠
   ------------------------------------------------------------
   三态：
     1. 收起态：小炉形象 + 一句话 + 运行标记（不出现任何生理数字）
     2. 展开态：快捷卡片（心率 / HRV / 气息 / 香薰运行 / 连接点 / 打开网页）
     3. 变化态：bubble() 短暂气泡（收起时也可见）
   零依赖、无 ES module、无 fetch；形象纯 CSS/SVG，动画全交给 CSS；
   挂到 window.Pet，所有方法在 init() 之前调用均为安全空操作。

   对外 API
     Pet.init({ onOpenWeb, onClose, onOpen?, visible? })  // visible:false 可一开始就藏起来
     Pet.show() / hide() / toggle() / isOpen() / isVisible() / open() / close()
       · show/hide 管整只桌宠的显隐；toggle 开合快捷卡片（与 app.js 的顶栏按钮约定一致）
     Pet.setLine(text, ms?)      // 一句话；ms 可选，到点淡出，悬停可再看见
     Pet.setRun({ running, remainText, name?, scene?, progress? })
     Pet.setConn({ watch, diffuser })
     Pet.setData({ hr, hrv, stress })      // stress 0~1
     Pet.bubble(text, ms?)                 // 默认 3000ms，限制在 1.2~9s
   ============================================================ */
(function (window, document) {
  'use strict';

  /* ---------------- 常量 ---------------- */
  var LS_KEY = 'wenxi.pet.pos.v3';
  var DRAG_THRESHOLD = 5;   // 位移 < 5px 视为点击，不视为拖动
  var CLICK_GUARD_MS = 600; // 拖完立刻松手会补发 click，这段时间内吞掉
  var BUBBLE_MS = 3000;     // bubble() 默认展示时长
  var FLIP_MARGIN = 12;     // 卡片翻转留白

  /* ---------------- DOM 模板 ---------------- */
  var TEMPLATE = [
    '<button class="pet-figure" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="闻息桌宠。点开看此刻，按住可拖动。">',
    '  <span class="pet-glow" aria-hidden="true"></span>',
    '  <span class="pet-wisp pet-wisp-a" aria-hidden="true"></span>',
    '  <span class="pet-wisp pet-wisp-b" aria-hidden="true"></span>',
    '  <span class="pet-wisp pet-wisp-c" aria-hidden="true"></span>',
    '  <svg class="pet-censer" viewBox="0 0 80 80" aria-hidden="true" focusable="false">',
    '    <defs>',
    '      <radialGradient id="petPotGrad" cx="34%" cy="16%" r="94%">',
    '        <stop offset="0%" class="pet-st pot-hi"/>',
    '        <stop offset="34%" class="pet-st pot-mid"/>',
    '        <stop offset="72%" class="pet-st pot-deep"/>',
    '        <stop offset="100%" class="pet-st pot-lo"/>',
    '      </radialGradient>',
    '      <linearGradient id="petRimGrad" x1="0" y1="0" x2="1" y2="1">',
    '        <stop offset="0%" class="pet-st rim-1"/>',
    '        <stop offset="42%" class="pet-st rim-2"/>',
    '        <stop offset="74%" class="pet-st rim-1"/>',
    '        <stop offset="100%" class="pet-st rim-2"/>',
    '      </linearGradient>',
    '      <radialGradient id="petHaloGrad" cx="50%" cy="50%" r="50%">',
    '        <stop offset="0%" class="pet-st halo-1"/>',
    '        <stop offset="54%" class="pet-st halo-2"/>',
    '        <stop offset="100%" class="pet-st halo-3"/>',
    '      </radialGradient>',
    '      <radialGradient id="petEmberGrad" cx="50%" cy="50%" r="50%">',
    '        <stop offset="0%" class="pet-st ember-1"/>',
    '        <stop offset="48%" class="pet-st ember-2"/>',
    '        <stop offset="100%" class="pet-st ember-3"/>',
    '      </radialGradient>',
    '      <filter id="petHaloBlur" x="-60%" y="-60%" width="220%" height="220%">',
    '        <feGaussianBlur stdDeviation="5"/>',
    '      </filter>',
    '    </defs>',
    '    <ellipse class="pet-halo" cx="40" cy="33" rx="29" ry="23" fill="url(#petHaloGrad)" filter="url(#petHaloBlur)"/>',
    '    <ellipse class="pet-ground" cx="40" cy="68.4" rx="16" ry="3"/>',
    '    <path class="pet-foot" d="M30.6 56 L29 66.2 Q28.8 68 30.4 68 L33.6 68 Q35 68 35 66.4 L35.4 56 Z"/>',
    '    <path class="pet-foot" d="M49.4 56 L51 66.2 Q51.2 68 49.6 68 L46.4 68 Q45 68 45 66.4 L44.6 56 Z"/>',
    '    <path class="pet-ear" d="M13.6 39.4 C 7.4 38.6 4.8 33.2 7.6 28.4"/>',
    '    <path class="pet-ear" d="M66.4 39.4 C 72.6 38.6 75.2 33.2 72.4 28.4"/>',
    '    <path class="pet-body" d="M13 38 Q13.8 58.4 40 63.2 Q66.2 58.4 67 38 Z" fill="url(#petPotGrad)"/>',
    '    <ellipse class="pet-sheen" cx="26.4" cy="47" rx="6.2" ry="9.4" transform="rotate(-14 26.4 47)"/>',
    '    <ellipse class="pet-shade" cx="55.2" cy="50" rx="6.8" ry="10" transform="rotate(16 55.2 50)"/>',
    '    <path class="pet-inscription" d="M21 47.4 Q40 52.8 59 47.4"/>',
    '    <ellipse class="pet-rim" cx="40" cy="38" rx="27" ry="6.6" fill="url(#petPotGrad)"/>',
    '    <ellipse class="pet-mouth" cx="40" cy="38.4" rx="21.6" ry="4.2"/>',
    '    <ellipse class="pet-ember" cx="40" cy="38.6" rx="13" ry="3.2" fill="url(#petEmberGrad)"/>',
    '    <ellipse class="pet-rim-line" cx="40" cy="38" rx="27" ry="6.6" fill="none" stroke="url(#petRimGrad)"/>',
    '  </svg>',
    '  <span class="pet-warn" aria-hidden="true"></span>',
    '</button>',
    '<div class="pet-caption" aria-hidden="true">',
    '  <span class="pet-line"></span>',
    '  <span class="pet-run"><i class="pet-run-dot"></i><span class="pet-run-text"></span></span>',
    '</div>',
    '<div class="pet-card" role="dialog" aria-modal="false" aria-label="闻息 · 此刻" aria-hidden="true">',
    '  <div class="pet-card-top">',
    '    <span class="pet-card-title">此刻</span>',
    '    <button class="pet-close" type="button" aria-label="收起卡片"></button>',
    '  </div>',
    '  <div class="pet-metrics">',
    '    <div class="pet-metric">',
    '      <span class="pet-metric-label">心率</span>',
    '      <span class="pet-metric-val"><b class="pet-hr">—</b><i>bpm</i></span>',
    '    </div>',
    '    <div class="pet-metric">',
    '      <span class="pet-metric-label">HRV</span>',
    '      <span class="pet-metric-val"><b class="pet-hrv">—</b><i>ms</i></span>',
    '    </div>',
    '  </div>',
    '  <div class="pet-stress">',
    '    <span class="pet-stress-label">气息</span>',
    '    <span class="pet-stress-bar" aria-hidden="true"><i></i></span>',
    '    <span class="pet-stress-word">—</span>',
    '  </div>',
    '  <div class="pet-scent">',
    '    <div class="pet-scent-row">',
    '      <span class="pet-scent-name">沉香 · 竹青 · 龙脑</span>',
    '      <span class="pet-scent-remain">待机</span>',
    '    </div>',
    '    <div class="pet-scent-bar" aria-hidden="true"><i></i></div>',
    '    <div class="pet-scent-foot">',
    '      <span class="pet-scene">专注</span>',
    '      <span class="pet-scent-state">未运行</span>',
    '    </div>',
    '  </div>',
    '  <div class="pet-conns">',
    '    <span class="pet-conn pet-conn-watch" data-on="1"><i aria-hidden="true"></i>腕表</span>',
    '    <span class="pet-conn pet-conn-diff" data-on="1"><i aria-hidden="true"></i>香薰机</span>',
    '  </div>',
    '  <button class="pet-web" type="button">',
    '    <span>打开网页</span>',
    '    <svg class="pet-web-arrow" viewBox="0 0 12 8" aria-hidden="true" focusable="false"><path d="M0.5 4 H10 M7.2 1.1 L10.4 4 L7.2 6.9"/></svg>',
    '  </button>',
    '</div>',
    '<div class="pet-bubble" role="status" aria-live="polite"><span class="pet-bubble-text"></span></div>'
  ].join('\n');

  /* ---------------- 状态 ---------------- */
  var state = {
    inited: false,
    visible: false,
    wantVisible: null,
    wantOpen: false,
    open: false,
    line: '陪你专注中',
    lineTimer: 0,
    bubbleTimer: 0,
    run: { running: false, remainText: '', name: '', scene: '', progress: null },
    conn: { watch: true, diffuser: true },
    data: { hr: null, hrv: null, stress: null },
    opts: { onOpenWeb: null, onClose: null, onOpen: null }
  };

  var root = null;
  var el = {};
  var drag = { active: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0, w: 76, h: 76 };
  var lastDragEndAt = 0;

  /* ---------------- 小工具 ---------------- */
  function clamp(v, min, max) {
    if (v < min) return min;
    if (v > max) return max;
    return v;
  }

  function str(v) {
    return (v === null || v === undefined) ? '' : String(v);
  }

  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : null;
  }

  function now() {
    return new Date().getTime();
  }

  function viewW() {
    return window.innerWidth || document.documentElement.clientWidth || 0;
  }

  function viewH() {
    return window.innerHeight || document.documentElement.clientHeight || 0;
  }

  function safeCall(fn) {
    if (typeof fn !== 'function') return;
    try { fn(); } catch (err) { /* 回调异常不影响桌宠 */ }
  }

  function isShown() {
    return !!(state.inited && state.visible);
  }

  /* 每秒都会被 setLine / setData 刷新的地方，只在值真的变了才写 DOM，
     省掉无意义的样式重算（桌宠常驻，不抢主线程） */
  function setText(node, t) {
    if (!node) return;
    if (node.textContent !== t) node.textContent = t;
  }

  function setAttr(node, name, value) {
    if (!node) return;
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }

  function setClass(node, name, on) {
    if (!node) return;
    if (node.classList.contains(name) !== !!on) node.classList.toggle(name, !!on);
  }

  /* ---------------- 构建与绑定 ---------------- */
  function build() {
    root.innerHTML = TEMPLATE;
    el.figure = root.querySelector('.pet-figure');
    el.card = root.querySelector('.pet-card');
    el.close = root.querySelector('.pet-close');
    el.web = root.querySelector('.pet-web');
    el.bubble = root.querySelector('.pet-bubble');
    el.bubbleText = root.querySelector('.pet-bubble-text');
    el.caption = root.querySelector('.pet-caption');
    el.line = root.querySelector('.pet-line');
    el.run = root.querySelector('.pet-run');
    el.runText = root.querySelector('.pet-run-text');
    el.hr = root.querySelector('.pet-hr');
    el.hrv = root.querySelector('.pet-hrv');
    el.stressBar = root.querySelector('.pet-stress-bar i');
    el.stressWord = root.querySelector('.pet-stress-word');
    el.scentName = root.querySelector('.pet-scent-name');
    el.scentRemain = root.querySelector('.pet-scent-remain');
    el.scentBar = root.querySelector('.pet-scent-bar i');
    el.scene = root.querySelector('.pet-scene');
    el.scentState = root.querySelector('.pet-scent-state');
    el.connWatch = root.querySelector('.pet-conn-watch');
    el.connDiff = root.querySelector('.pet-conn-diff');
  }

  function bind() {
    if (el.figure) {
      el.figure.addEventListener('pointerdown', onPointerDown, false);
      el.figure.addEventListener('click', onFigureClick, false);
      el.figure.addEventListener('dragstart', function (e) {
        if (e && e.preventDefault) e.preventDefault();
      }, false);
    }
    if (el.caption) {
      el.caption.addEventListener('click', onFigureClick, false);
    }
    if (el.close) {
      el.close.addEventListener('click', function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        closeCard(true, false);
      }, false);
    }
    if (el.web) {
      el.web.addEventListener('click', function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        safeCall(state.opts.onOpenWeb);
      }, false);
    }
    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onKeyDown, false);
    window.addEventListener('resize', onResize, false);
    // 指针在窗口外松开时收不到 pointerup，靠失焦兜底，避免一直粘着拖动
    window.addEventListener('blur', onPointerUp, false);
  }

  /* ---------------- 渲染 ---------------- */
  function renderLine() {
    if (!root) return;
    var t = str(state.line).replace(/^\s+|\s+$/g, '');
    root.classList.remove('is-faded');
    setClass(root, 'is-quiet', t === '');
    setText(el.line, t);
    var label = '闻息桌宠';
    if (t) label += '：' + t;
    label += '。点开看此刻，按住可拖动。';
    setAttr(el.figure, 'aria-label', label);
  }

  // 剩余时长可能是「18 分钟」也可能是「18:00」，桌宠一律收成分钟，不摆秒表
  function remainMinute(s) {
    var t = str(s).replace(/^\s+|\s+$/g, '');
    if (!t) return '';
    var m = t.match(/^(\d{1,3})\s*:\s*(\d{2})$/);
    if (m) {
      var min = parseInt(m[1], 10);
      if (parseInt(m[2], 10) > 0) min += 1;
      return min + ' 分钟';
    }
    return t;
  }

  function remainLabel(s) {
    var t = remainMinute(s);
    if (!t) return '燃烧中';
    if (/剩|余/.test(t)) return t;
    return '剩余 ' + t;
  }

  function burnLabel(s) {
    var t = remainMinute(s);
    if (!t) return '燃烧中';
    if (/烧|燃|薰|焚/.test(t)) return t;
    return '烧 ' + t;
  }

  function renderRun() {
    var r = state.run || {};
    var running = !!r.running;
    setAttr(root, 'data-run', running ? 'true' : 'false');
    setText(el.runText, running ? burnLabel(r.remainText) : '');
    setText(el.scentRemain, running ? remainLabel(r.remainText) : '待机');
    setText(el.scentState, running ? '正在扩香' : '未运行');
    if (str(r.name).replace(/^\s+|\s+$/g, '') !== '') setText(el.scentName, str(r.name));
    if (str(r.scene).replace(/^\s+|\s+$/g, '') !== '') setText(el.scene, str(r.scene));
    var prog = num(r.progress);
    var hasProg = (prog !== null) && running;
    var flow = running && !hasProg;
    setClass(root, 'is-flow', flow);
    setClass(root, 'no-progress', !running);
    if (el.scentBar) {
      var w = hasProg ? (Math.round(clamp(prog, 0, 1) * 100) + '%') : '';
      if (el.scentBar.style.width !== w) el.scentBar.style.width = w;
    }
    renderWarn();
  }

  function fmtInt(v) {
    var n = num(v);
    if (n === null) return '—';
    return String(Math.round(n));
  }

  function renderData() {
    var d = state.data || {};
    setText(el.hr, fmtInt(d.hr));
    setText(el.hrv, fmtInt(d.hrv));
    var s = num(d.stress);
    if (el.stressBar) {
      var w = (s === null ? 0 : Math.round(clamp(s, 0, 1) * 100)) + '%';
      if (el.stressBar.style.width !== w) el.stressBar.style.width = w;
    }
    setText(el.stressWord, (s === null) ? '—' : (s < 0.35 ? '息平' : (s < 0.62 ? '微澜' : '起伏')));
    setAttr(root, 'data-mood', (s !== null && s >= 0.62) ? 'tense' : 'calm');
  }

  function setConnDot(node, on) {
    setAttr(node, 'data-on', on ? '1' : '0');
  }

  // 断连小白点：腕表掉了要提示；香薰机只在「说在烧却连不上」时提示，
  // 待机时 diffuser:false 属于正常态，不报警。
  function renderWarn() {
    if (!root) return;
    var c = state.conn || {};
    var running = !!(state.run && state.run.running);
    var lost = (!c.watch) || (!c.diffuser && running);
    setAttr(root, 'data-warn', lost ? 'true' : 'false');
  }

  function renderConn() {
    var c = state.conn || {};
    setConnDot(el.connWatch, !!c.watch);
    setConnDot(el.connDiff, !!c.diffuser);
    renderWarn();
  }

  function renderAll() {
    renderLine();
    renderRun();
    renderData();
    renderConn();
  }

  /* ---------------- 位置：拖动 / 记忆 / 卡片翻转 ---------------- */
  function savePos() {
    if (!root) return;
    var r = root.getBoundingClientRect();
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify({
        x: Math.round(r.left),
        y: Math.round(r.top)
      }));
    } catch (err) { /* file:// 或隐私模式下静默失败 */ }
  }

  function restorePos() {
    var raw = null;
    try { raw = window.localStorage.getItem(LS_KEY); } catch (err) { raw = null; }
    if (!raw) return;
    var pos = null;
    try { pos = JSON.parse(raw); } catch (err) { pos = null; }
    if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return;
    var w = root.offsetWidth || 76;
    var h = root.offsetHeight || 76;
    root.style.left = Math.round(clamp(pos.x, 4, Math.max(4, viewW() - w - 4))) + 'px';
    root.style.top = Math.round(clamp(pos.y, 4, Math.max(4, viewH() - h - 4))) + 'px';
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  }

  function clampPos() {
    if (!root || !root.style.left) return;
    var w = root.offsetWidth || 76;
    var h = root.offsetHeight || 76;
    var x = parseFloat(root.style.left);
    var y = parseFloat(root.style.top);
    if (!isFinite(x)) x = viewW() - w - 20;
    if (!isFinite(y)) y = viewH() - h - 20;
    root.style.left = Math.round(clamp(x, 4, Math.max(4, viewW() - w - 4))) + 'px';
    root.style.top = Math.round(clamp(y, 4, Math.max(4, viewH() - h - 4))) + 'px';
  }

  // 卡片默认向左上展开；贴近屏幕左/上边时自动翻转，保证不出界
  function updateFlips() {
    if (!root || !el.card) return;
    var r = root.getBoundingClientRect();
    var cw = el.card.offsetWidth || 250;
    var ch = el.card.offsetHeight || 240;
    var flipX = (r.right - cw) < FLIP_MARGIN;
    var flipY = (r.top - ch - FLIP_MARGIN) < FLIP_MARGIN;
    root.classList.toggle('is-flip-x', flipX);
    root.classList.toggle('is-flip-y', flipY);
  }

  /* ---------------- 卡片的开合 ---------------- */
  function openCard(fromKey) {
    if (!state.inited || !root) return;
    if (!state.visible) doShow();
    if (state.open) return;
    state.open = true;
    root.setAttribute('data-open', 'true');
    if (el.figure) el.figure.setAttribute('aria-expanded', 'true');
    if (el.card) el.card.setAttribute('aria-hidden', 'false');
    hideBubble();
    updateFlips();
    safeCall(state.opts.onOpen);
    if (fromKey && el.close && el.close.focus) {
      try { el.close.focus({ preventScroll: true }); } catch (err) { el.close.focus(); }
    }
  }

  function closeCard(notify, fromKey) {
    if (!state.inited || !root || !state.open) return;
    state.open = false;
    root.setAttribute('data-open', 'false');
    if (el.figure) el.figure.setAttribute('aria-expanded', 'false');
    if (el.card) el.card.setAttribute('aria-hidden', 'true');
    if (fromKey && el.figure && el.figure.focus) {
      try { el.figure.focus({ preventScroll: true }); } catch (err2) { el.figure.focus(); }
    }
    if (notify) safeCall(state.opts.onClose);
  }

  /* ---------------- 显隐 ---------------- */
  function doShow() {
    state.visible = true;
    if (!root) return;
    root.classList.remove('is-hidden');
    root.setAttribute('aria-hidden', 'false');
    if (state.open) updateFlips();
  }

  function doHide() {
    state.visible = false;
    if (!root) return;
    closeCard(false, false);
    hideBubble();
    root.classList.add('is-hidden');
    root.setAttribute('aria-hidden', 'true');
  }

  /* ---------------- 气泡 ---------------- */
  function hideBubble() {
    if (state.bubbleTimer) {
      clearTimeout(state.bubbleTimer);
      state.bubbleTimer = 0;
    }
    if (root) root.classList.remove('has-bubble');
  }

  // name: 变化提示（香方微调 / 运行结束 / 设备异常…）
  // 收起卡片时也能看见；卡片展开时气泡落在形象下方，不抢卡片位置
  function bubble(msg, ms) {
    if (!state.inited || !root || !el.bubble) return;
    var s = str(msg).replace(/^\s+|\s+$/g, '');
    var dur = num(ms);
    if (dur === null || dur <= 0) dur = BUBBLE_MS;
    dur = clamp(dur, 1200, 9000);
    if (!isShown()) return;
    if (!s) { hideBubble(); return; }
    if (el.bubbleText) el.bubbleText.textContent = s;
    root.classList.add('has-bubble');
    if (state.bubbleTimer) clearTimeout(state.bubbleTimer);
    state.bubbleTimer = setTimeout(function () {
      state.bubbleTimer = 0;
      hideBubble();
    }, dur);
  }

  /* ---------------- 拖动 ---------------- */
  function onPointerDown(e) {
    if (!state.inited || !root || !state.visible) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.isPrimary === false) return;
    drag.active = true;
    drag.moved = false;
    drag.sx = e.clientX;
    drag.sy = e.clientY;
    var r = root.getBoundingClientRect();
    drag.w = root.offsetWidth || 76;
    drag.h = root.offsetHeight || 76;
    drag.ox = e.clientX - r.left;
    drag.oy = e.clientY - r.top;
    root.classList.add('is-dragging');
    document.addEventListener('pointermove', onPointerMove, false);
    document.addEventListener('pointerup', onPointerUp, false);
    document.addEventListener('pointercancel', onPointerUp, false);
  }

  function onPointerMove(e) {
    if (!drag.active || !root) return;
    var dx = e.clientX - drag.sx;
    var dy = e.clientY - drag.sy;
    if (!drag.moved) {
      if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
    }
    var maxL = Math.max(4, viewW() - drag.w - 4);
    var maxT = Math.max(4, viewH() - drag.h - 4);
    var left = clamp(e.clientX - drag.ox, 4, maxL);
    var top = clamp(e.clientY - drag.oy, 4, maxT);
    root.style.left = Math.round(left) + 'px';
    root.style.top = Math.round(top) + 'px';
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    if (e.cancelable) {
      try { e.preventDefault(); } catch (err) { /* 忽略 */ }
    }
  }

  function onPointerUp() {
    if (!drag.active) return;
    drag.active = false;
    if (root) root.classList.remove('is-dragging');
    document.removeEventListener('pointermove', onPointerMove, false);
    document.removeEventListener('pointerup', onPointerUp, false);
    document.removeEventListener('pointercancel', onPointerUp, false);
    if (drag.moved) {
      lastDragEndAt = now();
      savePos();
      updateFlips();
    }
  }

  /* ---------------- 交互事件 ---------------- */
  function onFigureClick(e) {
    if (!state.inited) return;
    // 刚拖拽完，浏览器补发的 click 直接吞掉
    if (now() - lastDragEndAt < CLICK_GUARD_MS) {
      if (e) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
      }
      return;
    }
    var fromKey = !!(e && e.detail === 0);
    if (state.open) closeCard(true, fromKey);
    else openCard(fromKey);
  }

  function onDocPointerDown(e) {
    if (!state.inited || !state.open || !root) return;
    var t = e.target;
    if (t && root.contains(t)) return;
    closeCard(true, false);
  }

  function onKeyDown(e) {
    if (!state.inited || !state.open) return;
    var k = e.key || '';
    if (k === 'Escape' || k === 'Esc' || e.keyCode === 27) {
      closeCard(true, true);
    }
  }

  function onResize() {
    if (!state.inited || !root) return;
    clampPos();
    updateFlips();
  }

  /* ---------------- 对外方法 ---------------- */
  function init(opts) {
    opts = opts || {};
    if (typeof opts.onOpenWeb === 'function') state.opts.onOpenWeb = opts.onOpenWeb;
    if (typeof opts.onClose === 'function') state.opts.onClose = opts.onClose;
    if (typeof opts.onOpen === 'function') state.opts.onOpen = opts.onOpen;   // 可选：用于同步顶栏按钮状态

    root = document.getElementById('pet');
    if (!root) return false;

    if (!state.inited) {
      build();
      state.inited = true;
      bind();
      restorePos();
    }
    renderAll();

    var want;
    if (opts.visible !== undefined) want = !!opts.visible;
    else if (state.wantVisible !== null) want = state.wantVisible;
    else want = true;
    if (want) doShow();
    else doHide();

    if (state.wantOpen) {
      state.wantOpen = false;
      openCard(false);
    }
    return true;
  }

  function show() {
    state.wantVisible = true;
    if (state.inited) doShow();
  }

  function hide() {
    state.wantVisible = false;
    if (state.inited) doHide();
  }

  // 与 app.js 的用法对齐：toggle() 开合快捷卡片（桌宠本体常驻角落），
  // isOpen() 回卡片是否展开；整只桌宠的显隐交给 show() / hide()。
  function toggle() {
    if (!state.inited) {
      state.wantOpen = !state.wantOpen;
      return;
    }
    if (state.open) closeCard(true, false);
    else openCard(false);
  }

  function isOpen() {
    return !!(state.inited && state.open);
  }

  function isVisible() {
    return isShown();
  }

  function open() {
    if (state.inited) openCard(false);
    else state.wantOpen = true;
  }

  function close() {
    closeCard(true, false);
  }

  // 一句话状态；可选 ms 让它在若干毫秒后淡出（悬停可再看见）
  function setLine(t, ms) {
    state.line = str(t);
    if (state.lineTimer) {
      clearTimeout(state.lineTimer);
      state.lineTimer = 0;
    }
    if (state.inited) renderLine();
    var dur = num(ms);
    if (state.inited && dur !== null && dur > 0) {
      state.lineTimer = setTimeout(function () {
        state.lineTimer = 0;
        if (root) root.classList.add('is-faded');
      }, clamp(dur, 500, 60000));
    }
  }

  // running + remainText 是契约字段；name / scene / progress 为可选增强
  function setRun(o) {
    o = o || {};
    if (o.running !== undefined) state.run.running = !!o.running;
    if (o.remainText !== undefined) state.run.remainText = str(o.remainText);
    if (o.name !== undefined) state.run.name = str(o.name);
    if (o.scene !== undefined) state.run.scene = str(o.scene);
    if (o.progress !== undefined) state.run.progress = o.progress;
    if (state.inited) renderRun();
  }

  function setConn(o) {
    o = o || {};
    if (o.watch !== undefined) state.conn.watch = !!o.watch;
    if (o.diffuser !== undefined) state.conn.diffuser = !!o.diffuser;
    if (state.inited) renderConn();
  }

  function setData(o) {
    o = o || {};
    if (o.hr !== undefined) state.data.hr = o.hr;
    if (o.hrv !== undefined) state.data.hrv = o.hrv;
    if (o.stress !== undefined) state.data.stress = o.stress;
    if (state.inited) renderData();
  }

  /* ---------------- 导出 ---------------- */
  window.Pet = {
    init: init,
    show: show,
    hide: hide,
    toggle: toggle,
    isOpen: isOpen,
    isVisible: isVisible,
    open: open,
    close: close,
    setLine: setLine,
    setRun: setRun,
    setConn: setConn,
    setData: setData,
    bubble: bubble
  };
})(window, document);
