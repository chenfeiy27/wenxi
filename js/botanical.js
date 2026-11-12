const layout = {"canvas": [1440, 900], "maximumOpacity": 0.15, "motifs": [["flower", 235, 8, 330, 142], ["flower", 588, -15, 285, 155], ["bamboo", 858, 45, 280, -62], ["flower", 1145, 2, 265, 155], ["wings", 78, 103, 175, 27], ["wings", 429, 152, 160, -22], ["wings", 1022, 142, 160, -15], ["wings", 1350, 85, 185, 25], ["bamboo", 45, 285, 260, 33], ["bamboo", 1380, 316, 340, -63], ["flower", 1000, 296, 154, -35], ["bamboo", 326, 218, 150, -45], ["bamboo", 655, 161, 148, -68], ["bamboo", 14, 490, 300, 60], ["wings", 1320, 498, 168, -28], ["flower", 320, 401, 140, 22], ["bamboo", 1100, 473, 149, -18], ["wings", 98, 631, 149, 37], ["bamboo", 239, 563, 148, 30], ["flower", 352, 638, 154, -10], ["flower", 927, 670, 146, 27], ["bamboo", 1223, 650, 225, 145], ["flower", 47, 811, 345, 15], ["flower", 300, 832, 275, -5], ["bamboo", 499, 821, 242, -26], ["wings", 657, 840, 160, 28], ["bamboo", 785, 835, 254, -19], ["flower", 1002, 831, 276, 16], ["wings", 1156, 846, 163, -40], ["flower", 1383, 811, 340, -28], ["bamboo", 1210, 100, 175, 0], ["bamboo", 730, 60, 175, -60], ["wings", 390, 30, 155, -135], ["bamboo", 1240, 865, 155, -45], ["wings", 850, 895, 115, 60], ["bamboo", 180, 370, 175, 165], ["flower", 20, 640, 135, -75], ["bamboo", 210, 460, 135, 180], ["flower", 1240, 360, 175, 135], ["flower", 1440, 550, 155, 135], ["bamboo", 1310, 660, 115, 150]], "accents": [["petals", 468, 58, 102, 20], ["leaves", 94, 196, 105, -25], ["leaves", 1272, 211, 101, 26], ["petals", 1058, 245, 93, -10], ["petals", 93, 395, 91, 15], ["leaves", 1377, 618, 105, -20], ["leaves", 71, 712, 100, 10], ["petals", 426, 767, 100, 40], ["petals", 613, 888, 102, -20], ["leaves", 1112, 739, 97, -27], ["petals", 1306, 867, 92, 10]]};

(function () {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const base = document.createElement('div');
  base.className = 'atmosphere-base';
  base.setAttribute('aria-hidden','true');
  base.innerHTML = '<div class="atmosphere-day"></div><div class="atmosphere-night"></div>';
  document.body.prepend(base);
  const root = document.createElement('div');
  root.className = 'botanical-background';
  root.setAttribute('aria-hidden','true');
  const sprigs = [];
  for (const key of ['motifs','accents']) {
    const field = document.createElement('div');
    field.className = 'botanical-field botanical-' + key;
    for (const [kind,x,y,size,angle] of layout[key]) {
      const el = document.createElement('span');
      el.className = 'botanical-sprig botanical-' + kind;
      el.style.cssText = `--x:${x/14.4}%;--y:${y/9}%;--size:${size/14.4}cqw;--size-fallback:${size/14.4}vw;--angle:${angle}deg`;
      el.innerHTML = '<span class="botanical-ink"></span>';
      field.append(el);
      if (key === 'motifs') sprigs.push({el,kind});
    }
    root.append(field);
  }
  const hover = document.createElement('div');
  hover.className = 'botanical-hover';
  [...root.children].forEach(field => hover.append(field.cloneNode(true)));
  root.append(hover);
  const halo = document.createElement('div'); halo.className='pointer-halo'; root.append(halo);
  document.body.prepend(root);
  let pending = 0, px = -500, py = -500, active = false;
  function commitPointer() {
    pending = 0;
    root.style.setProperty('--mx', px+'px');
    root.style.setProperty('--my', py+'px');
    root.classList.toggle('is-hover',active);
  }
  document.addEventListener('pointermove',function(e) {
    if(e.pointerType==='touch') return;
    px=e.clientX; py=e.clientY;
    const blocked = e.target.closest('#gate:not(.out), .sheet.is-on, .ref-sheet.is-on, .coach.is-on, .topbar, .rail-btn, .censer-wrap');
    const recordText = document.body.dataset.view==='records' && e.target.closest('.rec-grid > .col:last-child');
    active = !blocked && !recordText;
    if(!pending) pending=requestAnimationFrame(commitPointer);
  },{passive:true});
  function leave() { active=false; root.classList.remove('is-hover'); }
  document.documentElement.addEventListener('pointerleave',leave);
  window.addEventListener('blur',leave);
  new MutationObserver(leave).observe(document.body,{attributes:true,attributeFilter:['data-view']});
  let previous = '';
  let initialized = false;
  let animations = [];
  window.Botanical = {
    setMix(mix) {
      const keys=['chenxiang','zhuqing','longnao'];
      const signature=keys.map(k=>Math.round((mix[k]||0)*1000)).join('/');
      if(signature===previous) return;
      previous=signature;
      // The first frame retains the reviewed composition. Subsequent target
      // changes redistribute the same spatial slots, keeping total density fixed.
      if(!initialized) { initialized=true; return; }
      animations.forEach(a=>a.cancel()); animations=[];
      const weights=keys.map(k=>Math.max(0,mix[k]||0));
      const total=weights.reduce((a,b)=>a+b,0)||1;
      const quota=weights.map(w=>w/total*sprigs.length);
      const counts=quota.map(Math.floor);
      while(counts.reduce((a,b)=>a+b,0)<sprigs.length) {
        let best=0; for(let j=1;j<3;j++) if(quota[j]-counts[j]>quota[best]-counts[best]) best=j;
        counts[best]++;
      }
      const kinds=['flower','bamboo','wings'];
      // Keep existing kinds where possible; only excess slots change.
      const left=counts.slice(); const changes=[];
      sprigs.forEach((s,i)=>{const k=kinds.indexOf(s.kind); if(left[k]>0)left[k]--; else changes.push(i);});
      changes.forEach((index,order)=>{
        const s=sprigs[index]; const next=left.findIndex(n=>n>0); left[next]--;
        s.kind=kinds[next]; s.el.className='botanical-sprig botanical-'+s.kind;
        const twin=hover.querySelectorAll('.botanical-motifs .botanical-sprig')[index];
        twin.className=s.el.className;
        if(!reduced) {
          [s.el.firstElementChild,twin.firstElementChild].forEach(ink=>animations.push(ink.animate([
            {clipPath:'inset(100% 0 0 0)',opacity:0},
            {clipPath:'inset(0% 0 0 0)',opacity:1}
          ],{duration:1450,delay:order*75,easing:'cubic-bezier(.2,.65,.25,1)',fill:'backwards'})));
        }
      });
    }
  };
})();
