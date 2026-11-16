/* ============================================================
   闻息 v3 · app.js
   视图：今日 / 调节 / 记录     主题：night / day
   模块：ScentViz（香方配比）、Pet（桌宠）可选，缺失时降级
   ============================================================ */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var body = doc.body;

  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- 常量 ---------- */
  var LS_THEME = 'wenxi.theme.v3';
  var LS_COACH = 'wenxi.coach.v3';
  var PRESS_SECONDS = 1.8;
  var BREATH_IN = 4, BREATH_HOLD = 1, BREATH_OUT = 4;
  var BREATH_CYCLE = BREATH_IN + BREATH_HOLD + BREATH_OUT;
  var BASELINE = { restHR: 68, restHRV: 62 };

  var SCENT_DEF = {
    chenxiang: { name: '沉香', night: '#C9A063', day: '#B07B33' },
    zhuqing:   { name: '竹青', night: '#7A9E7E', day: '#5E7A62' },
    longnao:   { name: '龙脑', night: '#C05A4E', day: '#A63A2C' }
  };

  var SCENES = {
    focus: { label: '专注', mix: { chenxiang: .40, zhuqing: .40, longnao: .20 } },
    relax: { label: '放松', mix: { chenxiang: .30, zhuqing: .55, longnao: .15 } },
    sleep: { label: '入睡', mix: { chenxiang: .50, zhuqing: .40, longnao: .10 } },
    lift:  { label: '提神', mix: { chenxiang: .25, zhuqing: .30, longnao: .45 } }
  };

  var INTENSITY_LABEL = { 1: '微', 2: '淡', 3: '中', 4: '浓', 5: '沉' };

  /* ---------- DOM ---------- */
  var el = {
    themeLabel: $('#themeLabel'),
    btnTheme: $('#btnTheme'),
    btnPet: $('#btnPet'),
    btnSound: $('#btnSound'),
    btnRef: $('#btnRef'),
    btnHelp: $('#btnHelp'),
    tabs: $$('.tab'),

    views: { today: $('#view-today'), adjust: $('#view-adjust'), records: $('#view-records') },

    censer: $('#censer'),
    censerHint: $('#censerHint'),
    spiralGroup: $('#spiralGroup'),
    spiralBase: $('#spiralBase'),
    spiralBurned: $('#spiralBurned'),
    spiralEmber: $('#spiralEmber'),
    stateLine: $('#stateLine'),
    btnDetail: $('#btnDetail'),

    watchDot: $('#watchDot'), watchState: $('#watchState'),
    watchSensing: $('#watchSensing'), watchBatt: $('#watchBatt'),
    diffDot: $('#diffDot'), diffState: $('#diffState'),
    diffStock: $('#diffStock'), diffRemain: $('#diffRemain'),

    hr: $('#hr'), hrv: $('#hrv'), dataTime: $('#dataTime'),
    miniTrend: $('#miniTrend'),
    smoke: $('#smoke'),

    hrPill: $('#hrPill'), scentPill: $('#scentPill'), bodyLine: $('#bodyLine'),
    tcmTag: $('#tcmTag'), tcmNote: $('#tcmNote'), tcmWhy: $('#tcmWhy'),
    tcmConf: $('#tcmConf'), tcmBasis: $('#tcmBasis'), scentRoles: $('#scentRoles'),
    safetyBar: $('#safetyBar'), safetyText: $('#safetyText'), safetyClose: $('#safetyClose'),
    watchPill: $('#watchPill'), diffPill: $('#diffPill'),
    railBtns: $$('.rail-btn'),
    sheet: $('#sheet'), sheetClose: $('#sheetClose'),
    sheetPanels: $$('.sheet-panel'),

    csteps: $$('.cstep'), cpages: $$('.coach-page'),
    coachNext: $('#coachNext'), coachPrev: $('#coachPrev'), coachCount: $('#coachCount'),

    scentName: $('#scentName'), scentRemain: $('#scentRemain'),
    scentChips: $('#scentChips'),
    scentThin: $('#scentThin'), btnPause: $('#btnPause'), btnGotoAdjust: $('#btnGotoAdjust'),

    themeWipe: $('#inkWipe'),
    gate: $('#gate'),

    dailySummary: $('#dailySummary'),

    scenes: $$('.scene'),
    intensity: $('#intensity'), intensityVal: $('#intensityVal'),
    durations: $$('.seg-btn[data-min]'),
    soundSeg: $$('.seg-btn[data-snd]'),
    scentViz: $('#scentViz'), scentLegend: $('#scentLegend'), vizNote: $('#vizNote'),

    autoModes: $$('.auto-mode'),
    runBar: $('#runBar'), runTime: $('#runTime'), runState: $('#runState'),
    btnStart: $('#btnStart'), btnStop: $('#btnStop'),

    suggestBar: $('#suggestBar'), suggestText: $('#suggestText'),
    btnAccept: $('#btnAccept'), btnKeep: $('#btnKeep'),

    calendar: $('#calendar'), trendBig: $('#trendBig'), eventLog: $('#eventLog'),

    refSheet: $('#refSheet'), refClose: $('#refClose'),
    coach: $('#coach'), coachOk: $('#coachOk'),
    toast: $('#toast')
  };

  /* ---------- 状态 ---------- */
  var state = {
    view: 'today',
    theme: 'night',
    entered: false,
    tcm: { key: 'heping', name: '平和', note: '气血调匀', why: '', mix: null },
    tcmSame: 0,
    demoMode: false,
    demoStart: 0,
    spo2: 97,
    spo2Hist: [],
    safetyOpen: false,
    safetyUntil: 0,
    lit: false,
    mode: null,
    status: 'normal',
    pressing: false,
    press: 0,
    clock: 0,
    breathClock: 0,
    breath: .16,
    burn: 0,
    hr: 68, hrv: 62, activity: .2, stress: .05,
    scene: 'focus',
    intensity: 3,
    durationMin: 20,
    mix: { chenxiang: .40, zhuqing: .40, longnao: .20 },
    targetMix: { chenxiang: .40, zhuqing: .40, longnao: .20 },
    running: false,
    paused: false,
    igniting: false,
    ignitionStart: 0,
    pressStart: 0,
    runElapsed: 0,
    auto: 'semi',
    sound: false,
    lights: 0,
    lightsMinutes: 42,
    log: [],
    history: [],
    suggestTick: 0,
    suggestMode: 'scent',
    coachSeen: false,
    petOn: false,
    lastFrame: 0,
    dataAcc: 0,
    histAcc: 0,
    toastTimer: 0
  };

  /* ---------- 主题 ---------- */
  function applyTheme(t, silent) {
    state.theme = t;
    root.setAttribute('data-theme', t);
    body.setAttribute('data-theme', t);
    if (el.themeLabel) el.themeLabel.textContent = (t === 'night' ? '夜' : '日');
    var meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'night' ? '#3B4650' : '#F4ECDD');
    try { localStorage.setItem(LS_THEME, t); } catch (e) { /* noop */ }

    // 烟的颜色随主题变：夜里白光烟（加法发光），白天墨烟（正常叠加）
    if (window.Smoke && Smoke.setStyle) {
      try {
        if (t === 'day') Smoke.setStyle({ color: [255, 255, 255], blend: 'lighter', gain: 3.2 });
        else Smoke.setStyle({ color: [193, 213, 229], blend: 'source-over', gain: .8 });
      } catch (e) { /* noop */ }
    }
    pushScent();
    renderLegend();
    renderCalendar();
    drawTrendBig();
    if (!silent) showToast(t === 'night' ? '夜 · 雾蓝香事' : '日 · 晨光香事');
  }

  /* 通用墨迹：color 铺满 → onPeak（墨盖住时切主题/撤门）→ 淡出 → onEnd */
  function inkWash(color, onPeak, onEnd) {
    var svg = el.themeWipe;
    if (!svg) {
      if (onPeak) onPeak();
      if (onEnd) onEnd();
      return;
    }
    var blob = svg.querySelector('#inkBlob');
    var halo = svg.querySelector('#inkHalo');
    if (blob) { blob.setAttribute('fill', color); blob.setAttribute('r', '6'); }
    if (halo) { halo.setAttribute('fill', color); halo.setAttribute('r', '6'); }

    svg.classList.add('go');
    var t0 = performance.now();
    var DUR = 900;
    var peaked = false;

    function step(now) {
      var p = Math.min(1, (now - t0) / DUR);
      var e = Math.pow(p, 1.7);
      if (blob) blob.setAttribute('r', (6 + e * 1240).toFixed(1));
      if (halo) halo.setAttribute('r', (6 + e * 1360 + 22).toFixed(1));
      if (!peaked && p > 0.6) { peaked = true; if (onPeak) onPeak(); }
      if (p < 1) {
        window.requestAnimationFrame(step);
      } else {
        svg.style.opacity = '0';
        window.setTimeout(function () {
          svg.classList.remove('go');
          svg.style.opacity = '';
          if (blob) blob.setAttribute('r', '6');
          if (halo) halo.setAttribute('r', '6');
          if (onEnd) onEnd();
        }, 300);
      }
    }
    window.requestAnimationFrame(step);
  }

  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* 进门：墨过 → 撤门 */
  function enterApp() {
    if (state.entered) return;
    state.entered = true;
    if (!el.gate) return;
    el.gate.classList.add('leaving');
    window.setTimeout(function () {
      el.gate.classList.add('out');
      window.setTimeout(function () { el.gate.style.display = 'none'; }, 650);
    }, reduceMotion ? 0 : 350);
  }

  function toggleTheme() {
    applyTheme(state.theme === 'night' ? 'day' : 'night');
  }

  /* ---------- 视图 ---------- */
  function setView(v) {
    if (!el.views[v]) return;
    cancelPress();
    closeSheet();
    state.view = v;
    body.setAttribute('data-view', v);
    for (var k in el.views) {
      if (!el.views.hasOwnProperty(k)) continue;
      el.views[k].classList.toggle('is-on', k === v);
    }
    for (var i = 0; i < el.tabs.length; i++) {
      var on = el.tabs[i].getAttribute('data-view') === v;
      el.tabs[i].classList.toggle('is-on', on);
      el.tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    if (v === 'records') { renderCalendar(); renderLog(); drawTrendBig(); }
    if (v === 'adjust') ensureViz();
    // 视图切换后炉子位置变了，重新定位烟源
    window.setTimeout(layoutSmoke, 60);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- 香方 ---------- */
  function scentColor(key) {
    var d = SCENT_DEF[key] || SCENT_DEF.chenxiang;
    return state.theme === 'day' ? d.day : d.night;
  }

  function mixList() {
    var out = [];
    for (var k in state.mix) {
      if (!state.mix.hasOwnProperty(k)) continue;
      if (state.mix[k] < 0.005) continue;
      out.push({ key: k, name: SCENT_DEF[k].name, ratio: state.mix[k], color: scentColor(k) });
    }
    return out;
  }

  function pushScent() {
    if (window.Botanical) Botanical.setMix(state.targetMix);
    if (window.ScentViz && window.ScentViz.set) {
      try { window.ScentViz.set(mixList()); } catch (e) { /* noop */ }
    }
  }

  // 香方可视化必须在「可见」时初始化，否则容器 0 尺寸会画出空 canvas
  var vizInited = false;
  function ensureViz() {
    if (vizInited) return;
    if (!window.ScentViz || !window.ScentViz.init) return;
    vizInited = true;
    try { window.ScentViz.init(el.scentViz, el.scentLegend); } catch (e) { vizInited = false; }
    pushScent();
  }

  function renderLegend() {
    if (vizInited) return; // 由 ScentViz 模块自己渲染
    if (!el.scentLegend) return;
    var list = mixList();
    var html = '';
    for (var i = 0; i < list.length; i++) {
      html += '<span class="lg"><i style="background:' + list[i].color + '"></i>' +
              '<b>' + esc(list[i].name) + '</b>' +
              '<em>' + Math.round(list[i].ratio * 100) + '%</em></span>';
    }
    el.scentLegend.innerHTML = html;
  }

  function renderScentName() {
    var list = mixList();
    var names = [];
    for (var i = 0; i < list.length; i++) names.push(list[i].name);
    if (el.scentName) el.scentName.textContent = names.join(' · ') || '未配香';

    // 三枚小色块代替一段文字说明：色 · 名 · 百分比
    if (el.scentChips) {
      var c = '';
      for (var k = 0; k < list.length; k++) {
        c += '<span><i style="background:' + list[k].color + '"></i>' + esc(list[k].name) +
             '<em>' + Math.round(list[k].ratio * 100) + '%</em></span>';
      }
      el.scentChips.innerHTML = c;
    }

    if (el.scentThin) {
      var h = '';
      for (var j = 0; j < list.length; j++) {
        h += '<i style="width:' + (list[j].ratio * 100).toFixed(1) + '%;background:' + list[j].color + '"></i>';
      }
      el.scentThin.innerHTML = h;
    }
  }

  function setScene(key) {
    if (!SCENES[key]) return;
    state.scene = key;
    state.targetMix = SCENES[key].mix;
    for (var i = 0; i < el.scenes.length; i++) {
      el.scenes[i].classList.toggle('is-on', el.scenes[i].getAttribute('data-scene') === key);
    }
    if (el.vizNote) el.vizNote.textContent = '场景「' + SCENES[key].label + '」· 配比缓慢过渡中';
    logEvent('场景 · ' + SCENES[key].label);
    petBubble('场景已切换 · ' + SCENES[key].label);
  }

  function setIntensity(v) {
    state.intensity = clamp(v | 0, 1, 5);
    if (el.intensityVal) el.intensityVal.textContent = INTENSITY_LABEL[state.intensity] || '中';
    if (el.intensity) el.intensity.value = String(state.intensity);
  }

  function setDuration(min) {
    state.durationMin = min | 0;
    for (var i = 0; i < el.durations.length; i++) {
      el.durations[i].classList.toggle('is-on', (el.durations[i].getAttribute('data-min') | 0) === state.durationMin);
    }
    if (state.paused && state.runElapsed >= state.durationMin * 60) stopRun(false);
    syncRunUI();
  }

  function setAuto(m) {
    state.auto = m;
    for (var i = 0; i < el.autoModes.length; i++) {
      el.autoModes[i].classList.toggle('is-on', el.autoModes[i].getAttribute('data-auto') === m);
    }
    var label = { manual: '完全手动', semi: '半自动 · 提示确认', auto: '自动 · 提示', full: '完全自动' }[m];
    logEvent('控制权 · ' + label);
    if (m === 'manual' || m === 'full') hideSuggest();
    showToast('控制权：' + label);
  }

  /* ---------- 运行 ---------- */
  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function startRun() {
    if (state.running || state.igniting) return;
    if (state.paused) { completeIgnition(true); return; }
    ignite();
  }

  function syncRunUI() {
    var remain = Math.max(0, state.durationMin * 60 - state.runElapsed);
    var label = state.igniting ? '点香中' : state.running ? '运行中' : state.paused ? '已暂停' : '未开始';
    if (el.runState) el.runState.textContent = label;
    if (el.runTime) el.runTime.textContent = fmt(remain);
    if (el.runBar) el.runBar.style.width = (state.runElapsed / (state.durationMin * 60) * 100) + '%';
    if (el.btnStart) { el.btnStart.textContent = state.igniting ? '点香中' : state.running ? '暂停' : state.paused ? '继续' : '开始'; el.btnStart.disabled = state.igniting; }
    if (el.btnPause) { el.btnPause.textContent = state.igniting ? '点香中' : state.running ? '暂停' : state.paused ? '继续' : '开始'; el.btnPause.disabled = state.igniting; }
    if (el.scentRemain) el.scentRemain.textContent = state.igniting ? '正在点香' : state.paused ? '已暂停 · 剩余 ' + fmt(remain) : state.running ? '剩余 ' + fmt(remain) : '尚未开始';
    if (window.Pet) Pet.setRun({ running: state.running, remainText: state.paused ? '已暂停 · ' + fmt(remain) : state.running ? fmt(remain) : '' });
    updateToday();
    updateDevicePanel();
  }

  function completeIgnition(resuming) {
    state.igniting = false;
    state.paused = false;
    state.lit = true;
    state.running = true;
    state.breathClock = 0;
    body.classList.remove('is-igniting');
    body.classList.add('is-lit');
    if (el.censer) el.censer.setAttribute('aria-pressed', 'true');
    if (el.censerHint) el.censerHint.classList.add('is-hidden');
    if (!resuming) state.lights += 1;
    if (window.AudioFX) { try { if (state.sound) AudioFX.breathe(true); } catch (e) {} }
    logEvent(resuming ? '继续调节' : '点香 · ' + SCENES[state.scene].label);
    syncRunUI();
  }

  function tickIgnition() {
    if (!state.igniting) return;
    var p = clamp((performance.now() - state.ignitionStart) / 1000, 0, 1);
    root.style.setProperty('--ignition-tail', p.toFixed(3));
    if (p >= 1) completeIgnition(state.paused);
  }

  function pauseRun() {
    if (!state.running && !state.igniting) return;
    state.running = false;
    state.paused = true;
    extinguish();
    hideSuggest();
    logEvent('暂停调节');
    syncRunUI();
  }

  function toggleRun() {
    if (state.running) pauseRun(); else startRun();
  }

  function stopRun(finished) {
    var was = state.running || state.paused || state.igniting;
    state.running = false;
    state.paused = false;
    state.runElapsed = 0;
    cancelPress();
    extinguish();
    hideSuggest();
    syncRunUI();
    if (finished) { logEvent('一炷香尽'); showToast('这一炷香已结束'); }
    else if (was) logEvent('结束调节');
  }

  function tickRun(dt) {
    if (!state.running) return;
    state.runElapsed += dt;
    var total = state.durationMin * 60;
    var p = clamp(state.runElapsed / total, 0, 1);
    el.runBar.style.width = (p * 100).toFixed(2) + '%';
    var remain = Math.max(0, total - state.runElapsed);
    el.runTime.textContent = fmt(remain);
    if (el.scentRemain) el.scentRemain.textContent = '剩余 ' + Math.ceil(remain / 60) + ' 分';
    if (el.diffRemain) el.diffRemain.textContent = Math.ceil(remain / 60) + ' 分';
    if (window.Pet) Pet.setRun({ running: true, remainText: Math.ceil(remain / 60) + ' 分钟' });
    if (remain <= 0) stopRun(true);
  }

  /* ---------- 香烟：画布铺满视口，发射点在炉口 ---------- */
  function layoutSmoke() {
    if (!window.Smoke || !el.smoke) return;
    try {
      Smoke.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2));
      if (el.censer) {
        var r = el.censer.getBoundingClientRect();
        var source = doc.getElementById('censerSmokeOrigin');
        if (r.width > 4) {
          var origin = source ? source.getBoundingClientRect() : null;
          Smoke.setOrigin(origin ? origin.left : r.left + r.width / 2,
            origin ? origin.top : r.top + r.height * .18);
        }
      }
    } catch (e) { /* noop */ }
  }

  function tickSmoke(dt) {
    if (!window.Smoke || !el.smoke) return;
    try {
      Smoke.setIntensity(state.view === 'today' ? (state.lit ? 1 + state.stress * .5 : state.igniting ? clamp((performance.now() - state.ignitionStart - 450) / 1000, 0, .55) : 0) : 0);
      Smoke.setTurbulence(.28 + state.stress * .55);
      Smoke.update(dt, state.clock);
      Smoke.render();
    } catch (e) { /* noop */ }
  }

  /* ---------- 点香 ---------- */
  function buildSpiral() {
    var path = el.spiralBase;
    if (!path) return;
    var turns = 4, total = Math.PI * 2 * turns, steps = 320, d = '';
    for (var i = 0; i <= steps; i++) {
      var p = i / steps;
      var ang = p * total;
      // 直径收进炉口内（口沿 rx=132），别让盘香戳出边
      var r = 103 - p * 96;
      var x = 200 + r * Math.cos(ang);
      var y = 150 + r * 0.197 * Math.sin(ang);
      d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2);
    }
    path.setAttribute('d', d);
    if (el.spiralBurned) el.spiralBurned.setAttribute('d', d);
    if (el.spiralEmber) el.spiralEmber.setAttribute('d', d);
    if (el.spiralGroup) el.spiralGroup.style.setProperty('--p', '0');
  }

  function ignite() {
    if (state.lit || state.igniting) return;
    state.igniting = true;
    state.ignitionStart = performance.now();
    root.style.setProperty('--ignition-tail', '0');
    body.classList.add('is-igniting');
    if (el.censerHint) el.censerHint.textContent = '烟起 · 香暖';
    if (window.AudioFX) { try { AudioFX.ignite(); } catch (e) {} }
    syncRunUI();
    if (reduceMotion) completeIgnition(state.paused);
  }

  function extinguish() {
    state.lit = false;
    state.igniting = false;
    body.classList.remove('is-lit', 'is-igniting', 'mode-soothe', 'mode-joy');
    root.style.setProperty('--ignition-tail', '0');
    if (el.censer) el.censer.setAttribute('aria-pressed', 'false');
    if (el.censerHint) { el.censerHint.classList.remove('is-hidden'); el.censerHint.textContent = '长按 · 点香'; }
    if (window.Smoke && Smoke.clear) Smoke.clear();
    if (window.AudioFX) { try { AudioFX.breathe(false); } catch (e) {} }
    updateToday();
    updateDevicePanel();
  }

  function setModeClass(m) {
    state.mode = m;
    body.classList.toggle('mode-soothe', m === 'soothe');
    body.classList.toggle('mode-joy', m === 'joy');
  }

  /* 长按 */
  function startPress() {
    if (!state.entered || state.igniting || state.view !== 'today') return;
    if (state.lit) { showToast('香已点起 · 可前往调节'); return; }
    if (state.pressing) return;
    state.pressing = true;
    state.pressStart = performance.now();
    state.press = 0;
    root.style.setProperty('--press', '0');
    if (el.censer) el.censer.classList.add('is-pressing');
  }
  function cancelPress() {
    if (!state.pressing) return;
    state.pressing = false;
    state.press = 0;
    root.style.setProperty('--press', '0');
    if (el.censer) el.censer.classList.remove('is-pressing');
  }
  function tickPress() {
    if (!state.pressing) return;
    state.press = (performance.now() - state.pressStart) / 1000;
    var p = clamp(state.press / PRESS_SECONDS, 0, 1);
    root.style.setProperty('--press', p.toFixed(3));
    if (p >= 1) { cancelPress(); ignite(); }
  }

  /* ---------- 呼吸 / 燃烧 ---------- */
  function tickBreath(dt) {
    var target = .12;
    if (state.lit) {
      state.breathClock += dt;
      var ph = state.breathClock % BREATH_CYCLE;
      if (ph < BREATH_IN) target = ph / BREATH_IN;
      else if (ph < BREATH_IN + BREATH_HOLD) target = 1;
      else target = 1 - (ph - BREATH_IN - BREATH_HOLD) / BREATH_OUT;
      target = .12 + target * .88;
      state.breath = target;
      state.burn = (state.burn + dt * (0.6 + (1 - target) * 0.9) / 240) % 1;
    } else {
      state.breath += (target - state.breath) * Math.min(1, dt * 1.5);
    }
    root.style.setProperty('--breath', state.breath.toFixed(3));
    root.style.setProperty('--b', state.breath.toFixed(3));
    if (el.spiralGroup) {
      el.spiralGroup.style.setProperty('--p', state.burn.toFixed(5));
      // 只做左右轻摆（±4°），幅度小到不会顶到口沿
      var rot = -4 + state.breath * 8;
      el.spiralGroup.setAttribute('transform', 'rotate(' + rot.toFixed(2) + ' 200 150)');
    }
    if (window.ScentViz && window.ScentViz.setBreath) {
      try { ScentViz.setBreath(state.breath); } catch (e) {}
    }
  }

  /* ---------- 数据 ---------- */
  /* ---------- 演示模式（录屏 / 答辩用：一键自动跑完整流程） ----------
     按 D 开始或停止；数据由脚本驱动，与墙钟对齐，不受帧率影响。
     流程：点火 → 压力上升 → 弹出休息邀请 → 自动接受 → 切夜间 → 桌宠 → 结束 */
  var DEMO_LINE = [
    [0,  68, 62, .20],
    [6,  70, 60, .20],
    [12, 86, 32, .30],
    [24, 87, 30, .30],
    [28, 71, 56, .20],
    [36, 68, 60, .20]
  ];
  var demoTimers = [];

  function demoSample() {
    var t = (performance.now() - (state.demoStart || performance.now())) / 1000;
    for (var i = 0; i < DEMO_LINE.length - 1; i++) {
      var A = DEMO_LINE[i], B = DEMO_LINE[i + 1];
      if (t >= A[0] && t <= B[0]) {
        var k = (t - A[0]) / Math.max(1, B[0] - A[0]);
        return {
          hr: A[1] + (B[1] - A[1]) * k,
          hrv: A[2] + (B[2] - A[2]) * k,
          activity: A[3] + (B[3] - A[3]) * k,
          spo2: 97
        };
      }
    }
    var L = DEMO_LINE[DEMO_LINE.length - 1];
    return { hr: L[1], hrv: L[2], activity: L[3], spo2: 97 };
  }

  function stopDemo() {
    state.demoMode = false;
    for (var i = 0; i < demoTimers.length; i++) window.clearTimeout(demoTimers[i]);
    demoTimers = [];
    showToast('演示模式已停止');
  }

  function startDemo() {
    if (state.demoMode) { stopDemo(); return; }
    state.demoMode = true;
    state.demoStart = performance.now();
    if (state.view !== 'today') setView('today');
    if (state.suggestOpen) hideSuggest();
    if (!state.lit) { try { ignite(); } catch (e) {} }
    showToast('演示模式 · 按 D 停止');

    var acts = [
      [15000, function () {
        state.suggestTick = 99;
        state.auto = 'semi';
        try { maybeSuggest(); } catch (e) {}
      }],
      [21000, function () { try { acceptSuggest(); } catch (e) {} }],
      [33000, function () { setView('today'); }],
      [38000, function () { try { toggleTheme(); } catch (e) {} }],
      [45000, function () { try { togglePet(); } catch (e) {} }],
      [54000, function () { state.demoMode = false; showToast('演示结束'); }]
    ];
    for (var j = 0; j < acts.length; j++) {
      (function (act) {
        demoTimers.push(window.setTimeout(function () { if (state.demoMode) act[1](); }, act[0]));
      })(acts[j]);
    }
  }

  function tickData(dt) {
    state.dataAcc += dt;
    if (state.dataAcc < 0.5) return;
    state.dataAcc = 0;

    var raw = state.demoMode ? demoSample() : Simulator.sampleAt(state.clock);
    state.hr = raw.hr;
    state.hrv = raw.hrv;
    state.activity = raw.activity;
    state.spo2 = raw.spo2;
    state.spo2Hist.push(raw.spo2);
    if (state.spo2Hist.length > 8) state.spo2Hist.shift();

    var score = Algorithm.stressScore(raw, BASELINE);
    state.stress += (score - state.stress) * .4;
    state.stress = clamp(state.stress, 0, 1);
    state.status = Algorithm.evaluate({ hr: state.hr, hrv: state.hrv, activity: state.activity }, BASELINE);

    // 中间层：西医数据 → 中医状态标签（连续 6 次采样一致才切换，避免标签抖动）
    if (window.TCM) {
      var tcmNext = TCM.classify(
        { hr: state.hr, hrv: state.hrv, activity: state.activity },
        BASELINE,
        { hour: new Date().getHours(), stress: state.stress }
      );
      if (tcmNext.key === state.tcm.key) {
        state.tcmSame += 1;
      } else {
        state.tcmSame += 1;
        if (state.tcmSame >= 6) {
          state.tcm = tcmNext;
          state.tcmSame = 0;
          logEvent('状态标签 · ' + tcmNext.name);
        }
      }
      if (state.tcm.key === 'heping' && tcmNext.key === 'heping') state.tcmSame = 0;
    }

    // 反证优先（文档 §4.2 规则三 / 场景 3.6）：血氧异常优先于一切中医判定
    if (window.TCM && TCM.safetyCheck) {
      var safe = TCM.safetyCheck(state.spo2Hist);
      if (safe) {
        if (!state.safetyOpen) showSafety(safe.text);
      } else if (state.safetyOpen && Date.now() > state.safetyUntil) {
        hideSafety();
      }
    }

    if (el.hr) el.hr.textContent = String(Math.round(state.hr));
    if (el.hrv) el.hrv.textContent = String(Math.round(state.hrv));
    if (el.dataTime) {
      var d = new Date();
      el.dataTime.textContent = '更新于 ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }

    state.histAcc += 0.5;
    if (state.histAcc >= 2) {
      state.histAcc = 0;
      state.history.push(state.hr);
      if (state.history.length > 150) state.history.shift();
      drawMiniTrend();
      if (state.view === 'records') drawTrendBig();
    }

    updateToday();
    updateDevicePanel();
    if (window.Pet) {
      Pet.setData({ hr: Math.round(state.hr), hrv: Math.round(state.hrv), stress: state.stress });
    }
    maybeSuggest();
  }

  function statusText() {
    if (state.igniting) return { line: '此刻 · 香将起', desc: '第一缕烟正在升起。' };
    if (state.paused) return { line: '此刻 · 香歇', desc: '已暂停，长按香炉重新点起，或到调节页继续。' };
    if (!state.lit) return { line: '此刻 · 香冷', desc: '长按香炉，点燃今晚第一炷香。' };
    if (state.status === Algorithm.STATE.ACTIVE) return { line: '此刻 · 行止', desc: '你在走动，香先安安静静地烧着。' };
    if (state.status === Algorithm.STATE.RELAX_NEEDED) return { line: '此刻 · 息促', desc: '心跳的快了一点。要不要添一炷香，坐一会儿？' };
    return { line: '此刻 · 息平', desc: '脉和人静，可以再坐一会儿。' };
  }

  function updateToday() {
    var t = statusText();
    if (el.stateLine) el.stateLine.textContent = t.line;
    if (el.stateDesc) el.stateDesc.textContent = t.desc;

    var mins = state.lightsMinutes + Math.round(state.runElapsed / 60);
    if (el.dailySummary) {
      el.dailySummary.textContent = '今日 · 已陪你 ' + mins + ' 分钟 · 点香 ' + state.lights + ' 次';
    }

    // 右侧徽记只露一个数、一个词
    if (el.hrPill) el.hrPill.textContent = String(Math.round(state.hr));
    if (state.safetyOpen) {
      // 反证优先：风险信号期间不输出中医状态，只提示就医
      if (el.tcmTag) {
        el.tcmTag.textContent = '暂不判断';
        el.tcmTag.classList.remove('is-calm');
        el.tcmTag.classList.add('is-alert');
      }
      if (el.tcmConf) el.tcmConf.textContent = '安全网';
      if (el.tcmNote) el.tcmNote.textContent = '建议就医评估';
      if (el.tcmWhy) el.tcmWhy.textContent = '血氧异常期间不做中医状态判断';
      if (el.tcmBasis) el.tcmBasis.textContent = '判定依据：血氧 ' + Math.round(state.spo2) + '% · 建议咨询医生';
      if (el.scentRoles) el.scentRoles.textContent = '暂不供香';
    } else if (el.tcmTag) {
      el.tcmTag.textContent = state.tcm.name;
      el.tcmTag.classList.toggle('is-alert', state.tcm.key !== 'heping' && state.tcm.key !== 'xingzhi');
      el.tcmTag.classList.toggle('is-calm', state.tcm.key === 'heping');
    }
    if (!state.safetyOpen && el.tcmNote) el.tcmNote.textContent = state.tcm.note;
    if (!state.safetyOpen && el.tcmConf) el.tcmConf.textContent = state.tcm.confidenceText || '';
    if (!state.safetyOpen && el.tcmWhy) {
      el.tcmWhy.textContent = '中医状态倾向：' + state.tcm.name +
        (state.tcm.confidenceText ? '（' + state.tcm.confidenceText + '）' : '') +
        ' · ' + state.tcm.note;
    }
    if (!state.safetyOpen && el.tcmBasis) {
      var basis = (state.tcm.evidence && state.tcm.evidence.length)
        ? state.tcm.evidence.join(' · ')
        : (state.tcm.why || '数据不足，暂不判断');
      el.tcmBasis.textContent = '判定依据：' + basis +
        ' · 血氧 ' + Math.round(state.spo2) + '%';
    }
    if (!state.safetyOpen && el.scentRoles && window.TCM) {
      el.scentRoles.textContent = TCM.rolesText(state.tcm) || '暂不供香';
    }
    if (el.bodyLine) {
      el.bodyLine.textContent = '心率 ' + Math.round(state.hr) +
        ' · HRV ' + Math.round(state.hrv) +
        ' · 压力 ' + Math.round(state.stress * 100) + '%';
      el.bodyLine.classList.toggle('is-alert', state.stress > .6);
    }
    if (el.scentPill) {
      var best = null, bestR = -1;
      for (var kk in state.mix) {
        if (!state.mix.hasOwnProperty(kk)) continue;
        if (state.mix[kk] > bestR) { bestR = state.mix[kk]; best = kk; }
      }
      el.scentPill.textContent = best && SCENT_DEF[best] ? SCENT_DEF[best].name : '未配香';
    }
    if (window.Pet) {
      Pet.setLine(state.lit ? (state.status === Algorithm.STATE.RELAX_NEEDED ? '陪你也歇一下' : '陪你专注中') : '等你点香');
      Pet.setData({ hr: Math.round(state.hr), hrv: Math.round(state.hrv), stress: state.stress });
    }

    // 桌宠悬浮窗（视频 PiP）里的画面状态
    if (state.pipMode && window.PetPip) {
      PetPip.set({
        lit: state.lit, theme: state.theme, stress: state.stress,
        line: petLine(), remain: petRemain()
      });
    }
  }

  /* ---------- 安全网：血氧异常 → 就医提示，暂停调理话术 ---------- */
  function showSafety(text) {
    if (!el.safetyBar) return;
    state.safetyOpen = true;
    state.safetyUntil = Date.now() + 9000;
    el.safetyText.textContent = text;
    el.safetyBar.classList.add('is-on');
    el.safetyBar.setAttribute('aria-hidden', 'false');
    hideSuggest();
    logEvent('安全网提示 · 血氧下降');
    if (el.tcmTag) {
      el.tcmTag.textContent = '暂不判断';
      el.tcmTag.classList.remove('is-calm');
      el.tcmTag.classList.add('is-alert');
    }
    if (el.tcmConf) el.tcmConf.textContent = '安全网';
  }

  function hideSafety() {
    if (!el.safetyBar || !state.safetyOpen) return;
    state.safetyOpen = false;
    el.safetyBar.classList.remove('is-on');
    el.safetyBar.setAttribute('aria-hidden', 'true');
  }

  function updateDevicePanel() {
    var connected = true;
    var batt = 82;
    var stock = Math.max(12, 92 - state.lightsMinutes);

    if (el.watchDot) el.watchDot.classList.toggle('off', !connected);
    if (el.watchState) el.watchState.textContent = connected ? '已连接' : '未连接';
    if (el.watchSensing) el.watchSensing.textContent = state.running ? '正在采集' : '静息采集';
    if (el.watchPill) el.watchPill.textContent = batt + '%';

    if (el.diffDot) el.diffDot.classList.toggle('off', !state.running);
    if (el.diffState) el.diffState.textContent = state.running ? '运行中' : (state.igniting ? '点香中' : state.paused ? '已暂停' : '待机');
    if (el.diffStock) el.diffStock.textContent = stock + '%';
    if (el.diffPill) el.diffPill.textContent = stock + '%';
    if (!state.running && el.diffRemain) el.diffRemain.textContent = '—';

    if (window.Pet) Pet.setConn({ watch: connected, diffuser: state.running });
  }

  /* ---------- 趋势 ---------- */
  function drawMiniTrend() {
    var svg = el.miniTrend;
    if (!svg) return;
    var W = 240, H = 54;
    var h = state.history;
    if (h.length < 2) { svg.innerHTML = ''; return; }
    var min = Infinity, max = -Infinity;
    for (var i = 0; i < h.length; i++) { if (h[i] < min) min = h[i]; if (h[i] > max) max = h[i]; }
    if (max - min < 8) { var mid = (max + min) / 2; min = mid - 4; max = mid + 4; }
    var n = h.length, d = '';
    for (var j = 0; j < n; j++) {
      var x = (j / (n - 1)) * W;
      var y = H - 6 - ((h[j] - min) / (max - min)) * (H - 12);
      d += (j ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    svg.innerHTML = '<path d="' + d + '" fill="none" stroke="var(--gold)" stroke-width="1.1" ' +
                    'stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>';
  }

  function drawTrendBig() {
    var svg = el.trendBig;
    if (!svg) return;
    var W = 620, H = 180;
    var src = state.history.slice(-120);
    if (src.length < 2) {
      for (var k = 0; k < 60; k++) src.push(70 + Math.sin(k / 6) * 5 + Math.cos(k / 2.3) * 2);
    }
    var min = Infinity, max = -Infinity;
    for (var i = 0; i < src.length; i++) { if (src[i] < min) min = src[i]; if (src[i] > max) max = src[i]; }
    if (max - min < 10) { var mid = (max + min) / 2; min = mid - 5; max = mid + 5; }
    var n = src.length, d = '', area = '';
    for (var j = 0; j < n; j++) {
      var x = (j / (n - 1)) * W;
      var y = H - 16 - ((src[j] - min) / (max - min)) * (H - 40);
      d += (j ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    area = d + 'L' + W + ' ' + (H - 16) + 'L0 ' + (H - 16) + 'Z';
    svg.innerHTML =
      '<defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="var(--gold)" stop-opacity=".22"/>' +
      '<stop offset="100%" stop-color="var(--gold)" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      '<line x1="0" y1="' + (H - 16) + '" x2="' + W + '" y2="' + (H - 16) + '" stroke="var(--line)" stroke-width="1"/>' +
      '<path d="' + area + '" fill="url(#tg)"/>' +
      '<path d="' + d + '" fill="none" stroke="var(--gold)" stroke-width="1.3" stroke-linejoin="round" opacity=".9"/>';
  }

  /* ---------- 建议（自动调节） ---------- */
  function maybeSuggest() {
    if (state.auto === 'full') return;
    state.suggestTick += 0.5;
    if (state.suggestTick < 18) return;
    state.suggestTick = 0;
    if (state.suggestOpen) return;
    if (!state.lit) return;
    if (state.status !== Algorithm.STATE.RELAX_NEEDED && state.stress < .45) return;

    // 目标配方优先取「中医状态标签」对应的香方
    var target = (state.tcm && state.tcm.mix)
      ? state.tcm.mix
      : (state.stress > .6 ? { chenxiang: .34, zhuqing: .50, longnao: .16 }
                           : { chenxiang: .32, zhuqing: .52, longnao: .16 });
    var deltas = [];
    for (var k in target) {
      if (!target.hasOwnProperty(k)) continue;
      var diff = Math.round((target[k] - state.mix[k]) * 100);
      if (Math.abs(diff) >= 2) {
        deltas.push(SCENT_DEF[k].name + ' ' + (diff > 0 ? '+' : '') + diff + '%');
      }
    }
    if (!deltas.length) return;
    if (state.status === Algorithm.STATE.RELAX_NEEDED || state.stress > .62) {
      state.suggestMode = 'rest';
      el.suggestText.textContent = '看你这会儿有点紧 · 要不要歇一炷？';
      if (el.btnAccept) el.btnAccept.textContent = '歇一炷';
      if (el.btnKeep) el.btnKeep.textContent = '先不用';
    } else {
      state.suggestMode = 'scent';
      el.suggestText.textContent = '系统建议：' + deltas.join('、');
      if (el.btnAccept) el.btnAccept.textContent = '接受调整';
      if (el.btnKeep) el.btnKeep.textContent = '保持当前';
    }
    el.suggestBar.classList.add('is-on');
    el.suggestBar.setAttribute('aria-hidden', 'false');
    state.suggestOpen = true;
    state.suggestData = target;
    if (window.ScentViz && ScentViz.pulse) { try { ScentViz.pulse(); } catch (e) {} }
    if (state.auto === 'auto') {
      logEvent('自动调整（已提示）');
      petBubble('香方已微调 · 告诉你一声');
    }
  }

  function hideSuggest() {
    state.suggestOpen = false;
    el.suggestBar.classList.remove('is-on');
    el.suggestBar.setAttribute('aria-hidden', 'true');
  }

  function openRunSheetForRest() {
    setView('adjust');
    state.durationMin = 15;
    window.setTimeout(function () { startRun(); }, 420);
  }

  function acceptSuggest() {
    if (state.suggestMode === 'rest') {
      hideSuggest();
      setScene('relax');
      openRunSheetForRest();
      logEvent('接受休息邀请');
      showToast('好 · 陪你这十五分钟');
      petBubble('歇一会儿 · 我陪着你');
      return;
    }
    if (state.suggestData) {
      state.targetMix = state.suggestData;
      logEvent('接受香方调整');
      showToast('已接受调整');
      petBubble('香方已调整 · 深呼吸');
    }
    hideSuggest();
  }

  function keepCurrent() {
    if (state.suggestMode === 'rest') {
      logEvent('暂不休息');
      showToast('好 · 那就再撑一会儿');
      hideSuggest();
      state.suggestTick = 0;
      return;
    }
    state.targetMix = state.mix;
    logEvent('保持当前香方');
    showToast('保持当前');
    hideSuggest();
  }

  /* ---------- 记录 ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function renderCalendar() {
    var box = el.calendar;
    if (!box) return;
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth();
    var first = new Date(y, m, 1);
    var startDow = (first.getDay() + 6) % 7; // 周一为 0
    var days = new Date(y, m + 1, 0).getDate();
    var today = now.getDate();
    var dows = ['一', '二', '三', '四', '五', '六', '日'];
    var html = '';
    for (var i = 0; i < 7; i++) html += '<span class="cal-dow">' + dows[i] + '</span>';
    for (var s = 0; s < startDow; s++) html += '<span></span>';
    for (var d = 1; d <= days; d++) {
      var has = (d !== today) && ((d * 7 + m * 3) % 4 !== 0);
      var cls = 'cal-day' + (has ? ' has' : '') + (d === today ? ' today' : '');
      html += '<span class="' + cls + '">' + d + '</span>';
    }
    box.innerHTML = html;
  }

  function logEvent(text) {
    var d = new Date();
    state.log.unshift({ t: pad2(d.getHours()) + ':' + pad2(d.getMinutes()), text: text });
    if (state.log.length > 40) state.log.pop();
    if (state.view === 'records') renderLog();
  }

  function renderLog() {
    var box = el.eventLog;
    if (!box) return;
    if (!state.log.length) { box.innerHTML = '<li>今夜尚无香事</li>'; return; }
    var html = '';
    for (var i = 0; i < state.log.length; i++) {
      html += '<li><time>' + state.log[i].t + '</time><span>' + esc(state.log[i].text) + '</span></li>';
    }
    box.innerHTML = html;
  }

  /* ---------- 杂项 UI ---------- */
  function showToast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add('is-on');
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () {
      el.toast.classList.remove('is-on');
    }, 2400);
  }

  var coachStep = 0;

  function renderCoachStep() {
    var n = el.cpages.length;
    for (var i = 0; i < el.csteps.length; i++) {
      var on = i === coachStep;
      el.csteps[i].classList.toggle('is-on', on);
      el.csteps[i].classList.toggle('is-done', i < coachStep);
      el.csteps[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (var j = 0; j < n; j++) el.cpages[j].classList.toggle('is-on', j === coachStep);
    if (el.coachCount) el.coachCount.textContent = (coachStep + 1) + ' / ' + n;
    if (el.coachPrev) el.coachPrev.disabled = (coachStep === 0);
    if (el.coachNext) el.coachNext.textContent = (coachStep === n - 1) ? '开 始' : '下一步';
  }

  function showCoach() {
    if (!el.coach) return;
    closeRef();
    coachStep = 0;
    renderCoachStep();
    el.coach.classList.add('is-on');
    el.coach.setAttribute('aria-hidden', 'false');
    state.coachSeen = true;
    try { localStorage.setItem(LS_COACH, '1'); } catch (e) {}
  }
  function hideCoach() {
    if (!el.coach) return;
    el.coach.classList.remove('is-on');
    el.coach.setAttribute('aria-hidden', 'true');
  }
  function coachNext() {
    if (coachStep < el.cpages.length - 1) { coachStep++; renderCoachStep(); }
    else hideCoach();
  }
  function coachPrev() {
    if (coachStep > 0) { coachStep--; renderCoachStep(); }
  }

  function openRef() { hideCoach(); if (window.selectRefPage) window.selectRefPage('culture'); el.refSheet.classList.add('is-on'); el.refSheet.setAttribute('aria-hidden', 'false'); el.btnRef.setAttribute('aria-expanded', 'true'); }
  function closeRef() { el.refSheet.classList.remove('is-on'); el.refSheet.setAttribute('aria-hidden', 'true'); el.btnRef.setAttribute('aria-expanded', 'false'); if (window.selectRefPage) window.selectRefPage('culture'); }

  function toggleSound() {
    state.sound = !state.sound;
    el.btnSound.classList.toggle('is-on', state.sound);
    el.btnSound.setAttribute('aria-pressed', state.sound ? 'true' : 'false');
    if (window.AudioFX) {
      try {
        AudioFX.setEnabled(state.sound);
        if (state.sound && state.lit) AudioFX.breathe(true);
        else AudioFX.breathe(false);
      } catch (e) {}
    }
    for (var i = 0; i < el.soundSeg.length; i++) {
      el.soundSeg[i].classList.toggle('is-on', el.soundSeg[i].getAttribute('data-snd') === (state.sound ? 'on' : 'off'));
    }
    showToast(state.sound ? '声 · 开' : '声 · 关');
  }

  /* ---------- 第二层：点图标展开的详情 ---------- */
  function openSheet(kind) {
    if (!el.sheet) return;

    // 从哪边点的，就从哪边出
    var side = 'right';
    for (var b = 0; b < el.railBtns.length; b++) {
      var btn = el.railBtns[b];
      if (btn.getAttribute('data-panel') !== kind) continue;
      var r = btn.getBoundingClientRect();
      side = (r.left + r.width / 2) < (window.innerWidth / 2) ? 'left' : 'right';
      break;
    }
    el.sheet.setAttribute('data-side', side);

    for (var i = 0; i < el.sheetPanels.length; i++) {
      var on = el.sheetPanels[i].getAttribute('data-panel') === kind;
      el.sheetPanels[i].classList.toggle('is-on', on);
    }
    el.sheet.classList.add('is-on');
    el.sheet.setAttribute('aria-hidden', 'false');
    if (kind === 'body') drawMiniTrend();
    if (kind === 'scent') { renderScentName(); renderScentChips(); }
  }

  function closeSheet() {
    if (!el.sheet) return;
    el.sheet.classList.remove('is-on');
    el.sheet.setAttribute('aria-hidden', 'true');
  }

  function renderScentChips() {
    if (!el.scentChips) return;
    var list = mixList(), h = '';
    for (var i = 0; i < list.length; i++) {
      h += '<span><i style="background:' + list[i].color + '"></i>' + esc(list[i].name) +
           '<em>' + Math.round(list[i].ratio * 100) + '%</em></span>';
    }
    el.scentChips.innerHTML = h;
  }
  /* ---------- 桌宠：页内常驻（fixed + 可拖动，不随滚动跑掉） ----------
     说明：浏览器里拿不到「无标题栏 + 置顶」的窗口。
     Document PiP 的标题栏会显示 file:// 路径，看起来像打开了一个文件，已弃用。
     真正的桌面宠物需要 Electron / Tauri 打包，web 端只能做到「固定 + 可拖」。 */
  function petOn(on) {
    state.petOn = !!on;
    el.btnPet.classList.toggle('is-on', !!on);
    el.btnPet.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function petBubble(text) {
    if (window.Pet && Pet.bubble) Pet.bubble(text, 3000);
  }

  function petLine() {
    if (!state.lit) return '等你点香';
    return state.status === Algorithm.STATE.RELAX_NEEDED ? '陪你也歇一下' : '陪你专注中';
  }

  function petRemain() {
    if (!state.running) return '';
    var left = Math.max(0, state.durationMin * 60 - state.runElapsed);
    return '还剩 ' + Math.ceil(left / 60) + ' 分';
  }

  function inlinePetShow() {
    if (!window.Pet) { showToast('桌宠模块未加载'); return; }
    Pet.show();
    petOn(true);
    if (Pet.bubble) Pet.bubble('我在这儿 · 点我看看', 2600);
  }

  function togglePet() {
    // 1) 优先：视频 PiP（无标题栏、置顶，但里面点不了）
    if (window.PetPip && PetPip.supported()) {
      if (PetPip.isActive()) {
        PetPip.stop();
        petOn(false);
        state.pipMode = false;
        if (window.Pet) Pet.show();
        showToast('桌宠已收起');
        return;
      }
      PetPip.set({
        lit: state.lit, theme: state.theme, stress: state.stress,
        line: petLine(), remain: petRemain()
      });
      PetPip.start().then(function () {
        state.pipMode = true;
        petOn(true);
        if (window.Pet) Pet.hide();
        showToast('桌宠已浮起 · 会一直置顶');
      }).catch(function () {
        state.pipMode = false;
        petOn(false);
        showToast('这个环境不让浮起 · 改用页内桌宠');
        inlinePetShow();
      });
      return;
    }
    // 2) 兜底：页内
    if (!window.Pet) { showToast('桌宠模块未加载'); return; }
    var visible = window.Pet.isVisible ? window.Pet.isVisible() : false;
    if (!visible) {
      inlinePetShow();
      showToast('桌宠已唤出 · 可拖到任意角落 · 点小炉展开');
    } else {
      Pet.hide();
      petOn(false);
      showToast('桌宠已收起');
    }
  }


  /* ---------- 主循环 ---------- */
  function frame(now) {
    if (!state.lastFrame) state.lastFrame = now;
    var dt = (now - state.lastFrame) / 1000;
    state.lastFrame = now;
    if (dt < 0) dt = 0;
    if (dt > .1) dt = .1;
    state.clock += dt;

    tickPress(dt);
    tickIgnition();
    tickBreath(dt);
    tickData(dt);
    tickRun(dt);
    tickSmoke(dt);

    // 配比缓慢过渡
    var changed = false;
    for (var k in state.targetMix) {
      if (!state.targetMix.hasOwnProperty(k)) continue;
      var cur = state.mix[k] || 0;
      var tv = state.targetMix[k];
      if (Math.abs(cur - tv) > .001) {
        state.mix[k] = cur + (tv - cur) * Math.min(1, dt * .9);
        changed = true;
      }
    }
    if (changed) {
      var sum = 0, kk;
      for (kk in state.mix) if (state.mix.hasOwnProperty(kk)) sum += state.mix[kk];
      if (sum > 0) { for (kk in state.mix) if (state.mix.hasOwnProperty(kk)) state.mix[kk] /= sum; }
      pushScent();
      renderScentName();
      renderLegend();
    }

    window.requestAnimationFrame(frame);
  }

  /* ---------- 事件 ---------- */
  function bindEvents() {
    // 进门页：点击或任意键进入
    if (el.gate) {
      el.gate.addEventListener('click', function (e) {
        e.preventDefault();
        enterApp();
      });
      el.gate.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          enterApp();
        }
      });
    }
    doc.addEventListener('keydown', function (e) {
      if (!state.entered) {
        e.preventDefault();
        e.stopPropagation();
        enterApp();
      }
    }, true);

    // 首次交互解锁音频
    doc.addEventListener('pointerdown', function once() {
      if (window.AudioFX) { try { AudioFX.unlock(); } catch (e) {} }
      doc.removeEventListener('pointerdown', once);
    }, { passive: true });

    // 长按点香
    el.censer.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      startPress();
    });
    el.censer.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.censer.addEventListener('pointerleave', cancelPress);

    // 指针推开香烟 + 香炉 3D 跟随
    window.addEventListener('pointermove', function (e) {
      if (window.Smoke) { try { Smoke.setPointer(e.clientX, e.clientY); } catch (err) {} }
    }, { passive: true });
    doc.addEventListener('pointerleave', function () {
      if (window.Smoke && Smoke.clearPointer) { try { Smoke.clearPointer(); } catch (err) {} }
    });

    // 香炉的轻微 3D 跟随（做出"器物"的立体感，触屏不生效）
    (function bindTilt() {
      var host = el.censer.parentNode;
      if (!host || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var raf = 0, tx = 0, ty = 0;
      function commit() {
        raf = 0;
        root.style.setProperty('--tx', tx.toFixed(2));
        root.style.setProperty('--ty', ty.toFixed(2));
      }
      host.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var r = el.censer.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / (r.width * .85);
        var dy = (e.clientY - (r.top + r.height / 2)) / (r.height * .85);
        tx = clamp(dx, -1, 1) * 5;
        ty = clamp(dy, -1, 1) * -4;
        if (!raf) raf = window.requestAnimationFrame(commit);
      }, { passive: true });
      host.addEventListener('pointerleave', function () {
        tx = 0; ty = 0;
        if (!raf) raf = window.requestAnimationFrame(commit);
      });
    })();
    window.addEventListener('pointerup', cancelPress);
    window.addEventListener('pointercancel', cancelPress);
    window.addEventListener('blur', cancelPress);

    el.censer.addEventListener('keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); e.stopPropagation(); startPress(); } });
    el.censer.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cancelPress(); } });

    // 导航
    for (var i = 0; i < el.tabs.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () { setView(btn.getAttribute('data-view')); });
      })(el.tabs[i]);
    }
    if (el.btnGotoAdjust) el.btnGotoAdjust.addEventListener('click', function () { closeSheet(); setView('adjust'); });
    if (el.btnDetail) el.btnDetail.addEventListener('click', function () { openSheet('body'); });

    // 图标 → 详情浮层
    for (var r = 0; r < el.railBtns.length; r++) {
      (function (btn) {
        btn.addEventListener('click', function () { openSheet(btn.getAttribute('data-panel')); });
      })(el.railBtns[r]);
    }
    if (el.sheetClose) el.sheetClose.addEventListener('click', closeSheet);
    if (el.safetyClose) el.safetyClose.addEventListener('click', hideSafety);
    if (el.sheet) {
      el.sheet.addEventListener('click', function (e) { if (e.target === el.sheet) closeSheet(); });
    }
    if (el.btnPause) el.btnPause.addEventListener('click', function () {
      toggleRun();
    });

    // 顶栏
    el.btnTheme.addEventListener('click', toggleTheme);
    el.btnPet.addEventListener('click', togglePet);
    el.btnSound.addEventListener('click', toggleSound);
    el.btnRef.addEventListener('click', openRef);
    el.refClose.addEventListener('click', closeRef);
    el.refSheet.addEventListener('click', function (e) { if (e.target === el.refSheet) closeRef(); });
    el.btnHelp.addEventListener('click', showCoach);
    doc.getElementById('helpClose').addEventListener('click', hideCoach);
    if (el.coachNext) el.coachNext.addEventListener('click', coachNext);
    if (el.coachPrev) el.coachPrev.addEventListener('click', coachPrev);
    for (var cs = 0; cs < el.csteps.length; cs++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          coachStep = parseInt(btn.getAttribute('data-step'), 10) || 0;
          renderCoachStep();
        });
      })(el.csteps[cs]);
    }
    el.coach.addEventListener('click', function (e) {
      if (e.target === el.coach || (e.target.classList && e.target.classList.contains('coach-dim'))) hideCoach();
    });

    // 调节
    for (var s = 0; s < el.scenes.length; s++) {
      (function (btn) {
        btn.addEventListener('click', function () { setScene(btn.getAttribute('data-scene')); });
      })(el.scenes[s]);
    }
    if (el.intensity) el.intensity.addEventListener('input', function () { setIntensity(el.intensity.value); });
    for (var d = 0; d < el.durations.length; d++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var m = btn.getAttribute('data-min') | 0;
          if (state.running || state.paused || state.igniting) { stopRun(false); }
          setDuration(m);
          logEvent('时长 · ' + m + ' 分钟');
        });
      })(el.durations[d]);
    }
    for (var g = 0; g < el.soundSeg.length; g++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var on = btn.getAttribute('data-snd') === 'on';
          if (on !== state.sound) toggleSound();
        });
      })(el.soundSeg[g]);
    }
    for (var a = 0; a < el.autoModes.length; a++) {
      (function (btn) {
        btn.addEventListener('click', function () { setAuto(btn.getAttribute('data-auto')); });
      })(el.autoModes[a]);
    }
    el.btnStart.addEventListener('click', toggleRun);
    el.btnStop.addEventListener('click', function () { stopRun(false); });
    el.btnAccept.addEventListener('click', acceptSuggest);
    el.btnKeep.addEventListener('click', keepCurrent);

    // 键盘
    doc.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', layoutSmoke, { passive: true });

    window.addEventListener('resize', function () {
      drawMiniTrend();
      layoutSmoke();
      if (state.view === 'records') drawTrendBig();
    });
  }

  function onKeyDown(e) {
    var tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) && e.target.type !== 'range') return;
    var k = (e.key || '').toLowerCase();

    if (k === 'escape') {
      if (el.sheet && el.sheet.classList.contains('is-on')) { closeSheet(); return; }
      if (el.coach.classList.contains('is-on')) { hideCoach(); return; }
      if (el.refSheet.classList.contains('is-on')) { closeRef(); return; }
      if (state.suggestOpen) { hideSuggest(); return; }
      cancelPress();
      return;
    }
    if (el.coach.classList.contains('is-on')) {
      if (k === 'enter' || e.key === ' ') { e.preventDefault(); hideCoach(); }
      return;
    }
    if (k === 'd') { startDemo(); return; }
    if (k === 'l') { toggleTheme(); return; }
    if (k === 'p') { togglePet(); return; }
    if (k === 'm') { toggleSound(); return; }
    if (k === 'k') { el.refSheet.classList.contains('is-on') ? closeRef() : openRef(); return; }
    if (k === 'h') { showCoach(); return; }
    if (k === '1') { setView('today'); return; }
    if (k === '2') { setView('adjust'); return; }
    if (k === '3') { setView('records'); return; }
    if (e.key === ' ' || k === 'enter') {
      if (state.view === 'adjust') { e.preventDefault(); toggleRun(); }
      return;
    }
  }

  /* ---------- 初始化 ---------- */
  function init() {
    // 主题
    var stored = null;
    try { stored = localStorage.getItem(LS_THEME); } catch (e) { stored = null; }
    if (stored === 'day' || stored === 'night') {
      applyTheme(stored, true);
    } else {
      var h = new Date().getHours();
      applyTheme((h >= 19 || h < 7) ? 'night' : 'day', true);
    }

    buildSpiral();

    // 香烟画布
    if (window.Smoke && el.smoke) {
      try { Smoke.init(el.smoke); } catch (e) { /* noop */ }
      layoutSmoke();
      window.setTimeout(layoutSmoke, 260);
    }

    // 预置一段历史，首屏趋势线就有内容（不是空白）
    for (var si = 0; si < 34; si++) {
      var samp = Simulator.sampleAt(si * 2);
      state.history.push(samp.hr);
    }

    setScene('focus');
    setIntensity(3);
    setDuration(20);
    setAuto('semi');

    // 香方模块：延迟到「调节」界面可见时再初始化（见 ensureViz）
    renderScentName();
    renderLegend();

    // 桌宠悬浮窗关闭回调（用户点了窗口上的 ×）
    if (window.PetPip) {
      PetPip.onExit = function () {
        state.pipMode = false;
        petOn(false);
        if (window.Pet) Pet.show();
        showToast('桌宠悬浮窗已关闭');
      };
    }

    // 桌宠模块
    if (window.Pet && window.Pet.init) {
      try {
        Pet.init({
          visible: false,
          onOpenWeb: function () { window.scrollTo({ top: 0, behavior: 'smooth' }); showToast('已回到网页'); },
          onClose: function () {
            // 只收起卡片，桌宠本体留在角落里（两者不联动）
            state.petOn = true;
            el.btnPet.classList.add('is-on');
            el.btnPet.setAttribute('aria-pressed', 'true');
          }
        });
        Pet.setLine('等你点香');
        Pet.setConn({ watch: true, diffuser: false });
        Pet.setRun({ running: false, remainText: '' });
        // 桌宠属于"桌面端"，默认不占网页版面，由右上角「桌宠」或 P 键唤出
        Pet.hide();
        state.petOn = false;
      } catch (e) { }
    }

    // 记录
    renderCalendar();
    renderLog();

    // 事件绑定（顶栏 / 导航 / 长按 / 快捷键 / 调节控件）
    bindEvents();

    // 首次引导
    var seenCoach = false;
    try { seenCoach = localStorage.getItem(LS_COACH) === '1'; } catch (e) { seenCoach = false; }
    state.coachSeen = seenCoach;
    // Help remains available from the top bar; do not cover the entrance.

    // 首帧
    syncRunUI();
    drawMiniTrend();
    logEvent('打开闻息');

    window.requestAnimationFrame(frame);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();

  /* 调试接口 */
  window.__wenxi = {
    state: state,
    setView: setView,
    theme: function (t) { applyTheme(t || (state.theme === 'night' ? 'day' : 'night')); },
    ignite: ignite,
    extinguish: extinguish,
    scene: setScene,
    run: function (on) { if (on === false) stopRun(false); else startRun(); },
    auto: setAuto,
    suggest: function (on) { if (on === false) hideSuggest(); else maybeSuggest(); },
    coach: function (on) { if (on === false) hideCoach(); else showCoach(); },
    pet: togglePet,
    enter: enterApp,
    demo: startDemo,
    stopDemo: stopDemo,
    tcm: function (hr, hrv, act, hour) { return TCM.classify({ hr: hr, hrv: hrv, activity: act }, BASELINE, { hour: hour, stress: state.stress }); },
    ref: function (on) { if (on === false) closeRef(); else openRef(); }
  };

})();
