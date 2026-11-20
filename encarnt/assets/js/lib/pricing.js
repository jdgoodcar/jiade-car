// 車價公式：與佳德汽車「車價計算機」(car.html#kr) 完全相同，算到「加手續費之前」。
//   ① 韓幣 × 倍率（2000cc 以下 1.543／2000cc 以上 1.61）
//      奢侈稅：韓幣 7,000 萬（含）以上改乘 1.81，不再乘 1.543／1.61
//   ② ÷ 美金匯率（1 美元＝?韓元，不加成，取小數 2 位）→ 四捨五入到整數美金
//   ③ × 台幣匯率（1 美元＝?台幣，＋0.5% 加成，取小數 3 位）
//   ④ ＋ 標準底價 18 萬
// 公式若有調整，這裡和 car.html 要一起改。

export const RULES = {
  mulSmall: 1.543,   // 2000cc 以下
  mulLarge: 1.61,    // 2000cc 以上
  ccLimit: 2000,
  luxWon: 7e7,       // 7,000 萬韓元（含）以上
  mulLux: 1.81,
  buffer: 0.5,       // 美金→台幣 匯率加成 %
  base: 180000,      // 標準底價
};

/** 計算用匯率（四捨五入到畫面顯示的位數，與計算機一致） */
export function calcRates(rate) {
  if (!rate) return null;
  return {
    krate: Math.round(rate.usdKrw * 100) / 100,
    er: Math.round(rate.usdTwd * (1 + RULES.buffer / 100) * 1000) / 1000,
  };
}

/** 從車名／等級猜排氣量（例如「가솔린 2.5 터보」→ 2500），猜不到回傳 null */
export function guessCc(...texts) {
  for (const t of texts) {
    const m = String(t || '').match(/(?:^|[^\d.])([0-7]\.\d)(?:\s|T|L|$|[^\d])/i);
    if (m) { const v = +m[1]; if (v >= 0.6 && v <= 7.9) return Math.round(v * 1000); }
    const c = String(t || '').match(/(\d{3,4})\s*cc/i);
    if (c) return +c[1];
  }
  return null;
}

/**
 * @param priceMan Encar 價格（萬韓元）
 * @param cc 排氣量；電動車／氫能車傳 0；不知道傳 null
 * @param rate getRate() 的結果
 * @returns { price, won, wk, us, twd, mul, lux, ccKnown, krate, er } 或 null
 */
export function calcPrice(priceMan, cc, rate) {
  const r = calcRates(rate);
  if (!r || !(priceMan > 0)) return null;
  const won = priceMan * 10000;
  const lux = won >= RULES.luxWon;
  const ccKnown = lux || cc != null;
  const mul = lux ? RULES.mulLux : (cc > RULES.ccLimit ? RULES.mulLarge : RULES.mulSmall);
  const wk = Math.round(won * mul);
  const us = Math.round(wk / r.krate);
  const twd = Math.round(us * r.er);
  return { price: twd + RULES.base, won, wk, us, twd, mul, lux, ccKnown, cc, ...r };
}

/** 台幣預估車價 → 大約的韓幣（萬），給「價格篩選」用 */
export function manForTwd(twdPrice, rate) {
  const r = calcRates(rate);
  if (!r) return null;
  const net = Math.max(0, twdPrice - RULES.base);
  const won1 = net / r.er * r.krate / RULES.mulSmall;
  const won = won1 >= RULES.luxWon ? net / r.er * r.krate / RULES.mulLux : won1;
  return Math.round(won / 10000);
}
