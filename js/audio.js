/* ============================================================
   闻息 · audio.js
   全部声音由 WebAudio 现场合成，零音频素材、零网络请求。
   · 点香：白噪声 → 带通滤波的短促爆裂 + 低频 thump
   · 呼吸：55Hz / 110Hz 正弦，19 秒（4-7-8）一循环的极低音量起伏
   · 印章：低频 thump + 纸面摩擦噪声
   · 熄灭：低通扫频噪声 + 下行正弦
   默认静音；AudioContext 在首次用户交互后 resume（浏览器策略）。
   ============================================================ */

var AudioFX = (function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext || null;

  var ctx = null;
  var master = null;
  var noiseBuffer = null;
  var enabled = false;
  var breathNodes = null;

  function makeNoiseBuffer(seconds) {
    var len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function ensure() {
    if (!AC) return null;
    if (!ctx) {
      try {
        ctx = new AC();
      } catch (e) {
        return null;
      }
      master = ctx.createGain();
      master.gain.value = enabled ? 0.55 : 0.0;
      master.connect(ctx.destination);
      noiseBuffer = makeNoiseBuffer(1.6);
    }
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) { /* 等下一次手势 */ }
    }
    return ctx;
  }

  function noiseSource() {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuffer;
    return s;
  }

  // 首次用户交互时调用：只解锁上下文，不主动发声
  function unlock() {
    ensure();
  }

  function setEnabled(on) {
    enabled = !!on;
    var c = ensure();
    if (!c) return;
    var t = c.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(enabled ? 0.55 : 0.0001, t + 0.08);
  }

  function isEnabled() { return enabled; }

  function ignite() {
    if (!enabled || !ensure()) return;
    var t = ctx.currentTime;

    // 1) 白噪声爆裂（带通）
    var src = noiseSource();
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1900, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.2);
    bp.Q.value = 0.8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.20, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.26);

    // 2) 低频 thump
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(118, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.2);
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(og); og.connect(master);
    o.start(t); o.stop(t + 0.34);

    // 3) 火星噼啪（高通短噪）
    var crack = noiseSource();
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2800;
    var cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.exponentialRampToValueAtTime(0.055, t + 0.03);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    crack.connect(hp); hp.connect(cg); cg.connect(master);
    crack.start(t); crack.stop(t + 0.6);
  }

  function stamp() {
    if (!enabled || !ensure()) return;
    var t = ctx.currentTime;

    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(98, t);
    o.frequency.exponentialRampToValueAtTime(37, t + 0.17);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.24, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.28);

    var src = noiseSource();
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 820;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.055, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    src.connect(lp); lp.connect(ng); ng.connect(master);
    src.start(t); src.stop(t + 0.13);
  }

  function extinguish() {
    if (!enabled || !ensure()) return;
    var t = ctx.currentTime;

    var src = noiseSource();
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 0.55);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.62);

    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(64, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.10, t + 0.03);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(og); og.connect(master);
    o.start(t); o.stop(t + 0.58);
  }

  // 呼吸底噪：55Hz + 110Hz，9 秒一循环的缓慢起伏（与呼吸环同频）
  function breathe(on) {
    if (on) {
      if (!enabled || !ensure()) return;
      if (breathNodes) return;
      var t = ctx.currentTime;

      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);

      var o1 = ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = 55;

      var o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = 110;
      var o2g = ctx.createGain();
      o2g.gain.value = 0.32;

      var lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 1 / 9;
      var lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.012;

      o1.connect(g);
      o2.connect(o2g); o2g.connect(g);
      lfo.connect(lfoGain); lfoGain.connect(g.gain);
      g.connect(master);

      g.gain.exponentialRampToValueAtTime(0.020, t + 1.4);
      o1.start(t); o2.start(t); lfo.start(t);

      breathNodes = { gain: g, oscs: [o1, o2, lfo] };
    } else {
      if (!breathNodes || !ctx) return;
      var b = breathNodes;
      breathNodes = null;
      var tt = ctx.currentTime;
      b.gain.gain.cancelScheduledValues(tt);
      b.gain.gain.setValueAtTime(Math.max(0.0001, b.gain.gain.value), tt);
      b.gain.gain.exponentialRampToValueAtTime(0.0001, tt + 0.9);
      for (var i = 0; i < b.oscs.length; i++) {
        try { b.oscs[i].stop(tt + 1.0); } catch (e) { /* noop */ }
      }
    }
  }

  return {
    unlock: unlock,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    ignite: ignite,
    stamp: stamp,
    extinguish: extinguish,
    breathe: breathe,
  };
})();
