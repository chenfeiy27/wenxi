/* ============================================================
   闻息 · music.js（单曲文件版）
   全站一曲：assets/audio/theme.mp3，循环播放
     · 用 <audio> 播放，不依赖 WebAudio
     · 开关做淡入淡出，避免突然出声或硬切
     · 点燃音效独立：assets/audio/ignite.wav
   ============================================================ */
(function () {
  'use strict';

  var MUSIC_SRC = 'assets/audio/theme.mp3';
  var SFX_FILE = { ignite: 'assets/audio/ignite.wav' };

  var audio = null;
  var sfxPool = [];
  var lastSfx = null;
  var enabled = false;
  var volume = 0.45;
  var fadeTimer = null;

  function getAudio() {
    if (!audio) {
      audio = new Audio();
      audio.src = MUSIC_SRC;
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
      /* 双保险：loop 属性 + ended 事件兜底（部分浏览器在 seek 后不触发 loop） */
      audio.addEventListener('ended', function () {
        try { audio.currentTime = 0; } catch (e) {}
        if (enabled) playSafe(audio);
      });
    }
    return audio;
  }

  function targetVolume() {
    return Math.max(0, Math.min(1, 0.6 * (volume / 0.45)));
  }

  function fadeTo(to, ms, onDone) {
    var a = getAudio();
    if (fadeTimer) {
      clearInterval(fadeTimer);
      fadeTimer = null;
    }
    var from = a.volume;
    var steps = Math.max(1, Math.round(ms / 50));
    var i = 0;
    fadeTimer = setInterval(function () {
      i++;
      a.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps)));
      if (i >= steps) {
        clearInterval(fadeTimer);
        fadeTimer = null;
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

  function start() {
    enabled = true;
    var a = getAudio();
    a.loop = true;
    if (a.paused) playSafe(a);
    fadeTo(targetVolume(), 2000);
    return true;
  }

  function stop() {
    enabled = false;
    var a = getAudio();
    fadeTo(0, 900, function () {
      try { a.pause(); } catch (e) {}
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

  /* 全站一曲，切页不换歌；保留接口以兼容旧调用 */
  function page() {}

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (enabled && audio) audio.volume = targetVolume();
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

  function seek(t) {
    var a = getAudio();
    if (!a.duration || isNaN(a.duration)) return false;
    try { a.currentTime = Math.max(0, Math.min(a.duration - 0.15, t)); } catch (e) { return false; }
    return true;
  }

  function unlock() {
    getAudio();
  }

  window.Music = {
    start: start,
    stop: stop,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    page: page,
    setVolume: setVolume,
    unlock: unlock,
    seek: seek,
    playSfx: playSfx,
    current: function () { return 'theme'; },
    list: function () { return [{ key: 'theme', name: '背景音乐', mode: '' }]; },
    state: function () {
      var a = audio;
      if (!a) return 'none';
      if (a.paused) return 'paused';
      return a.readyState >= 2 ? 'playing' : 'loading';
    },
    level: function () { return audio ? audio.volume : -1; },
    stats: function () {
      var a = audio;
      return a ? { paused: a.paused, time: a.currentTime, ready: a.readyState, vol: a.volume, dur: a.duration } : null;
    },
    sfx: function () {
      var a = lastSfx;
      return a ? { src: String(a.src).split('/').pop(), paused: a.paused, t: a.currentTime, v: a.volume, ready: a.readyState } : null;
    },
    supported: function () { return !!window.Audio; }
  };
})();
