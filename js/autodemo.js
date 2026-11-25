/* ============================================================
   闻息 · 60 秒自动演示脚本（录屏用）
   用法：
     1) index.html?demo=1  → 打开后出现「开始演示」按钮，点一下开始
        （必须先点一下，浏览器才允许播放声音）
     2) 或任意时刻在控制台执行：AutoDemo.start()
     3) Esc 可随时中止
   时间轴 60 秒，覆盖：进门 / 今日 / 长按点香 / 中医状态 / 数据详情 /
   记录日历 / 调节（场景·强度·配比·运行）/ 桌宠 / 更多菜单 / 声 /
   360° 双模型 / 夜间主题 / 夜间点香
   ============================================================ */
(function () {
  'use strict';

  var TOTAL = 60;            // 秒
  var root = document.documentElement;
  var running = false;
  var timers = [];
  var t0 = 0;

  /* ---------------- 工具 ---------------- */
  function $(sel) { return document.querySelector(sel); }
  function sleep(ms) { return new Promise(function (r) { timers.push(setTimeout(r, ms)); }); }
  function el(sel) { try { return $(sel); } catch (e) { return null; } }
  function click(sel) {
    var e = el(sel);
    if (!e) return false;
    e.click();
    return true;
  }
  function firePointer(type, x, y) {
    var ev = new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true,
      clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
      pointerType: 'mouse'
    });
    return ev;
  }
  function centre(node) {
    var r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r };
  }
  function pressLong(sel, ms) {
    var node = el(sel);
    if (!node) return Promise.resolve();
    var c = centre(node);
    var wasLit = document.body.classList.contains('is-lit');
    node.dispatchEvent(firePointer('pointerdown', c.x, c.y));
    return sleep(ms || 2000).then(function () {
      window.dispatchEvent(firePointer('pointerup', c.x, c.y));
      return sleep(320);
    }).then(function () {
      // 兜底：某些录屏环境下合成事件可能被主机吞掉，直接调用 API 确保点燃
      if (!wasLit && !document.body.classList.contains('is-lit')) {
        if (api().ignite) api().ignite();
      }
    });
  }
  function drag(node, dx, dy) {
    if (!node) return;
    var c = centre(node);
    node.dispatchEvent(firePointer('pointerdown', c.x, c.y));
    return sleep(60).then(function () {
      window.dispatchEvent(firePointer('pointermove', c.x + (dx || 0), c.y + (dy || 0)));
      return sleep(140);
    }).then(function () {
      window.dispatchEvent(firePointer('pointerup', c.x + (dx || 0), c.y + (dy || 0)));
    });
  }
  function key(k) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  }
  function setRange(sel, v) {
    var e = el(sel);
    if (!e) return;
    e.value = v;
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function api() { return window.__wenxi || {}; }

  /* ---------------- 字幕 / 进度条 / 开始层 ---------------- */
  function injectStyle() {
    if ($('#adStyle')) return;
    var css = ''
      + '#adBar{position:fixed;left:0;top:0;height:2px;width:0;z-index:99999;background:linear-gradient(90deg,#A66CC2,#AD9162);opacity:.85;transition:width .2s linear;pointer-events:none}'
      + '#adCap{position:fixed;left:50%;bottom:13.5vh;transform:translateX(-50%);z-index:99999;pointer-events:none;'
      + 'font-family:"Songti SC",SimSun,serif;font-size:17px;letter-spacing:.14em;color:#FFF8EC;'
      + 'padding:9px 22px;border-radius:22px;background:rgba(38,32,28,.46);backdrop-filter:blur(6px);'
      + 'white-space:nowrap;opacity:0;transition:opacity .45s ease}'
      + '#adCap.on{opacity:1}'
      + '#adStart{position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;'
      + 'justify-content:center;gap:22px;background:rgba(30,26,22,.72);backdrop-filter:blur(4px);'
      + 'font-family:"Songti SC",SimSun,serif;color:#F6EFE2}'
      + '#adStart h1{margin:0;font-size:34px;letter-spacing:.34em;font-weight:400}'
      + '#adStart p{margin:0;font-size:13px;letter-spacing:.2em;color:#C9BFAE}'
      + '#adBtn{margin-top:6px;padding:14px 44px;border-radius:30px;border:1px solid rgba(246,239,226,.5);'
      + 'background:rgba(246,239,226,.08);color:#F6EFE2;font-size:15px;letter-spacing:.26em;cursor:pointer;'
      + 'font-family:inherit;transition:background .2s}'
      + '#adBtn:hover{background:rgba(246,239,226,.2)}'
      + '#adCount{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;'
      + 'font-family:"Songti SC",SimSun,serif;font-size:120px;color:#FFF8EC;background:rgba(24,20,18,.55);'
      + 'letter-spacing:.1em}'
      + '#adCount.on{display:flex}';
    var s = document.createElement('style');
    s.id = 'adStyle';
    s.textContent = css;
    document.head.appendChild(s);
  }
  function caption(text) {
    var c = $('#adCap');
    if (!c) { c = document.createElement('div'); c.id = 'adCap'; document.body.appendChild(c); }
    c.textContent = text || '';
    c.classList.toggle('on', !!text);
  }
  function bar(pct) {
    var b = $('#adBar');
    if (!b) { b = document.createElement('div'); b.id = 'adBar'; document.body.appendChild(b); }
    b.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }
  function overlay() {
    if ($('#adStart')) return;
    var d = document.createElement('div');
    d.id = 'adStart';
    d.innerHTML = '<h1>闻 息</h1><p>60 秒功能演示 · 用于录屏</p>'
      + '<button id="adBtn" type="button">开 始 演 示</button>'
      + '<p style="font-size:11px;opacity:.7">点击后 3 秒倒计时开始，播放期间请勿操作；Esc 可中止</p>';
    document.body.appendChild(d);
    $('#adBtn').addEventListener('click', function () {
      d.remove();
      countdown(3);
    });
  }
  function countdown(n) {
    var c = $('#adCount');
    if (!c) { c = document.createElement('div'); c.id = 'adCount'; document.body.appendChild(c); }
    c.classList.add('on');
    c.textContent = n;
    if (n > 1) {
      timers.push(setTimeout(function () { countdown(n - 1); }, 1000));
    } else {
      timers.push(setTimeout(function () { c.classList.remove('on'); c.textContent = ''; run(); }, 700));
    }
  }

  /* ---------------- 时间轴 ---------------- */
  function steps() {
    return [
      [0.0, '轻 触 入 室', function () {
        if (api().theme) api().theme('day');
        if (el('#gate')) click('#gate');
      }],
      [2.6, '今日 · 腕表与香氛仪状态', function () { api().setView && api().setView('today'); }],
      [5.0, '长按香炉 1.8 秒 · 点香', function () { pressLong('#censer', 2000); }],
      [7.9, '点燃 · 花瓣张开 · 粉色香雾 · 一声脆响', null],
      [10.4, '中医状态层 · 心火偏亢（含置信度与依据）', function () { api().previewState && api().previewState('heartFire', 3.2); }],
      [13.6, '四类复合指纹 · 气血两虚', function () { api().previewState && api().previewState('qiBlood', 2.8); }],
      [16.4, '点开数据详情 · 心率 / HRV / 趋势 / 判定依据', function () { click('#btnDetail'); }],
      [19.4, '收起详情', function () { click('#sheetClose'); }],
      [20.2, '记录 · 本月日历（有点香记录的日子带金点）', function () { api().setView && api().setView('records'); }],
      [24.0, '记录页 · 心率趋势与香事录', function () {
        var cal = el('.rec-cal');
        if (!cal) return;
        var cells = cal.querySelectorAll('div,span,button');
        for (var i = 0; i < cells.length; i++) {
          if (cells[i].children.length === 0 && cells[i].textContent.trim() === '12') { cells[i].click(); return; }
        }
      }],
      [26.6, '调节 · 选场景，君臣佐使自动配比', function () { api().setView && api().setView('adjust'); }],
      [28.4, '切换场景 · 放松（配比逐帧缓动）', function () { click('.scene[data-scene="relax"]'); }],
      [31.2, '扩香强度 · 五档滑杆', function () { setRange('#intensity', 4); }],
      [33.2, '直接拖动圆环，调整三味配比', function () { drag(el('#arcH0'), 46, 0); }],
      [35.8, '开始运行 · 进度与倒计时', function () { click('#btnStart'); api().run && api().run(true); }],
      [38.0, '回到今日 · 运行中', function () { api().setView && api().setView('today'); }],
      [39.6, '桌宠 · 可拖动、可置顶', function () { click('#btnPet'); }],
      [41.4, '更多 · 360° 样机 / 音效 / 说明', function () { click('#btnPet'); click('#btnMore'); }],
      [42.4, '声 · 音效与音乐开关', function () { click('#btnSound'); }],
      [43.6, '音效开启', function () { click('#swSfx'); }],
      [44.8, '360° 样机查看器 · 144 帧转台', function () { click('#soundClose'); click('#btnViewer'); }],
      [46.4, '手环样机 · 拖动旋转', function () { if (window.Viewer360) window.Viewer360.model('band'); }],
      [47.8, '拖动旋转（← → 逐帧）', function () {
        var n = 0, iv = setInterval(function () { key('ArrowRight'); if (++n > 8) clearInterval(iv); }, 100);
      }],
      [50.0, '香炉样机 · 拖动旋转', function () {
        if (window.Viewer360) window.Viewer360.model('censer');
        var n = 0, iv = setInterval(function () { key('ArrowLeft'); if (++n > 6) clearInterval(iv); }, 100);
      }],
      [52.2, '熄灭 · 切到夜间主题（墨迹转场）', function () {
        if (window.Viewer360) window.Viewer360.close();
        api().extinguish && api().extinguish();
        api().theme && api().theme('night');
      }],
      [54.6, '夜间点香 · 花瓣再张开', function () { pressLong('#censer', 2000); }],
      [57.6, '闻息 · 非遗药香 × 中医状态 × 香氛装置', null],
      [60.0, '', function () { finish(); }]
    ];
  }

  function run() {
    if (running) return;
    running = true;
    injectStyle();
    t0 = performance.now();
    var list = steps();
    var i = 0;
    var initialTheme = root.getAttribute('data-theme');

    function loop() {
      if (!running) return;
      var now = (performance.now() - t0) / 1000;
      bar(now / TOTAL * 100);
      if (i >= list.length || now > TOTAL + 1) { finish(); return; }
      var st = list[i];
      if (now >= st[0]) {
        if (st[1]) caption(st[1]);
        if (st[2]) { try { st[2](); } catch (e) { console.warn('[demo]', e); } }
        i++;
      }
      requestAnimationFrame(loop);
    }
    loop();

    // 提前中止
    function onKey(e) {
      if (e.key === 'Escape') { stop(); }
    }
    window.addEventListener('keydown', onKey, true);
    timers._esc = onKey;
    console.log('[AutoDemo] 开始，时长 ' + TOTAL + ' 秒');
    window.__adInitialTheme = initialTheme;
  }

  function finish() {
    caption('');
    var b = $('#adBar');
    if (b) b.style.width = '100%';
    timers.push(setTimeout(function () { if (b) b.remove(); }, 600));
    running = false;
    console.log('[AutoDemo] 结束');
  }

  function stop() {
    running = false;
    timers.forEach(function (t) { clearTimeout(t); });
    timers = [];
    if (timers._esc) window.removeEventListener('keydown', timers._esc, true);
    caption('');
    var b = $('#adBar'); if (b) b.remove();
    var c = $('#adCap'); if (c) c.remove();
    console.log('[AutoDemo] 已中止');
  }

  window.AutoDemo = { start: run, stop: stop, total: TOTAL };

  /* ---------------- 启动 ---------------- */
  function boot() {
    injectStyle();
    var q = new URLSearchParams(location.search);
    if (q.get('demo') === '1') {
      if (q.get('auto') === '1') { run(); } else { overlay(); }
      return;
    }
    // 普通打开也能启动：按 D 键
    window.addEventListener('keydown', function (e) {
      if ((e.key === 'd' || e.key === 'D') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (!document.getElementById('adStart') && !document.querySelector('#adCap, #adBar')) run();
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
