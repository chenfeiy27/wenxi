/* ============================================================
   闻息 · tcm.js
   中间层：西医数据（心率 / HRV / 活动强度）→ 中医状态标签 → 香氛配方
   定位：传统香药"意象与体验"的选择依据，非诊断、非治疗、不承诺疗效。
   标签是"当下状态"的近似描述，不是体质判定。
   ============================================================ */

const TCM = (() => {
  'use strict';

  // ---- 香药基调：沉香（安神降气）/ 竹青（清心除烦）/ 龙脑（开窍醒神）----
  const OIL = {
    chenxiang: '沉香',
    zhuqing: '竹青',
    longnao: '龙脑'
  };

  // ---- 五个状态标签 + 各自配方 ----
  const LABELS = {
    heping: {
      name: '平和',
      note: '气血调匀 · 呼吸平稳',
      why: '心率与 HRV 均在个人基线附近，波动小',
      mix: { chenxiang: .40, zhuqing: .40, longnao: .20 }
    },
    xinhuo: {
      name: '心火偏亢',
      note: '心烦易躁 · 宜清',
      why: '心率高于基线 12 bpm 以上，同时 HRV 低于基线 12 ms 以上',
      mix: { chenxiang: .34, zhuqing: .50, longnao: .16 }
    },
    qiyu: {
      name: '气机郁滞',
      note: '胸中不舒 · 宜疏',
      why: 'HRV 明显低于基线，活动量却偏低（久坐、呼吸浅）',
      mix: { chenxiang: .30, zhuqing: .55, longnao: .15 }
    },
    shenpi: {
      name: '神疲气弱',
      note: '倦怠乏力 · 宜温',
      why: '心率高于基线但 HRV 未同步下降，活动少，恢复偏慢',
      mix: { chenxiang: .50, zhuqing: .24, longnao: .26 }
    },
    yinxu: {
      name: '阴虚夜燥',
      note: '夜间燥热 · 宜润',
      why: '夜间时段心率仍高于基线、HRV 偏低（燥而不静）',
      mix: { chenxiang: .46, zhuqing: .30, longnao: .24 }
    },
    xingzhi: {
      name: '行止',
      note: '正在活动 · 暂不判断',
      why: '活动强度高于 1.2，数据受运动干扰，不做状态判断',
      mix: null
    }
  };

  const ORDER = ['yinxu', 'xinhuo', 'qiyu', 'shenpi', 'heping'];

  const TH = {
    actHigh: 1.2,        // 活动强度阈值（与 algorithm.js 保持一致）
    hrUpHeavy: 12,       // 心率高于基线多少算"亢"
    hrUpMild: 4,
    hrvDownHeavy: 12,    // HRV 低于基线多少算"虚/郁"
    hrvDownMild: 4,
    hrvDownQiYu: 10,
    actStill: .45,       // 活动量偏低（久坐）
    actCalm: .60,
    stressXinHuo: .55,
    stressQiYu: .35,
    nightFrom: 22,       // 22:00 - 06:00 视为夜间
    nightTo: 6
  };

  function isNight(hour) {
    return hour >= TH.nightFrom || hour < TH.nightTo;
  }

  function classify(sample, baseline, ctx) {
    ctx = ctx || {};
    const hour = (ctx.hour == null) ? new Date().getHours() : ctx.hour;
    const stress = ctx.stress || 0;

    const hrUp = sample.hr - baseline.restHR;
    const hrvDown = baseline.restHRV - sample.hrv;

    const base = {
      hrUp: Math.round(hrUp),
      hrvDown: Math.round(hrvDown),
      activity: Number(sample.activity.toFixed(2)),
      isNight: isNight(hour)
    };

    let key;
    if (sample.activity > TH.actHigh) {
      key = 'xingzhi';
    } else if (base.isNight && hrUp >= 6 && hrvDown >= TH.hrvDownMild) {
      key = 'yinxu';
    } else if (hrUp >= TH.hrUpHeavy && hrvDown >= TH.hrvDownHeavy) {
      key = 'xinhuo';
    } else if (hrvDown >= TH.hrvDownQiYu && sample.activity < TH.actStill) {
      key = 'qiyu';
    } else if (hrUp >= TH.hrUpMild && hrvDown <= 3 && sample.activity < TH.actCalm) {
      key = 'shenpi';
    } else {
      key = 'heping';
    }

    const def = LABELS[key];
    return {
      key: key,
      name: def.name,
      note: def.note,
      why: def.why,
      mix: def.mix,
      evidence: base
    };
  }

  // 把标签的配方换算成可直接显示的百分比文本
  function mixText(mix) {
    if (!mix) return '';
    const out = [];
    for (const k in mix) {
      if (!mix.hasOwnProperty(k)) continue;
      out.push((OIL[k] || k) + ' ' + Math.round(mix[k] * 100) + '%');
    }
    return out.join(' · ');
  }

  return { LABELS, OIL, TH, classify, mixText, isNight };
})();

/* const 不会自动挂到 window，显式暴露一份，供 app.js 的 window.TCM 守卫与外部调试使用 */
window.TCM = TCM;
