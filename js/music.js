/* ============================================================
   闻息 · music.js
   古琴 / 筝风格的背景音乐，全部在浏览器里实时合成：
     · Karplus-Strong 拨弦（接近真实拨奏的衰减与泛音）
     · 生成的混响脉冲响应（大厅感，不含任何采样素材）
     · 五声音阶 + 固定乐句，慢速、留白，用于长时间陪伴
   两首曲子：
     今日      →《息》羽调，低沉散音 + 空弦余韵
     调节 / 记录 →《调》宫调，筝式琶音缓缓上行
   零素材、零网络、无版权问题。
   ============================================================ */
(function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext || null;

  var ctx = null;
  var master = null;
  var dryGain = null;
  var wetGain = null;
  var conv = null;
  var droneGain = null;
  var droneOscs = [];
  var analyser = null;
  var levelBuf = null;

  var enabled = false;
  var volume = 0.45;
  var current = 'xi';
  var timer = 0;
  var nextStep = 0;
  var stepIdx = 0;
  var notesPlayed = 0;

  function freqOf(semi) {
    return 220 * Math.pow(2, semi / 12);
  }

  /* ---------------- 两首曲子 ---------------- */
  var TRACKS = {
    xi: {
      name: '息',
      mode: '羽调',
      desc: '低沉散音与空弦余韵',
      base: -12,
      scale: [0, 3, 5, 7, 10],
      bpm: 46,
      stepsPerBeat: 2,
      bright: 0.9965,
      amp: 0.5,
      gain: 0.9,
      density: 0.5,
      octaveUp: 0.2,
      drone: -12,
      pattern: [0, null, null, 2, null, 4, null, 2, null, null, 3, null, 1, null, null, null,
                4, null, 2, null, null, 1, null, null, 3, null, null, 2, null, null, null, null]
    },
    tiao: {
      name: '调',
      mode: '宫调',
      desc: '筝式琶音缓缓上行，安静但有点亮',
      base: 0,
      scale: [0, 2, 4, 7, 9],
      bpm: 58,
      stepsPerBeat: 2,
      bright: 0.994,
      amp: 0.42,
      gain: 0.85,
      density: 0.62,
      octaveUp: 0.28,
      drone: -12,
      pattern: [0, 2, 4, 2, 3, null, 2, 1, 0, 2, 3, null, 4, 3, 2, null,
                1, 3, 4, 3, 2, null, 1, 0, 2, null, 3, 2, 1, null, 4, null]
    }
  };

  /* ---------------- 混响 IR（程序生成） ---------------- */
  function makeIR(seconds, decay) {
    var rate = ctx.sampleRate;
    var len = Math.floor(rate * seconds);
    var buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        var t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  function ensure() {
    if (ctx) return ctx;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (e) {
      return null;
    }

    /* 顺序很重要：先建分析器与主输出，再接线 */
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    levelBuf = new Float32Array(analyser.fftSize);
    analyser.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(analyser);

    conv = ctx.createConvolver();
    conv.buffer = makeIR(3.4, 2.6);

    dryGain = ctx.createGain();
    dryGain.gain.value = 0.9;
    wetGain = ctx.createGain();
    wetGain.gain.value = 0.55;
    dryGain.connect(master);
    wetGain.connect(conv);
    conv.connect(master);

    droneGain = ctx.createGain();
    droneGain.gain.value = 0.0001;
    droneGain.connect(dryGain);
    droneGain.connect(wetGain);
    return ctx;
  }

  /* ---------------- 拨弦合成 ---------------- */
  function pluck(freq, when, dur, amp, bright) {
    if (!ctx) return;
    var rate = ctx.sampleRate;
    var period = Math.max(2, Math.round(rate / freq));
    var len = Math.max(period * 6, Math.floor(rate * dur));
    var buf = ctx.createBuffer(1, len, rate);
    var d = buf.getChannelData(0);

    for (var i = 0; i < period; i++) {
      d[i] = (Math.random() * 2 - 1) * (1 - (i / period) * 0.3);
    }
    for (var j = period; j < len; j++) {
      d[j] = (d[j - period] + (j - period + 1 < len ? d[j - period + 1] : 0)) * 0.5 * bright;
    }

    var src = ctx.createBufferSource();
    src.buffer = buf;

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(7200, 1600 + freq * 4.5);
    lp.Q.value = 0.5;

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.01, amp), when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    src.connect(lp);
    lp.connect(g);
    g.connect(dryGain);
    g.connect(wetGain);
    src.start(when);
    src.stop(when + dur + 0.05);
    notesPlayed++;
  }

  /* ---------------- 低音持续 ---------------- */
  function startDrone(track) {
    stopDrone();
    if (!ctx) return;
    var f = freqOf(track.drone);
    var t = ctx.currentTime;
    var freqs = [f, f * 1.003, f * 2.002];
    droneOscs = freqs.map(function (fr, i) {
      var o = ctx.createOscillator();
      o.type = i === 2 ? 'sine' : 'triangle';
      o.frequency.value = fr;
      var g = ctx.createGain();
      g.gain.value = i === 2 ? 0.12 : 0.1;
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 620;
      o.connect(lp);
      lp.connect(g);
      g.connect(droneGain);
      o.start(t);
      return o;
    });
    droneGain.gain.cancelScheduledValues(t);
    droneGain.gain.setValueAtTime(droneGain.gain.value, t);
    droneGain.gain.linearRampToValueAtTime(0.11, t + 2.6);
  }

  function stopDrone() {
    if (!ctx) return;
    var t = ctx.currentTime;
    try {
      droneGain.gain.cancelScheduledValues(t);
      droneGain.gain.setValueAtTime(droneGain.gain.value, t);
      droneGain.gain.linearRampToValueAtTime(0.0001, t + 1.4);
    } catch (e) {}
    var olds = droneOscs.slice();
    droneOscs = [];
    setTimeout(function () {
      olds.forEach(function (o) {
        try { o.stop(); } catch (e) {}
      });
    }, 1600);
  }

  /* ---------------- 调度 ---------------- */
  function stepSeconds(track) {
    return 60 / track.bpm / track.stepsPerBeat;
  }

  function schedule() {
    if (!ctx || !enabled) return;
    var track = TRACKS[current];
    if (!track) return;
    var dt = stepSeconds(track);
    var horizon = ctx.currentTime + 0.8;
    var guard = 0;

    while (nextStep < horizon && guard++ < 32) {
      var pat = track.pattern;
      var deg = pat[stepIdx % pat.length];
      if (deg !== null && deg !== undefined) {
        if (Math.random() < (0.6 + track.density * 0.8)) {
          var semi = track.base + track.scale[deg % track.scale.length];
          var f = freqOf(semi);
          var dur = Math.max(2.6, 6.4 - deg * 0.35);
          pluck(f, nextStep, dur, track.amp * track.gain * (0.85 + Math.random() * 0.3), track.bright);
          if (Math.random() < track.octaveUp) {
            pluck(f * 2, nextStep + dt * 0.5, dur * 0.7, track.amp * track.gain * 0.34, track.bright);
          }
        }
      }
      nextStep += dt;
      stepIdx++;
    }
  }

  function tick() {
    schedule();
  }

  /* ---------------- 对外接口 ---------------- */
  function masterTarget() {
    return Math.max(0.0001, 0.85 * (volume / 0.45));
  }

  function start() {
    if (!ensure()) return false;
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) {}
    }
    if (enabled) return true;
    enabled = true;
    nextStep = ctx.currentTime + 0.2;
    stepIdx = 0;
    startDrone(TRACKS[current]);
    var t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.linearRampToValueAtTime(masterTarget(), t + 2.0);
    } catch (e) {}
    clearInterval(timer);
    timer = setInterval(tick, 200);
    schedule();
    return true;
  }

  function stop(fadeSeconds) {
    if (!ctx) {
      enabled = false;
      return;
    }
    enabled = false;
    clearInterval(timer);
    timer = 0;
    var t = ctx.currentTime;
    var fade = fadeSeconds == null ? 1.6 : fadeSeconds;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.linearRampToValueAtTime(0.0001, t + fade);
    } catch (e) {}
    stopDrone();
  }

  function setEnabled(on) {
    if (on) start();
    else stop();
    return enabled;
  }

  function isEnabled() {
    return enabled;
  }

  /* 页面 → 曲子：今日《息》，调节与记录共用《调》 */
  function keyFor(view) {
    return view === 'today' ? 'xi' : 'tiao';
  }

  function page(view) {
    var key = keyFor(view);
    if (key === current) return;
    current = key;
    if (!enabled || !ctx) return;
    var t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.linearRampToValueAtTime(0.0001, t + 0.85);
    } catch (e) {}
    stopDrone();
    setTimeout(function () {
      if (!enabled || !ctx) return;
      nextStep = ctx.currentTime + 0.12;
      stepIdx = 0;
      startDrone(TRACKS[current]);
      var t2 = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(t2);
        master.gain.setValueAtTime(0.0001, t2);
        master.gain.linearRampToValueAtTime(masterTarget(), t2 + 1.6);
      } catch (e) {}
      schedule();
    }, 900);
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (!ctx || !enabled) return;
    var t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.linearRampToValueAtTime(masterTarget(), t + 0.3);
    } catch (e) {}
  }

  function list() {
    var out = [];
    for (var k in TRACKS) {
      if (!TRACKS.hasOwnProperty(k)) continue;
      out.push({ key: k, name: TRACKS[k].name, mode: TRACKS[k].mode, desc: TRACKS[k].desc });
    }
    return out;
  }

  function unlock() {
    if (!ctx) ensure();
    if (ctx && ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) {}
    }
  }

  window.Music = {
    start: start,
    stop: stop,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    page: page,
    setVolume: setVolume,
    list: list,
    unlock: unlock,
    current: function () { return current; },
    notes: function () { return notesPlayed; },
    state: function () { return ctx ? ctx.state : 'none'; },
    level: function () {
      if (!analyser) return -1;
      analyser.getFloatTimeDomainData(levelBuf);
      var sum = 0;
      for (var i = 0; i < levelBuf.length; i++) sum += levelBuf[i] * levelBuf[i];
      return Math.sqrt(sum / levelBuf.length);
    },
    supported: function () { return !!AC; }
  };
})();
