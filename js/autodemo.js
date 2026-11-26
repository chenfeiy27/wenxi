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

  var TOTAL = 90;            // 秒
  var root = document.documentElement;
  var running = false;
  var timers = [];
  var t0 = 0;

  /* ---------------- 工具 ---------------- */
  function $(sel) { return document.querySelector(sel); }
  function sleep(ms) { return new Promise(function (r) { timers.push(setTimeout(r, ms)); }); }
  function el(sel) { try { return $(sel); } catch (e) { return null; } }
  /* ---------- 指示光标：先移动指针，再落点击 ---------- */
  var CURSOR_SVG = '<svg viewBox="0 0 26 30" width="34" height="39" aria-hidden="true">'
    + '<path d="M3 2 L3 23 L8.6 17.6 L12.2 26 L16 24.3 L12.4 16 L20 16 Z" '
    + 'fill="#2B2622" stroke="#FFF8EC" stroke-width="2.2" stroke-linejoin="round"/></svg>';

  function ensurePointer() {
    var cur = $('#adCursor');
    if (!cur) {
      cur = document.createElement('div');
      cur.id = 'adCursor';
      cur.innerHTML = CURSOR_SVG;
      document.body.appendChild(cur);
    }
    var ring = $('#adRing');
    if (!ring) {
      ring = document.createElement('div');
      ring.id = 'adRing';
      document.body.appendChild(ring);
    }
    var tap = $('#adTap');
    if (!tap) {
      tap = document.createElement('div');
      tap.id = 'adTap';
      document.body.appendChild(tap);
    }
    return { cur: cur, ring: ring, tap: tap };
  }

  function point(el, opts) {
    if (!el || !el.getBoundingClientRect) return;
    var P = ensurePointer();
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    var x = r.left + r.width / 2;
    var y = r.top + r.height / 2;
    // 指针：箭尖对准目标中心
    P.cur.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    P.cur.classList.add('on');
    // 光圈：贴住元素外框
    var pad = opts && opts.pad != null ? opts.pad : 6;
    var tooBig = (r.width * r.height) > (window.innerWidth * window.innerHeight * 0.45);
    if (tooBig) {
      P.ring.classList.remove('pulse');
      P.tap.classList.remove('pulse');
      P.tap.style.left = x + 'px';
      P.tap.style.top = y + 'px';
      void P.tap.offsetWidth;
      P.tap.classList.add('pulse');
      clearTimeout(point._t);
      point._t = setTimeout(function () { P.cur.classList.remove('on'); }, 2200);
      return;
    }
    P.ring.style.left = (r.left - pad) + 'px';
    P.ring.style.top = (r.top - pad) + 'px';
    P.ring.style.width = (r.width + pad * 2) + 'px';
    P.ring.style.height = (r.height + pad * 2) + 'px';
    P.ring.style.borderRadius = (opts && opts.radius) || Math.min(16, (r.height / 2 + 4)) + 'px';
    P.ring.classList.remove('pulse');
    void P.ring.offsetWidth;
    P.ring.classList.add('pulse');
    // 落点光斑
    P.tap.style.left = x + 'px';
    P.tap.style.top = y + 'px';
    P.tap.classList.remove('pulse');
    void P.tap.offsetWidth;
    P.tap.classList.add('pulse');
    // 一段时间不动就淡出
    clearTimeout(point._t);
    point._t = setTimeout(function () { P.cur.classList.remove('on'); }, 2200);
  }

  function hidePointer() {
    var c = $('#adCursor'), r = $('#adRing'), t = $('#adTap');
    if (c) c.classList.remove('on');
    if (r) r.classList.remove('pulse');
    if (t) t.classList.remove('pulse');
  }

  /* 点击：先把指针移过去，220ms 后再真的点 */
  function click(sel) {
    var e = typeof sel === 'string' ? el(sel) : sel;
    if (!e) return false;
    point(e);
    timers.push(setTimeout(function () {
      try { e.click(); } catch (err) {}
    }, 220));
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
    point(node, { pad: 18, radius: '24px' });
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
      point(node, { pad: 18, radius: '24px' });
    });
  }
  function drag(node, dx, dy) {
    if (!node) return;
    point(node, { pad: 8 });
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
    point(e, { pad: 6 });
    setTimeout(function () { point(e, { pad: 6 }); }, 260);
    e.value = v;
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function api() { return window.__wenxi || {}; }

  /* ---------------- 字幕 / 进度条 / 开始层 ---------------- */
  function injectStyle() {
    if ($('#adStyle')) return;
    var css = ''
      + '#adCursor{position:fixed;left:0;top:0;width:34px;height:39px;z-index:100001;pointer-events:none;opacity:0;'
      + 'transition:transform .28s cubic-bezier(.22,.7,.3,1),opacity .25s ease;filter:drop-shadow(0 3px 6px rgba(30,24,18,.35))}'
      + '#adCursor.on{opacity:1}'
      + '#adRing{position:fixed;z-index:100000;pointer-events:none;border-radius:14px;border:2.5px solid rgba(166,108,194,.98);background:rgba(166,108,194,.10);'
      + 'box-shadow:0 0 0 3px rgba(166,108,194,.16),0 0 18px rgba(166,108,194,.45);opacity:0}'
      + '#adRing.pulse{animation:adPulse 1.05s cubic-bezier(.2,.7,.3,1) forwards}'
      + '@keyframes adPulse{0%{opacity:0;transform:scale(.92)}18%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.08)}}'
      + '#adTap{position:fixed;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;z-index:100001;'
      + 'background:radial-gradient(circle,rgba(255,255,255,.95) 0%,rgba(166,108,194,.85) 45%,rgba(166,108,194,0) 70%);'
      + 'pointer-events:none;opacity:0}'
      + '#adTap.pulse{animation:adTap .55s ease-out forwards}'
      + '@keyframes adTap{0%{opacity:.95;transform:scale(.5)}100%{opacity:0;transform:scale(2.1)}}'
      + '#adBar{position:fixed;left:0;top:0;height:2px;width:0;z-index:99999;background:linear-gradient(90deg,#A66CC2,#AD9162);opacity:.85;transition:width .2s linear;pointer-events:none}'
      + '#adCap{position:fixed;left:50%;bottom:2.2vh;transform:translateX(-50%);z-index:99999;pointer-events:none;'
      + 'max-width:82vw;text-align:center;line-height:1.5;'
      + 'font-family:"Songti SC",SimSun,serif;font-size:15px;letter-spacing:.12em;color:#FFF8EC;'
      + 'padding:6px 18px;border-radius:18px;background:rgba(38,32,28,.46);backdrop-filter:blur(6px);'
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
  /* 字幕自动避开底部提示条（血氧安全提示 / 系统建议条），
     没有提示条时贴屏幕底部；有提示条时抬到它上方 12px。 */
  function bottomBarTop() {
    var top = window.innerHeight;
    var sels = ['#safetyBar', '#suggestBar'];
    for (var i = 0; i < sels.length; i++) {
      var e = $(sels[i]);
      if (!e) continue;
      var cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (parseFloat(cs.opacity || '1') < 0.05) continue;
      var r = e.getBoundingClientRect();
      if (r.height > 4 && r.top < window.innerHeight - 2) top = Math.min(top, r.top);
    }
    return top;
  }
  function placeCap() {
    var c = $('#adCap');
    if (!c) return;
    var gap = 12;
    var h = c.offsetHeight || 34;
    var barTop = bottomBarTop();
    if (barTop < window.innerHeight - 4) {
      var bottom = Math.max(10, window.innerHeight - barTop + gap);
      c.style.bottom = bottom + 'px';
      c.classList.add('up');
    } else {
      c.style.bottom = '';
      c.classList.remove('up');
    }
  }
  function caption(text) {
    var c = $('#adCap');
    if (!c) { c = document.createElement('div'); c.id = 'adCap'; document.body.appendChild(c); }
    c.textContent = text || '';
    c.classList.toggle('on', !!text);
    placeCap();
    clearInterval(caption._iv);
    if (text) {
      caption._iv = setInterval(placeCap, 400);
    }
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
      /* ---------- 入场 + 今日 ---------- */
      [0.0, '轻触入室，纸面墨迹化开——闻息开始了', function () {
        if (api().theme) api().theme('day');
        if (el('#gate')) click('#gate');
      }],
      [3.2, '今日：腕表与香氛仪的连接状态、电量与余量，一眼看完', function () { api().setView && api().setView('today'); }],
      [6.6, '长按香炉，金色进度环蓄满一圈，就是点燃', function () { pressLong('#censer', 2000); }],
      [9.4, '点燃的一瞬：花瓣张开、粉色香雾升起，一声轻响后转成细细的燃烧声', null],
      /* ---------- 中医状态层 ---------- */
      [12.6, '系统判定为「心火偏亢」：夜间心率没有回落、心率变异性偏低', function () { api().previewState && api().previewState('xinhuo', 3.6); }],
      [16.4, '同一套判据下的另一种倾向：气血两虚，身体的调节储备偏低', function () { api().previewState && api().previewState('qixue', 3.4); }],
      [20.2, '四类复合指纹之阴虚火旺：夜间心率下降不足、变异性走低', function () { api().previewState && api().previewState('yinxu', 3.4); }],
      [24.0, '点开身体数据：心率、HRV、近三十分钟趋势，以及判定的具体依据', function () { click('#btnDetail'); }],
      [28.6, '收起详情，回到安静的今日界面', function () { click('#sheetClose'); }],
      /* ---------- 记录 ---------- */
      [29.6, '记录：本月日历，有过点香的日子会留一枚金点', function () { api().setView && api().setView('records'); }],
      [33.4, '同页下方是心率趋势与香事录——只记录陪伴，不评价状态', function () {
        var cal = el('.rec-cal');
        if (!cal) return;
        var cells = cal.querySelectorAll('div,span,button');
        for (var i = 0; i < cells.length; i++) {
          if (cells[i].children.length === 0 && cells[i].textContent.trim() === '12') { cells[i].click(); return; }
        }
      }],
      /* ---------- 调节 ---------- */
      [37.0, '调节：选一个场景，君臣佐使的配比会自动生成', function () { api().setView && api().setView('adjust'); }],
      [40.4, '切换场景时，三味比例逐帧缓动，像真实换香那样过渡', function () {
        var seq = ['relax', 'sleep', 'lift'];
        seq.forEach(function (name, k) {
          setTimeout(function () { click('.scene[data-scene="' + name + '"]'); }, k * 900);
        });
      }],
      [44.6, '扩香强度五档、时长三档，按此刻想要的浓淡来调', function () { setRange('#intensity', 4); }],
      [48.2, '声音陪伴：静默、环境音、轻音乐，三档可选', function () { var sb = document.querySelectorAll('#soundSeg button'); if (sb[1]) sb[1].click(); }],
      [51.8, '调节权也可以交出去：手动、半自动、自动、完全自动四档', function () {
        var b = document.querySelector('.auto-mode[data-auto="auto"]');
        if (b) b.click();
      }],
      [55.2, '也能直接拖圆环，手动微调三味的比例', function () { drag(el('#arcH0'), 46, 0); }],
      [58.4, '开始运行：进度与倒计时同步走，一炷香烧完便结束', function () { click('#btnStart'); api().run && api().run(true); }],
      [61.6, '半自动模式下，系统会先给一句建议，等你点头才动配比', function () { api().suggest && api().suggest(true); setTimeout(function () { click('#btnAccept'); }, 1400); }],
      /* ---------- 今日 / 桌宠 / 更多 ---------- */
      [65.0, '回到今日：运行中；桌宠可拖动、可置顶，安静陪在旁边', function () { api().setView && api().setView('today'); click('#btnPet'); }],
      [68.6, '更多：360° 样机、声、使用边界，都收在这个菜单里', function () { click('#btnPet'); click('#btnMore'); }],
      [70.6, '声：音效与音乐分别开关，音量单独可调', function () { click('#btnSound'); }],
      [73.0, '点香的脆响、燃烧的底噪与界面提示，都在这里控制', function () { click('#swSfx'); }],
      /* ---------- 360 ---------- */
      [74.6, '360° 查看器：手环 144 帧转台，拖动即刻旋转', function () { click('#soundClose'); click('#btnViewer'); if (window.Viewer360) window.Viewer360.model('band'); }],
      [77.4, '也可用方向键逐帧查看，每一帧相差 2.5 度', function () {
        var n = 0, iv = setInterval(function () { key('ArrowRight'); if (++n > 7) clearInterval(iv); }, 100);
      }],
      [79.6, '同一个查看器里，切换到香炉样机继续看', function () {
        if (window.Viewer360) window.Viewer360.model('censer');
        var n = 0, iv = setInterval(function () { key('ArrowLeft'); if (++n > 6) clearInterval(iv); }, 100);
      }],
      /* ---------- 非遗 + 小游戏 ---------- */
      [82.0, '使用边界与非遗香篆八步：这门技艺编号 Ⅷ-224', function () {
        if (window.Viewer360) window.Viewer360.close();
        click('#btnRef');
      }],
      [84.0, '香事小游戏：4-7-8 呼吸引导，把注意力放回呼吸本身', function () {
        var tab = document.querySelector('[data-ref-page="game"]');
        if (tab) tab.click();
      }],
      [86.0, '切到夜间：雾蓝纸、墨迹转场，器物与文字整体压暗一档', function () {
        click('#refClose');
        api().theme && api().theme('night');
      }],
      [87.4, '夜间点香，花瓣再次张开，一天到这里收个尾', function () { pressLong('#censer', 1600); }],
      [89.4, '闻息 · 非遗药香 × 中医状态 × 香氛装置', null],
      [90.0, '', function () { finish(); }]
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
    /* 保留最后一屏字幕（结束卡），只收进度条 */
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
    hidePointer();
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
