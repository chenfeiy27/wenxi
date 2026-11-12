/* ============================================================
   闻息 · noise.js
   自实现 2D Simplex Noise（纯手写，零依赖，零网络请求）。
   用途：smoke.js 的烟雾湍流、app.js 的墨线抖动、开场墨晕的不规则感。
   参考经典 simplex 2D 构造；置换表由可复现的 mulberry32 种子生成。
   ============================================================ */

var Noise = (function () {
  'use strict';

  // 可复现的 32 位 PRNG
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var F2 = 0.5 * (Math.sqrt(3) - 1);
  var G2 = (3 - Math.sqrt(3)) / 6;

  // 8 个二维梯度方向
  var GRAD = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1]
  ];

  function Simplex(seed) {
    this.seed = (seed || 1) >>> 0;
    var rand = mulberry32(this.seed);
    var p = new Uint8Array(256);
    var i, j, tmp;

    for (i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) {           // Fisher–Yates
      j = (rand() * (i + 1)) | 0;
      tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }

    this.perm = new Uint8Array(512);
    this.mod8 = new Uint8Array(512);
    for (i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.mod8[i] = this.perm[i] & 7;
    }
  }

  // 返回值约在 [-1, 1]
  Simplex.prototype.noise2D = function (x, y) {
    var perm = this.perm, mod8 = this.mod8;

    var s = (x + y) * F2;
    var i = Math.floor(x + s);
    var j = Math.floor(y + s);
    var t = (i + j) * G2;

    var x0 = x - (i - t);
    var y0 = y - (j - t);

    var i1 = 0, j1 = 1;
    if (x0 > y0) { i1 = 1; j1 = 0; }

    var x1 = x0 - i1 + G2;
    var y1 = y0 - j1 + G2;
    var x2 = x0 - 1 + 2 * G2;
    var y2 = y0 - 1 + 2 * G2;

    var ii = i & 255;
    var jj = j & 255;

    var g0 = mod8[ii + perm[jj]];
    var g1 = mod8[ii + i1 + perm[jj + j1]];
    var g2 = mod8[ii + 1 + perm[jj + 1]];

    var n0 = 0, n1 = 0, n2 = 0;
    var t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      t0 *= t0;
      n0 = t0 * t0 * (GRAD[g0][0] * x0 + GRAD[g0][1] * y0);
    }
    var t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      t1 *= t1;
      n1 = t1 * t1 * (GRAD[g1][0] * x1 + GRAD[g1][1] * y1);
    }
    var t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      t2 *= t2;
      n2 = t2 * t2 * (GRAD[g2][0] * x2 + GRAD[g2][1] * y2);
    }

    return 70 * (n0 + n1 + n2);
  };

  // 分形叠加，returns [-1, 1]
  Simplex.prototype.fbm = function (x, y, octaves, lacunarity, gain) {
    var oct = octaves || 3;
    var lac = lacunarity || 2;
    var g = gain == null ? 0.5 : gain;
    var sum = 0, amp = 1, freq = 1, norm = 0;
    for (var o = 0; o < oct; o++) {
      sum += this.noise2D(x * freq, y * freq) * amp;
      norm += amp;
      amp *= g;
      freq *= lac;
    }
    return norm ? sum / norm : 0;
  };

  return { Simplex: Simplex, mulberry32: mulberry32 };
})();
