// 即時匯率：以美金為基準，取得「1 美元＝?韓元」與「1 美元＝?台幣」。
// 來源順序與車價計算機（car.html）相同；成功的結果暫存 10 分鐘，避免每頁都重抓。

const KEY = 'encarnt_rate';
const FRESH_MS = 10 * 60 * 1000;

const SOURCES = [
  { n: 'FXRatesAPI', u: 'https://api.fxratesapi.com/latest?base=USD&currencies=KRW,TWD', twd: j => j.success && j.rates && j.rates.TWD, krw: j => j.rates.KRW, t: j => (j.timestamp ? j.timestamp * 1000 : Date.now()) },
  { n: 'Coinbase', u: 'https://api.coinbase.com/v2/exchange-rates?currency=USD', twd: j => j.data && j.data.rates && j.data.rates.TWD, krw: j => j.data.rates.KRW, t: () => Date.now() },
  { n: 'ExchangeRate-API', u: 'https://open.er-api.com/v6/latest/USD', nb: true, twd: j => j.result === 'success' && j.rates.TWD, krw: j => j.rates.KRW, t: j => j.time_last_update_unix * 1000 },
  { n: 'Currency API', u: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', twd: j => j.usd && j.usd.twd, krw: j => j.usd.krw, t: j => Date.parse(j.date) },
];

function readCache() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
function writeCache(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* 無法暫存 */ } }

let pending = null;

/** 回傳 { usdTwd, usdKrw, src, time, stale } ；全部失敗且沒有暫存時回傳 null */
export function getRate() {
  const c = readCache();
  if (c && Date.now() - c.got < FRESH_MS) return Promise.resolve(c);
  if (pending) return pending;
  pending = (async () => {
    for (const s of SOURCES) {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 6000);
      try {
        const url = s.nb ? s.u : s.u + (s.u.includes('?') ? '&' : '?') + '_=' + Date.now();
        const r = await fetch(url, { signal: ctl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        const usdTwd = +s.twd(j), usdKrw = +s.krw(j);
        if (usdTwd > 1 && usdKrw > 100) {
          const v = { usdTwd, usdKrw, src: s.n, time: s.t(j) || Date.now(), got: Date.now() };
          writeCache(v); return v;
        }
      } catch (e) { /* 換下一個來源 */ } finally { clearTimeout(to); }
    }
    return c ? { ...c, stale: true } : null;
  })().finally(() => { pending = null; });
  return pending;
}
