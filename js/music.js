/* ============================================================
   闻息 · music.js
   古琴 / 筝风格的背景音乐，全部在浏览器里实时合成：
     · Karplus-Strong 拨弦（接近真实拨奏的衰减与泛音）
     · 生成的混响脉冲响应（大厅感，不含任何采样素材）
     · 五声音阶 + 固定乐句，慢速、留白，用于长时间陪伴
   三首曲子绑定三个页面：
     今日 →《息》（羽调，低沉散音）
     调节 →《调》（宫调，筝式琶音）
     记录 →《录》（徵调，高音点染）
   零素材、零网络、无版权问题。
   ============================================================ */
(function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext || null;

  var ctx = null;
  var master = null;      // 总音量
  var dryGain = null;
  var wetGain = null;
  var conv = null;
  var droneGain = null;   // 持续低音（空弦余韵）
  var droneOscs = [];

  var enabled = false;
  var volume = 0.45;
  var current = 'xi';
  var timer = 0;
  var nextStep = 0;
  var stepIdx = 0;
  var phrasePos = 0;
  var notesPlayed = 0;   /* 便于自测统计发声次数 */

  /* 五声音阶频率表（十二平均律） */
  function freqOf(semi) {
    return 220 * Math.pow(2, semi / 12);
  }

  /* ---------------- 三首曲子 ---------------- */
  /* scale: 相对 220Hz(A3) 的半音；pattern: 每步一个音，null = 留白 */
  var TRACKS = {
    xi: {
      name: '息',
      page: '今日',
      mode: '羽调',
      desc: '低沉散音与空弦余韵，陪着你把呼吸放慢',
      base: -12,                       // 低一个八度
      scale: [0, 3, 5, 7, 10],         // A C D E G
      bpm: 44,
      stepsPerBeat: 2,
      bright: 0.996,                   // 越大越亮、衰减越慢
      amp: 0.22,
      density: 0.34,
      octaveUp: 0.18,
      drone: -12,
      pattern: [0, null, null, 2, null, 4, null, null, 2, null, 1, null, null, 3, null, null,
                null, 4, null, 1, null, null, 2, null, 0, null, null, null, 3, null, null, null]
    },
    tiao: {
      name: '调',
      page: '调节',
      mode: '宫调',
      desc: '筝式琶音缓缓上行，像有人替你理香',
      base: 0,
      scale: [0, 2, 4, 7, 9],          // A B C# E F#
      bpm: 56,
      stepsPerBeat: 2,
      bright: 0.994,
      amp: 0.19,
      density: 0.5,
      octaveUp: 0.26,
      drone: -12,
      pattern: [0, 2, 4, 2, 3, null, 2, 1, 0, 2, 3, null, 4, 3, 2, null,
                1, 3, 4, 3, 2, null, 1, 0, 2, null, 3, 2, 1, null, null, null]
    },
    lu: {
      name: '录',
      page: '记录',
      mode: '徵调',
      desc: '高音点染，留白多，适合回看这一段日子',
      base: 7,
      scale: [0, 2, 4, 5, 7],          // E F# G# A B
      bpm: 40,
      stepsPerBeat: 2,
      bright: 0.997,
      amp: 0.16,
      density: 0.26,
      octaveUp: 0.34,
      drone: -5,
      pattern: [null, null, 3, null, null, 4, null, null, 2, null, null, null, 3, null, 1, null,
                null, 2, null, null, 4, null, null, null, 3, null, null, 2, null, null, null, null]
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
    if (ctx || !AC) return ctx;
    try {
      ctx = new AC();
    } catch (e) {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);

    conv = ctx.createConvolver();
    conv.buffer = makeIR(3.4, 2.6);
    dryGain = ctx.createGain();
    dryGain.gain.value = 0.72;
    wetGain = ctx.createGain();
    wetGain.gain.value = 0.5;
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
    notesPlayed++;
    var rate = ctx.sampleRate;
    var period = Math.max(2, Math.round(rate / freq));
    var len = Math.max(period * 4, Math.floor(rate * dur));
    var buf = ctx.createBuffer(1, len, rate);
    var d = buf.getChannelData(0);

    /* 初始激励：短噪声 + 一点梳状，模拟指甲拨过弦 */
    for (var i = 0; i < period; i++) {
      d[i] = (Math.random() * 2 - 1) * (1 - i / period * 0.35);
    }
    /* 延迟线衰减滤波（Karplus-Strong） */
    for (var j = period; j < len; j++) {
      d[j] = (d[j - period] + (j - period + 1 < len ? d[j - period + 1] : 0)) * 0.5 * bright;
    }

    var src = ctx.createBufferSource();
    src.buffer = buf;

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(6800, 1400 + freq * 4.2);
    lp.Q.value = 0.4;

    var g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, amp), when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    src.connect(lp);
    lp.connect(g);
    g.connect(dryGain);
    g.connect(wetGain);
    src.start(when);
    src.stop(when + dur + 0.05);
  }

  /* ---------------- 低音持续（空弦余韵） ---------------- */
  function startDrone(track) {
    stopDrone();
    if (!ctx) return;
    var semis = track.drone;
    var f = freqOf(semis);
    var t = ctx.currentTime;
    var freqs = [f, f * 1.003, f * 2.001];
    droneOscs = freqs.map(function (fr, i) {
      var o = ctx.createOscillator();
      o.type = i === 2 ? 'sine' : 'triangle';
      o.frequency.value = fr;
      var g = ctx.createGain();
      g.gain.value = i === 2 ? 0.10 : 0.07;
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      o.connect(lp);
      lp.connect(g);
      g.connect(droneGain);
      o.start(t);
      return o;
    });
    droneGain.gain.cancelScheduledValues(t);
    droneGain.gain.setValueAtTime(droneGain.gain.value, t);
    droneGain.gain.linearRampToValueAtTime(0.075, t + 3.2);
  }

  function stopDrone() {
    if (!ctx) return;
    var t = ctx.currentTime;
    try {
      droneGain.gain.cancelScheduledValues(t);
      droneGain.gain.setValueAtTime(droneGain.gain.value, t);
      droneGain.gain.linearRampToValueAtTime(0.0001, t + 1.6);
    } catch (e) {}
    var olds = droneOscs.slice();
    droneOscs = [];
    setTimeout(function () {
      olds.forEach(function (o) {
        try { o.stop(); } catch (e) {}
      });
    }, 1800);
  }

  /* ---------------- 调度 ---------------- */
  function stepSeconds(track) {
    return 60 / track.bpm / track.stepsPerBeat;
  }

  function schedule() {
    if (!ctx || !enabled) return;
    var track = TRACKS[current];
    var dt = stepSeconds(track);
    var horizon = ctx.currentTime + 0.7;
    var guard = 0;

    while (nextStep < horizon && guard++ < 24) {
      var pat = track.pattern;
      var deg = pat[stepIdx % pat.length];
      if (deg !== null && deg !== undefined) {
        /* 稀疏化：按 density 跳过一些音，让留白更自然 */
        if (Math.random() < (0.55 + track.density * 0.9)) {
          var semi = track.base + track.scale[deg % track.scale.length];
          var f = freqOf(semi);
          var dur = Math.max(2.4, 6.2 - deg * 0.35);
          pluck(f, nextStep, dur, track.amp * (0.82 + Math.random() * 0.32), track.bright);
          /* 泛音点染（高八度，轻声） */
          if (Math.random() < track.octaveUp) {
            pluck(f * 2, nextStep + dt * 0.5, dur * 0.72, track.amp * 0.34, track.bright);
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
  function start() {
    if (!ensure()) return false;
    if (ctx.state === 'suspended') ctx.resume();
    if (enabled) return true;
    enabled = true;
    nextStep = ctx.currentTime + 0.25;
    stepIdx = 0;
    startDrone(TRACKS[current]);
    var t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
    master.gain.linearRampToValueAtTime(0.24 * (volume / 0.45), t + 2.4);
    clearInterval(timer);
    timer = setInterval(tick, 220);
    schedule();
    return true;
  }

  function stop(fadeSeconds) {
    if (!ctx || !enabled) {
      enabled = false;
      return;
    }
    enabled = false;
    clearInterval(timer);
    timer = 0;
    var t = ctx.currentTime;
    var fade = fadeSeconds == null ? 1.8 : fadeSeconds;
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

  /* 切换页面 → 换曲（带交叉淡出淡入） */
  function page(view) {
    var key = view === 'adjust' ? 'tiao' : (view === 'records' ? 'lu' : 'xi');
    if (key === current) return;
    current = key;
    if (!enabled || !ctx) return;
    var t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.linearRampToValueAtTime(0.0001, t + 0.9);
    } catch (e) {}
    stopDrone();
    setTimeout(function () {
      if (!enabled) return;
      nextStep = ctx.currentTime + 0.15;
      stepIdx = 0;
      startDrone(TRACKS[current]);
      var t2 = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(t2);
        master.gain.setValueAtTime(0.0001, t2);
        master.gain.linearRampToValueAtTime(0.24 * (volume / 0.45), t2 + 1.8);
      } catch (e) {}
      schedule();
    }, 950);
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (!ctx || !enabled) return;
    var t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.linearRampToValueAtTime(Math.max(0.0001, 0.24 * (volume / 0.45)), t + 0.3);
    } catch (e) {}
  }

  function list() {
    var out = [];
    for (var k in TRACKS) {
      if (!TRACKS.hasOwnProperty(k)) continue;
      out.push({
        key: k, name: TRACKS[k].name, page: TRACKS[k].page,
        mode: TRACKS[k].mode, desc: TRACKS[k].desc
      });
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
    supported: function () { return !!AC; }
  };
})();
