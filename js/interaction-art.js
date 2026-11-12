/* Presentation-only controls. Running state remains owned by app.js. */
(function () {
  'use strict';
  document.body.classList.add('at-entrance');
  var ref = document.querySelector('.ref-inner');
  var culture = document.querySelector('.ref-body');
  if (ref && culture) {
    var tabs = document.createElement('nav');
    tabs.className = 'ref-tabs';
    tabs.setAttribute('aria-label', '香事目录');
    tabs.innerHTML = '<button type="button" data-ref-page="culture" aria-pressed="true">科普</button><button type="button" data-ref-page="game" aria-pressed="false">解压小游戏</button>';
    ref.querySelector('.ref-head').after(tabs);
    culture.id = 'refCulture';
    var game = document.createElement('div');
    game.id = 'refGame';
    game.className = 'ref-game';
    game.setAttribute('aria-label', '解压小游戏，内容待定');
    game.hidden = true;
    ref.append(game);
    window.selectRefPage = function (name) {
      culture.hidden = name !== 'culture';
      game.hidden = name !== 'game';
      tabs.querySelectorAll('button').forEach(function(b) { b.setAttribute('aria-pressed',String(b.dataset.refPage === name)); });
    };
    tabs.addEventListener('click',function(e) { var b=e.target.closest('[data-ref-page]'); if(b) window.selectRefPage(b.dataset.refPage); });
    window.selectRefPage('culture');
  }
  var gate = document.getElementById('gate');
  if (gate) {
    new MutationObserver(function () { if (gate.classList.contains('out')) document.body.classList.remove('at-entrance'); }).observe(gate, { attributes: true, attributeFilter: ['class'] });
  }
  document.querySelectorAll('.rail-toggle').forEach(function (button) {
    button.addEventListener('click', function () {
      var rail = button.closest('.rail');
      var collapsed = rail.classList.toggle('is-collapsed');
      var left = button.dataset.rail === 'left';
      button.textContent = left ? (collapsed ? '›' : '‹') : (collapsed ? '‹' : '›');
      button.setAttribute('aria-expanded', String(!collapsed));
      button.setAttribute('aria-label', (collapsed ? '展开' : '收起') + (left ? '设备' : '数据'));
      rail.querySelectorAll('.rail-btn').forEach(function (child) { child.disabled = collapsed; });
    });
  });
})();
