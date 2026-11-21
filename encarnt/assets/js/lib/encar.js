// 讀取 Encar 資料（即時）。Encar 若改版，只需要修改這個檔案。
// 若哪天 Encar 擋掉瀏覽器直接讀取，把 API 改成自己的轉送網址即可（例如 Cloudflare Worker）。

export const API = 'https://api.encar.com';
export const PHOTO = 'https://ci.encar.com';
export const carUrl = id => `https://fem.encar.com/cars/detail/${id}`;

/** 原廠選配（套件）清單：回傳這個車型所有可選的選配，含名稱、新車加價（萬韓元） */
export async function getChoices(vehicleId) {
  const r = await fetch(`${API}/v1/readside/vehicles/car/${vehicleId}/options/choice`);
  if (!r.ok) throw new Error('Encar 回應錯誤 ' + r.status);
  return r.json();
}

// Encar 查詢語法：值裡的「)」「.」要加底線跳脫
const esc = v => String(v).replace(/\)/g, '_)').replace(/\./g, '_.');
const enc = q => encodeURIComponent(q).replace(/%2E/g, '.');

/**
 * 把篩選條件轉成 Encar 查詢字串
 * f = { ct:'A'|'Y'|'N', ex:[], mk, mg, md, fuel:[], tm:[], cat:[], color:[], seat:[], rg:[], y1, y2, km, p1, p2 }
 * skip：產生「選單用」查詢時要略過的層級（例如列出廠牌時略過 mk/mg/md）
 */
// Encar 燃料分類（全部）
export const FUELS = ['가솔린', '디젤', 'LPG(일반인 구입)', '가솔린+전기', '디젤+전기', 'LPG+전기', '가솔린+LPG', '가솔린+CNG', '전기', '수소', 'CNG', '기타'];
export const isDiesel = v => /^디젤/.test(v || '');
export const isEv = v => /^(전기|수소)$/.test(v || ''); // 純電、氫能（沒有排氣量）
export const isLpg = v => /LPG/.test(v || ''); // LPG、LPG 油電、汽油＋LPG
// 開關排除的燃料：這個燃料 v 是否屬於開關 x（diesel／ev／lpg）
export const fuelEx = (x, v) => (x === 'diesel' && isDiesel(v)) || (x === 'ev' && isEv(v)) || (x === 'lpg' && isLpg(v));
// 暫不接受代購的燃料：回傳名稱（柴油車／電動車），可接受則回傳空字串
export const notAccepted = v => (isDiesel(v) ? '柴油車' : isEv(v) ? '電動車' : '');

// 產地限制：依法規不能進口的產地（列表用廠牌／車款判斷；詳細頁再用車身號碼第一碼確認）
// 營業用：計程車等，列表依「不含營業用車」開關決定是否顯示
export const BLOCK_MAKERS = ['BYD', '동풍소콘', '북기은상', '신위안', '지리', '지커', '조이롱', '포톤', '폴스타'];
export const vinBlocked = vin => /^L/i.test(vin || ''); // 車身號碼第一碼
export function blockReason(maker, model, badge, badgeDetail) {
  const m = model || '';
  if (BLOCK_MAKERS.includes(maker) || (maker === '볼보' && /S90/.test(m))) return 'origin';
  if (/택시|영업|모범형/.test([m, badge, badgeDetail].join(' '))) return 'biz';
  return '';
}
export const OLD_YEARS = 10; // 預設排除幾年以上的舊車（過不了台灣現行排放標準的機率高）

