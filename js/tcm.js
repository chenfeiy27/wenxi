/* ============================================================
   闻息 · tcm.js   （对齐《01 中医证候与可穿戴指标映射研究》V1.0）
   四层结构中的 L2/L3：
     L2 中医变量（气 · 血 · 阴 · 阳 · 火）→ 偏倾方向与幅度
     L3 状态标签（四类复合指纹 + 置信度）
     L4 香方（君臣佐使比例）

   三条立场（文档 §1.3）在代码里的落点：
     · 翻译而非等同 —— 输出「倾向 + 置信度」，不输出证候诊断
     · 可证伪 —— 每条规则写明反例（excludes），命中反例直接不判
     · 可干预 —— 每个状态绑定一组香方与释放节奏

   合规：本文件不做脉诊、不做疾病判断；血氧不参与中医映射（文档 §5.5）。
   ============================================================ */

const TCM = (() => {
  'use strict';

  const OIL = { chenxiang: '沉香', zhuqing: '竹青', longnao: '龙脑' };

  /* ---------- 判定阈值（文档 §5、§6 的经验参数，属待校准项） ---------- */
  const TH = {
    actHigh: 1.2,        // 活动强度上限，超过视为运动中
    nightFrom: 22,       // 夜间时段
    nightTo: 6,
    hrUpNight: 5,        // 夜间心率高于基线 ≥5 bpm（§6.1）
    hrUpDay: 8,          // 日间心率高于基线 ≥8 bpm（§3.2 场景二）
    hrvPctDeep: 15,      // 变异性低于基线 ≥15%（§6.1）
    hrvPctMid: 8,
    hrvPctWeak: 12,      // 气血两虚用
    actLow: 0.5,         // 久坐
    actStill: 0.4,
    hrDownYang: -3,      // 低于基线 ≥3 bpm → 阳虚方向
    minHit: 2            // 复合指纹至少命中 2 项才成判（文档 §4.2 规则二）
  };

  /* ---------- 四类状态 + 平和 / 行止（文档 §6） ---------- */
  const STATES = {
    xinhuo: {
      name: '心火偏亢',
      note: '入睡偏难 · 宜清心',
      why: '夜间心率未回落、心率变异性偏低',
      excludes: '发热、饮酒、甲亢、焦虑急性发作',
      mix: { chenxiang: .30, zhuqing: .45, longnao: .25 },
      roles: { jun: '竹青', chen: '沉香', zuo: '龙脑' },
      release: '浓度 3%–5% · 3 分钟升至峰值 · 维持 25 分钟'
    },
    qixue: {
      name: '气血两虚',
      note: '倦怠乏力 · 宜温养',
      why: '调节储备偏低、活动量少、心率反应迟钝',
      excludes: '贫血、甲状腺功能减退、抑郁状态',
      mix: { chenxiang: .50, zhuqing: .25, longnao: .25 },
      roles: { jun: '沉香', chen: '竹青', zuo: '龙脑' },
      release: '浓度 3%–4% · 5 分钟上升 · 维持 40 分钟'
    },
    yinxu: {
      name: '阴虚火旺',
      note: '夜间燥热 · 宜滋阴',
      why: '夜间心率下降不足、变异性偏低',
      excludes: '围绝经期潮热、感染、药物副作用',
      mix: { chenxiang: .45, zhuqing: .35, longnao: .20 },
      roles: { jun: '沉香', chen: '竹青', zuo: '龙脑' },
      release: '浓度 2%–3% · 10 分钟缓升 · 维持 60 分钟'
    },
    yangxu: {
      name: '脾肾阳虚',
      note: '畏寒肢冷 · 宜温阳',
      why: '静息心率偏低、活动量长期低位',
      excludes: '甲状腺功能减退、病理性窦性心动过缓',
      mix: { chenxiang: .55, zhuqing: .15, longnao: .30 },
      roles: { jun: '沉香', chen: '龙脑', zuo: '竹青' },
      release: '浓度 2%–3% · 中速释放 · 可配合微热'
    },
    heping: {
      name: '平和',
      note: '气血调匀 · 呼吸平稳',
      why: '各项指标在个人基线附近',
      excludes: '',
      mix: { chenxiang: .40, zhuqing: .40, longnao: .20 },
      roles: { jun: '沉香', chen: '竹青', zuo: '龙脑' },
      release: '浓度 2% · 缓慢释放'
    },
    xingzhi: {
      name: '行止',
      note: '正在活动 · 暂不判断',
      why: '活动强度高于 1.2，数据受运动干扰',
      excludes: '',
      mix: null,
      roles: null,
      release: ''
    },
    unknown: {
      name: '数据不足',
      note: '仅记趋势 · 暂不判断',
      why: '命中特征不足两项，不做状态判断',
      excludes: '',
      mix: null,
      roles: null,
      release: ''
    }
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isNight = (h) => h >= TH.nightFrom || h < TH.nightTo;

  /* ---------- 复合指纹 ---------- */
  function fingerprint(sample, baseline, ctx) {
    const hour = (ctx.hour == null) ? new Date().getHours() : ctx.hour;
    const hrUp = sample.hr - baseline.restHR;
    const hrvPct = baseline.restHRV > 0 ? (baseline.restHRV - sample.hrv) / baseline.restHRV * 100 : 0;
    const act = sample.activity;
    const night = isNight(hour);

    return {
      hrUp: hrUp,
      hrvPct: hrvPct,
      act: act,
      night: night,
      items: {
        nightHrUp: { met: night && hrUp >= TH.hrUpNight, text: '夜间心率 +' + Math.round(hrUp) + ' bpm' },
        dayHrUp: { met: !night && hrUp >= TH.hrUpDay, text: '日间心率 +' + Math.round(hrUp) + ' bpm' },
        hrvDeep: { met: hrvPct >= TH.hrvPctDeep, text: '变异性 −' + Math.round(clamp(hrvPct, 0, 90)) + '%' },
        hrvMid: { met: hrvPct >= TH.hrvPctMid, text: '变异性 −' + Math.round(clamp(hrvPct, 0, 90)) + '%' },
        hrvWeak: { met: hrvPct >= TH.hrvPctWeak, text: '调节储备 −' + Math.round(clamp(hrvPct, 0, 90)) + '%' },
        hrFlat: { met: hrUp < 6, text: '心率未见升高' },
        hrLow: { met: hrUp <= TH.hrDownYang, text: '心率低于基线 ' + Math.abs(Math.round(hrUp)) + ' bpm' },
        still: { met: act < TH.actLow, text: '活动量偏低' },
        veryStill: { met: act < TH.actStill, text: '久坐' }
      }
    };
  }

  /* 状态规则：core 为核心条件（必须命中），need 为指纹项，min 为最少命中数。
     顺序即优先级：心火在阴虚之前，因为二者夜间数据高度重叠，
     心火要求"心率升幅更大 + 变异性更低"，阴虚则是"轻微升高 + 中等下降"。 */
  const RULES = [
    { key: 'yangxu', core: ['hrLow'], need: ['veryStill', 'still'], min: 2 },
    { key: 'xinhuo', core: ['nightHrUp'], need: ['hrvDeep', 'still', 'dayHrUp'], min: 2 },
    { key: 'yinxu', core: ['nightHrUp'], need: ['hrvMid', 'still'], min: 2 },
    { key: 'qixue', core: ['hrvWeak'], need: ['hrFlat', 'still'], min: 2 }
  ];

  function confLevel(hit) {
    if (hit >= 3) return 'high';
    if (hit >= 2) return 'mid';
    return 'low';
  }

  /**
   * @param {object} sample   {hr, hrv, activity, spo2?}
   * @param {object} baseline {restHR, restHRV}
   * @param {object} ctx      {hour, stress, contaminated?}
   */
  function classify(sample, baseline, ctx) {
    ctx = ctx || {};
    const fp = fingerprint(sample, baseline, ctx);

    const base = {
      hrUp: Math.round(fp.hrUp),
      hrvPct: Math.round(clamp(fp.hrvPct, -99, 99)),
      act: Number(fp.act.toFixed(2)),
      night: fp.night,
      evidence: []
    };

    // 运动中：不判断
    if (sample.activity > TH.actHigh) {
      return Object.assign({}, STATES.xingzhi, {
        key: 'xingzhi', confidence: 'mid', confidenceText: '不适用', evidence: [], fp: base
      });
    }

    // 污染窗口：只记录不判断（文档 §2.2 与"留白"）
    if (ctx.contaminated) {
      return Object.assign({}, STATES.unknown, {
        key: 'unknown', confidence: 'low', confidenceText: '污染窗口',
        why: '处于污染窗口（饮酒 / 熬夜 / 发热 / 时差等），本轮不判断',
        evidence: [], fp: base
      });
    }

    for (let i = 0; i < RULES.length; i++) {
      const r = RULES[i];
      const coreOk = (r.core || []).every((k) => fp.items[k] && fp.items[k].met);
      if (!coreOk) continue;
      const hitItems = [];
      (r.core || []).forEach((k) => {
        if (fp.items[k] && fp.items[k].met) hitItems.push(fp.items[k].text);
      });
      r.need.forEach((k) => {
        if (fp.items[k] && fp.items[k].met) hitItems.push(fp.items[k].text);
      });
      if (hitItems.length >= r.min + (r.core ? r.core.length : 0)) {
        const st = STATES[r.key];
        const conf = confLevel(hitItems.length);
        return Object.assign({}, st, {
          key: r.key,
          confidence: conf,
          confidenceText: conf === 'high' ? '较高置信' : (conf === 'mid' ? '中等置信' : '低置信'),
          evidence: hitItems,
          fp: base
        });
      }
    }

    // 平和：心率与变异性都在基线附近
    const near = Math.abs(fp.hrUp) < 8 && Math.abs(fp.hrvPct) < TH.hrvPctWeak;
    if (near) {
      return Object.assign({}, STATES.heping, {
        key: 'heping', confidence: 'mid', confidenceText: '中等置信',
        evidence: ['心率 ' + (base.hrUp >= 0 ? '+' : '') + base.hrUp + ' bpm · 变异性 ' +
                   (base.hrvPct >= 0 ? '−' : '+') + Math.abs(base.hrvPct) + '%'],
        fp: base
      });
    }

    return Object.assign({}, STATES.unknown, {
      key: 'unknown', confidence: 'low', confidenceText: '数据不足', evidence: [], fp: base
    });
  }

  /* 香方文本：君臣佐使 */
  function rolesText(st) {
    if (!st || !st.roles) return '';
    return '君 ' + st.roles.jun + ' · 臣 ' + st.roles.chen + ' · 佐使 ' + st.roles.zuo;
  }

  function mixText(mix) {
    if (!mix) return '';
    const out = [];
    for (const k in mix) {
      if (!mix.hasOwnProperty(k)) continue;
      out.push((OIL[k] || k) + ' ' + Math.round(mix[k] * 100) + '%');
    }
    return out.join(' · ');
  }

  /* 安全网（文档 §5.5 / 场景 3.6）：血氧不参与中医映射，只做就医提示 */
  function safetyCheck(history) {
    if (!history || history.length < 3) return null;
    const recent = history.slice(-3);
    const lows = recent.filter((v) => v != null && v < 90);
    if (lows.length >= 2) {
      return {
        level: 'referral',
        text: '检测到血氧短时下降 · 建议暂停香氛，必要时到呼吸科或睡眠门诊评估'
      };
    }
    return null;
  }

  return {
    LABELS: STATES, STATES, OIL, TH,
    classify, rolesText, mixText, safetyCheck, isNight
  };
})();

/* const 不会自动挂到 window，显式暴露一份，供 app.js 的 window.TCM 守卫与调试使用 */
window.TCM = TCM;
