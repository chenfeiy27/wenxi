/* ============================================================
   闻息 · music.js（文件播放版）
   用本地音频文件 + <audio> 元素播放，不依赖 WebAudio：
     · 两首曲子：今日《息》 / 调节与记录《调》
     · 双元素交叉淡入淡出，切换页面不突兀
     · 同时提供点燃音效的一键播放（playSfx）
   文件位于 assets/audio/，离线可用、无版权素材。
   ============================================================ */
(function () {
  'use strict';

  var FILE = {
    xi: 'assets/audio/guqin_xi.wav',
    tiao: 'assets/audio/guqin_tiao.wav'
  };
  var SFX_FILE = {
    ignite: 'assets/audio/ignite.wav'
  };

  var els = {};          /* 音乐元素池 */
  var sfxPool = [];
  var enabled = false;
  var volume = 0.45;
  var current = 'xi';
  var fadeTimers = {};
  var lastSfx = null;

  function el(key) {
    if (!els[key]) {
      var a = new Audio();
      a.src = FILE[key];
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;
      els[key] = a;
    }
    return els[key];
  }

  function targetVolume() {
    return Math.max(0, Math.min(1, 0.55 * (volume / 0.45)));
  }

  function fade(key, to, ms, onDone) {
    var a = el(key);
    if (fadeTimers[key]) {
      clearInterval(fadeTimers[key]);
      fadeTimers[key] = null;
    }
    var from = a.volume;
    var steps = Math.max(1, Math.round(ms / 50));
    var i = 0;
    fadeTimers[key] = setInterval(function () {
      i++;
      var v = from + (to - from) * (i / steps);
      a.volume = Math.max(0, Math.min(1, v));
      if (i >= steps) {
        clearInterval(fadeTimers[key]);
        fadeTimers[key] = null;
        a.volume = to;
        if (onDone) onDone();
      }
    }, 50);
  }

  function playSafe(a) {
    try {
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function keyFor(view) {
    return view === 'today' ? 'xi' : 'tiao';
  }

  /* ---------------- 对外接口 ---------------- */
  function start() {
    enabled = true;
    var key = current;
    var a = el(key);
    if (a.paused) playSafe(a);
    fade(key, targetVolume(), 1800);
    Object.keys(els).forEach(function (k) {
      if (k === key) return;
      var other = els[k];
      if (!other.paused) fade(k, 0, 700, function () { try { other.pause(); } catch (e) {} });
    });
    return true;
  }

  function stop() {
    enabled = false;
    Object.keys(els).forEach(function (k) {
      var a = els[k];
      fade(k, 0, 900, function () { try { a.pause(); } catch (e) {} });
    });
  }

  function setEnabled(on) {
    if (on) start();
    else stop();
    return enabled;
  }

  function isEnabled() {
    return enabled;
  }

  function page(view) {
    var key = keyFor(view);
    if (key === current) return;
    current = key;
    if (!enabled) return;
    var next = el(key);
    var prevKey = null;
    Object.keys(els).forEach(function (k) {
      if (k !== key && !els[k].paused) prevKey = k;
    });
    if (next.paused) playSafe(next);
    fade(key, targetVolume(), 1500);
    if (prevKey) {
      var prev = el(prevKey);
      fade(prevKey, 0, 900, function () { try { prev.pause(); } catch (e) {} });
    }
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (!enabled) return;
    Object.keys(els).forEach(function (k) { el(k).volume = targetVolume(); });
  }

  function playSfx(name) {
    var src = SFX_FILE[name];
    if (!src) return false;
    var a = null;
    for (var i = 0; i < sfxPool.length; i++) {
      if (sfxPool[i].paused || sfxPool[i].ended) { a = sfxPool[i]; break; }
    }
    if (!a) {
      if (sfxPool.length >= 3) {
        a = sfxPool[0];
      } else {
        a = new Audio();
        a.preload = 'auto';
        sfxPool.push(a);
      }
    }
    a.src = src;
    a.volume = Math.min(1, 0.9 * (volume / 0.45) * 0.85);
    try { a.currentTime = 0; } catch (e) {}
    lastSfx = a;
    playSafe(a);
    return true;
  }

  function unlock() {
    el('xi');
    el('tiao');
  }

  window.Music = {
    start: start,
    stop: stop,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    page: page,
    setVolume: setVolume,
    unlock: unlock,
    playSfx: playSfx,
    current: function () { return current; },
    list: function () {
      return [
        { key: 'xi', name: '息', mode: '羽调' },
        { key: 'tiao', name: '调', mode: '宫调' }
      ];
    },
    state: function () {
      var a = els[current];
      if (!a) return 'none';
      if (a.paused) return 'paused';
      return a.readyState >= 2 ? 'playing' : 'loading';
    },
    level: function () {
      var a = els[current];
      return a ? a.volume : -1;
    },
    stats: function () {
      var a = els[current];
      return a ? { paused: a.paused, time: a.currentTime, ready: a.readyState, vol: a.volume, dur: a.duration } : null;
    },
    sfx: function () {
      var a = lastSfx;
      return a ? { src: String(a.src).split('/').pop(), paused: a.paused, t: a.currentTime, v: a.volume, ready: a.readyState } : null;
    },
    supported: function () { return !!window.Audio; }
  };
})();