export function buildQuery(f, skip = {}) {
  const chain = ['CarType.' + (f.ct || 'A') + '.'];
  if (!skip.mk && f.mk) {
    chain.push('Manufacturer.' + esc(f.mk) + '.');
    if (!skip.mg && f.mg) {
      chain.push('ModelGroup.' + esc(f.mg) + '.');
      if (!skip.md && f.md) chain.push('Model.' + esc(f.md) + '.');
    }
  }
  const nest = a => (a.length === 1 ? a[0] : '(C.' + a[0] + '_.' + nest(a.slice(1)) + ')');
  const parts = ['Hidden.N.', 'SellType.일반.', nest(chain)];
  const multi = (name, arr) => {
    if (!arr || !arr.length) return;
    parts.push(arr.length === 1 ? `${name}.${esc(arr[0])}.` : '(Or.' + arr.map(v => `${name}.${esc(v)}.`).join('_.') + ')');
  };
  // 預設排除（f.ex）：diesel 柴油、ev 純電／氫能、acc 事故車。自己勾選燃料時以勾選為準
  const ex = f.ex || [];
  let fuel = f.fuel;
  if ((!fuel || !fuel.length) && ex.some(x => ['diesel', 'ev', 'lpg'].includes(x))) {
    fuel = FUELS.filter(v => !ex.some(x => fuelEx(x, v)));
  }
  if (ex.includes('acc')) parts.push('(Or.Accident.N._.Accident.F.)'); // Encar 判定：N 無事故、F 無資料、Y 有事故
  multi('FuelType', fuel); multi('Transmission', f.tm); multi('Category', f.cat);
  multi('Color', f.color); multi('SeatColor', f.seat); multi('OfficeCityState', f.rg);
  const y1 = f.y1 || (ex.includes('old') ? new Date().getFullYear() - OLD_YEARS : 0); // 沒自己選年份時，預設不含太舊的車
  if (y1 || f.y2) parts.push(`Year.range(${y1 ? y1 + '00' : ''}..${f.y2 ? f.y2 + '12' : ''}).`);
  if (f.km) parts.push(`Mileage.range(..${f.km}).`);
  // 價格：排除 Encar 上「1 萬」「9999 萬」這類假價格（洽詢價、租賃）
  const p1 = Math.max(100, f.p1 || 0), p2 = f.p2 && f.p2 < 99999 ? f.p2 : 99998;
  parts.push(`Price.range(${p1}..${p2}).`);
  return '(And.' + parts.join('_.') + ')';
}

export const SORTS = {
  new: 'ModifiedDate', priceAsc: 'PriceAsc', priceDesc: 'PriceDesc',
  kmAsc: 'Mileage', kmDesc: 'MileageDesc', yearDesc: 'Year',
};

async function getJson(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error('Encar 回應錯誤 ' + r.status);
  return r.json();
}

/** 車輛列表：回傳 { total, cars } */
export async function searchCars(f, sort, offset, size, signal) {
  const sr = encodeURIComponent(`|${SORTS[sort] || SORTS.new}|${offset}|${size}`);
  const j = await getJson(`${API}/search/car/list/general?count=true&q=${enc(buildQuery(f))}&sr=${sr}`, signal);
  return { total: j.Count || 0, cars: j.SearchResults || [] };
}

// 選單資料暫存（同一個查詢不重抓）
const navCache = new Map();
async function nav(q, signal) {
  if (navCache.has(q)) return navCache.get(q);
  const p = getJson(`${API}/search/car/list/general?count=true&inav=${encodeURIComponent('|Metadata|Sort')}&q=${enc(q)}`, signal)
    .then(j => j.iNav.Nodes);
  navCache.set(q, p);
  p.catch(() => navCache.delete(q));
  return p;
}

const facetList = node => (node ? node.Facets.map(x => ({ value: x.Value, count: x.Count, en: ((x.Metadata || {}).EngName || [])[0] || '' })) : []);

/** 廠牌／車系／車型選單：level = 'mk' | 'mg' | 'md' */
export async function hierarchy(f, level, signal) {
  const skip = level === 'mk' ? { mk: 1 } : level === 'mg' ? { mg: 1 } : { md: 1 };
  const nodes = await nav(buildQuery(f, skip), signal);
  const ct = nodes.find(n => n.Name === 'CarType');
  let cur = ct.Facets.find(x => x.IsSelected) || ct.Facets[0];
  const names = ['Manufacturer', 'ModelGroup', 'Model'];
  const depth = level === 'mk' ? 0 : level === 'mg' ? 1 : 2;
  for (let i = 0; i <= depth; i++) {
    const node = cur && cur.Refinements && cur.Refinements.Nodes.find(n => n.Name === names[i]);
    if (i === depth) return facetList(node).filter(x => x.count > 0);
    cur = node && node.Facets.find(x => x.IsSelected);
  }
  return [];
}

/** 單台車詳細資料（Encar 的廣告編號 id） */
export function getDetail(id, signal) { return getJson(`${API}/v1/readside/vehicle/${id}`, signal); }

/** 保險／事故紀錄（需要 vehicleId 與車牌） */
export async function getRecord(vehicleId, vehicleNo, signal) {
  try { return await getJson(`${API}/v1/readside/record/vehicle/${vehicleId}/open?vehicleNo=${encodeURIComponent(vehicleNo)}`, signal); }
  catch (e) { return null; }
}

/** 照片網址 */
export const photoUrl = path => (path ? PHOTO + path : '');
