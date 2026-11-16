/* ============================================================
   闻息 · ref-game.js
   《香事》浮层里的「解压小游戏」：4-7-8 呼吸引导（三轮）
   依据《02 用户场景说明书》场景三：屏显圆环引导 4-7-8 呼吸，共 3 轮。
   定位：低风险、可逆、非药物的感官调节，不构成任何治疗建议。
   ============================================================ */
(function () {
  'use strict';

  var host = document.getElementById('refGame');
  if (!host) return;

  var IN = 4, HOLD = 7, OUT = 8, ROUNDS = 3;
  var CYCLE = IN + HOLD + OUT;
  var TOTAL = CYCLE * ROUNDS;
  var R = 96;
  var CIRC = 2 * Math.PI * R;

  host.innerHTML = [
    '<div class="bg-wrap">',
    '  <p class="bg-title">跟着香篆，慢下来</p>',
    '  <p class="bg-sub">吸 4 · 停 7 · 呼 8 ｜ 共三轮</p>',
    '  <div class="bg-stage" id="bgStage">',
    '    <svg class="bg-ring" viewBox="0 0 240 240" aria-hidden="true">',
    '      <circle class="bg-track" cx="120" cy="120" r="' + R + '"/>',
    '      <circle class="bg-prog" id="bgProg" cx="120" cy="120" r="' + R + '"',
    '        stroke-dasharray="' + CIRC.toFixed(1) + '" stroke-dashoffset="' + CIRC.toFixed(1) + '"/>',
    '    </svg>',
    '    <div class="bg-core" id="bgCore">',
    '      <span class="bg-phase" id="bgPhase">准备</span>',
    '      <span class="bg-count" id="bgCount">—</span>',
    '    </div>',
    '  </div>',
    '  <p class="bg-round" id="bgRound">第 1 / ' + ROUNDS + ' 轮</p>',
    '  <div class="bg-actions">',
    '    <button class="mini-btn strong" id="bgStart" type="button">开始</button>',
    '    <button class="mini-btn" id="bgReset" type="button">重来</button>',
    '  </div>',
    '  <p class="bg-note">随时可以停；合上浮层或切换页面会自动暂停。本练习仅作放松引导，不构成医疗建议。</p>',
    '</div>'
  ].join('');

  var stage = host.querySelector('#bgStage');
  var prog = host.querySelector('#bgProg');
  var core = host.querySelector('#bgCore');
  var phaseEl = host.querySelector('#bgPhase');
  var countEl = host.querySelector('#bgCount');
  var roundEl = host.querySelector('#bgRound');
  var startBtn = host.querySelector('#bgStart');
  var resetBtn = host.querySelector('#bgReset');

  var running = false;
  var t0 = 0;
  var base = 0;          // 已累计秒数（暂停时保留）
  var raf = 0;
  var done = false;

  function paint(t) {
    var total = Math.min(t, TOTAL);
    prog.setAttribute('stroke-dashoffset', (CIRC * (1 - total / TOTAL)).toFixed(1));

    var round = Math.min(ROUNDS, Math.floor(total / CYCLE) + 1);
    var inRound = total - (round - 1) * CYCLE;
    var phase, remain, scale;

    if (inRound < IN) {
      phase = '吸';
      remain = IN - inRound;
      scale = 0.62 + 0.38 * (inRound / IN);
    } else if (inRound < IN + HOLD) {
      phase = '停';
      remain = IN + HOLD - inRound;
      scale = 1;
    } else {
      phase = '呼';
      remain = CYCLE - inRound;
      scale = 1 - 0.38 * ((inRound - IN - HOLD) / OUT);
    }

    phaseEl.textContent = phase;
    countEl.textContent = String(Math.max(1, Math.ceil(remain)));
    roundEl.textContent = '第 ' + round + ' / ' + ROUNDS + ' 轮';
    core.style.transform = 'scale(' + scale.toFixed(3) + ')';
  }

  function finish() {
    done = true;
    running = false;
    startBtn.textContent = '再来一次';
    phaseEl.textContent = '篆';
    countEl.textContent = '终';
    roundEl.textContent = '三轮已满 · 一篆终';
    prog.setAttribute('stroke-dashoffset', '0');
    core.style.transform = 'scale(0.72)';
  }

  function reset() {
    running = false;
    done = false;
    base = 0;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    phaseEl.textContent = '准备';
    countEl.textContent = '—';
    roundEl.textContent = '第 1 / ' + ROUNDS + ' 轮';
    core.style.transform = 'scale(0.62)';
    prog.setAttribute('stroke-dashoffset', CIRC.toFixed(1));
    startBtn.textContent = '开始';
  }

  function loop(now) {
    if (!running) return;
    // 浮层关闭或切到别的页就自动暂停
    var sheet = document.getElementById('refSheet');
    var open = sheet && sheet.classList.contains('is-on');
    if (!open || host.hidden) {
      running = false;
      startBtn.textContent = '继续';
      return;
    }
    var t = base + (now - t0) / 1000;
    if (t >= TOTAL) { paint(TOTAL); finish(); return; }
    paint(t);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (done) { reset(); }
    running = true;
    t0 = performance.now();
    startBtn.textContent = '暂停';
    raf = requestAnimationFrame(loop);
  }

  function pause() {
    if (!running) return;
    base += (performance.now() - t0) / 1000;
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    startBtn.textContent = '继续';
  }

  startBtn.addEventListener('click', function () {
    if (running) pause(); else start();
  });
  resetBtn.addEventListener('click', reset);

  // 打开《香事》时停在上次进度，关闭时由 loop 自动暂停
  reset();
})();
