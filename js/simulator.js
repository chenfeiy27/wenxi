/* ============================================================
   闻息 · simulator.js  （v2 沿用 v1 数据模拟器，逻辑未改）
   生成一段"平静 -> 高压(久坐) -> 起身活动 -> 恢复"的脉搏与活动数据，
   用于验证算法、驱动 demo（真实传感器可替换此模块）。
   ============================================================ */

const Simulator = (() => {
  // 情景时间轴：[秒, 心率bpm, HRV(SDNN)ms, 活动强度]
  // [秒, 心率, HRV, 活动强度, 血氧 SpO2]
  const SCENARIO = [
    [0,  68, 62, 0.2, 97],   // 平静
    [12, 69, 61, 0.2, 97],   // 平静
    [18, 86, 32, 0.3, 96],   // 高压（久坐赶工）
    [34, 87, 30, 0.3, 96],   // 高压持续
    [42, 92, 46, 1.9, 96],   // 起身活动（去误触发）
    [50, 71, 56, 0.2, 97],   // 恢复
    [54, 68, 60, 0.2, 89],   // 夜间血氧短时下降（安全网演示）
    [58, 68, 59, 0.2, 88],   // 持续下降
    [64, 68, 60, 0.2, 97],   // 回到基线
  ];
  const DURATION = SCENARIO[SCENARIO.length - 1][0];

  const lerp = (a, b, k) => a + (b - a) * k;
  const noise = (r) => (Math.random() - 0.5) * 2 * r;

  // 取 t 秒处的一次采样（线性插值 + 轻微噪声）
  function sampleAt(t) {
    const tLoop = ((t % DURATION) + DURATION) % DURATION;
    for (let i = 0; i < SCENARIO.length - 1; i++) {
      const [t0, h0, v0, a0, s0] = SCENARIO[i];
      const [t1, h1, v1, a1, s1] = SCENARIO[i + 1];
      if (tLoop >= t0 && tLoop <= t1) {
        const k = (tLoop - t0) / (t1 - t0);
        return {
          time: tLoop,
          hr: lerp(h0, h1, k) + noise(1.0),
          hrv: lerp(v0, v1, k) + noise(1.0),
          activity: Math.max(0, lerp(a0, a1, k)),
          spo2: lerp(s0 == null ? 97 : s0, s1 == null ? 97 : s1, k),
        };
      }
    }
    return { time: tLoop, hr: 68, hrv: 60, activity: 0.2, spo2: 97 };
  }

  return { sampleAt, DURATION, SCENARIO };
})();
