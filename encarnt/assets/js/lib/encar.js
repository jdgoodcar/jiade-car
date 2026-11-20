// 讀取 Encar 資料（即時）。Encar 若改版，只需要修改這個檔案。
// 若哪天 Encar 擋掉瀏覽器直接讀取，把 API 改成自己的轉送網址即可（例如 Cloudflare Worker）。

export const API = 'https://api.encar.com';
export const PHOTO = 'https://ci.encar.com';
export const carUrl = id => `https://fem.encar.com/cars/detail/${id}`;

// Encar 查詢語法：值裡的「)」「.」要加底線跳脫
const esc = v => String(v).replace(/\)/g, '_)').replace(/\./g, '_.');
const enc = q => encodeURIComponent(q).replace(/%2E/g, '.');

/**
 * 把篩選條件轉成 Encar 查詢字串
 * f = { ct:'A'|'Y'|'N', mk, mg, md, fuel:[], tm:[], cat:[], color:[], rg:[], y1, y2, km, p1, p2 }
 * skip：產生「選單用」查詢時要略過的層級（例如列出廠牌時略過 mk/mg/md）
 */
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
  multi('FuelType', f.fuel); multi('Transmission', f.tm); multi('Category', f.cat);
  multi('Color', f.color); multi('OfficeCityState', f.rg);
  if (f.y1 || f.y2) parts.push(`Year.range(${f.y1 ? f.y1 + '00' : ''}..${f.y2 ? f.y2 + '12' : ''}).`);
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
