/* ============================================================
   闻息 · algorithm.js  （v2 沿用 v1 启发式算法，逻辑未改，可评审）
   输入：一次采样 { hr 心率bpm, hrv HRV(SDNN)ms, activity 活动强度 }
         + 个人基线 { restHR 静息心率, restHRV 静息HRV }
   输出：状态标签 -> 对应香氛模式
   定位：启发式"体验逻辑"，非医疗诊断、非中医脉诊。
   ============================================================ */

const Algorithm = (() => {
  // ---- 可调参数（演示阈值，答辩可说明"参数通过用户反馈迭代"）----
  const PARAMS = {
    highActivity: 1.2,      // 活动强度 > 此值 -> 判为"运动中"，去误触发
    stressThreshold: 0.55,  // 压力评分(0~1) > 此值 -> 判为"需要放松"
    hrWeight: 0.6,          // 心率升高在评分中的权重
    hrvWeight: 0.4,         // HRV 降低在评分中的权重
    hrNorm: 20,             // 心率高于基线 20bpm 视为压力满分
    hrvNorm: 30,            // HRV 低于基线 30ms 视为压力满分
    sustainSeconds: 6,      // 连续 N 秒处于高压才触发提示（去抖）
  };

  const STATE = {
    ACTIVE: 'active',                 // 运动中（不提醒）
    NORMAL: 'normal',                 // 平稳
    RELAX_NEEDED: 'relax_needed',     // 需要放松
  };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // 压力评分 0~1：心率相对基线升高 + HRV 相对基线降低，加权归一化
  function stressScore(sample, baseline) {
    const hrScore = clamp((sample.hr - baseline.restHR) / PARAMS.hrNorm, 0, 1);
    const hrvScore = clamp((baseline.restHRV - sample.hrv) / PARAMS.hrvNorm, 0, 1);
    return PARAMS.hrWeight * hrScore + PARAMS.hrvWeight * hrvScore;
  }

  // 单次采样 -> 状态标签
  function evaluate(sample, baseline) {
    if (sample.activity > PARAMS.highActivity) return STATE.ACTIVE;
    if (stressScore(sample, baseline) > PARAMS.stressThreshold) return STATE.RELAX_NEEDED;
    return STATE.NORMAL;
  }

  return { PARAMS, STATE, stressScore, evaluate };
})();
