// 車輛詳細頁：detail.html?id=Encar 車輛編號
import { loadI18n, tMaker, tName, tSpec, tOption, optionGroups, optionCodes, autoTranslate } from './lib/i18n.js?v=68';
import { getDetail, getRecord, getChoices, photoUrl, carUrl, notAccepted, searchCars } from './lib/encar.js?v=68';
import { getRate } from './lib/rate.js?v=68';
import { calcPrice, RULES, guessCc } from './lib/pricing.js?v=68';
import { getInspection, inspectionCard } from './lib/inspect.js?v=68';
import { $, fmt, wan, esc, ym, km, askLine, lineText, copyText, toast, isTouch, carTitle } from './lib/ui.js?v=68';
import { isFav, toggleFav, updateFav, setHeart, updateFavCount, HEART, FAV_MAX } from './lib/fav.js?v=68';

updateFavCount();

// 電腦版分享：QR Code（在瀏覽器裡產生，不經過其他網站）
const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
let qrLoad = null;
function openQr(link) {
  $('#qrSheet').hidden = false;
  qrLoad = qrLoad || new Promise((ok, no) => { const s = document.createElement('script'); s.src = QR_LIB; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  qrLoad.then(() => { $('#qrImg').innerHTML = ''; new window.QRCode($('#qrImg'), { text: link, width: 220, height: 220, correctLevel: window.QRCode.CorrectLevel.M }); })
    .catch(() => { $('#qrImg').innerHTML = '<p class="fine">QR Code 載入失敗，請改用下方按鈕複製連結。</p>'; qrLoad = null; });
  const u = $('#qrUrl'); u.value = link; u.onclick = () => u.select();
  $('#qrCopy').onclick = async () => { u.select(); toast((await copyText(link)) ? '已複製這台車的網址' : '無法複製，請手動選取網址'); };
}
const closeQr = () => { $('#qrSheet').hidden = true; };
$('#qrX').onclick = closeQr;
$('#qrSheet').onclick = e => { if (e.target.id === 'qrSheet') closeQr(); };
addEventListener('keydown', e => { if (e.key === 'Escape') closeQr(); });

// 回到最上面（往下滑一段後出現）
addEventListener('scroll', () => $('#toTop').classList.toggle('on', scrollY > 600), { passive: true });
$('#toTop').onclick = () => scrollTo({ top: 0, behavior: 'smooth' });

const id = new URLSearchParams(location.search).get('id');
// 從列表點進來：列表上那張照片已經在手機裡，先顯示出來，不用等資料
let listPhoto = '';
try { const ph = JSON.parse(sessionStorage.getItem('encarnt_ph')); if (ph && String(ph.id) === String(id)) listPhoto = ph.src; } catch (e) { /* 無 */ }
if (listPhoto) { const sk = document.querySelector('.gal.sk .ph'); if (sk) sk.innerHTML = `<img src="${esc(listPhoto)}" alt="" style="width:100%;height:100%;object-fit:contain;display:block">`; }

// 返回：從列表、我的收藏、比較進來就回到原本那一頁（保留捲動位置），否則回車輛列表
const from = (() => {
  try {
    const r = new URL(document.referrer), here = location.pathname.replace(/detail\.html$/, '');
    if (r.origin !== location.origin || !r.pathname.startsWith(here)) return null;
    const page = r.pathname.slice(here.length);
    return page === 'fav.html' ? '返回我的收藏' : page === 'compare.html' ? '返回車輛比較' : (page === '' || page === 'index.html') ? '返回車輛列表' : null;
  } catch (e) { return null; }
})();
if (from) $('#back').lastChild.textContent = from;
$('#back').onclick = () => { if (from) history.back(); else location.href = './'; };

function fail(title, msg) {
  $('#app').innerHTML = `<div class="err"><b>${esc(title)}</b>${esc(msg)}<br><br><a class="btn-m" href="./" style="text-decoration:none;display:inline-block">回到車輛列表</a></div>`;
}

// 照片：依 Encar 的編號排序（001 正面…）。THUMBNAIL 是 Encar 給列表用的重複縮圖，略過；同一張檔案只放一次
// 車底照片（Encar 診斷中心拍攝，放在最後；原檔很大，用 Encar 的縮小版）
function gallery(photos, alt, under) {
  const list = [...new Set((photos || []).filter(p => p.type !== 'THUMBNAIL').sort((a, b) => a.code.localeCompare(b.code)).map(p => photoUrl(p.path))
    .concat((under || []).filter(p => p.photoPath).map(p => 'https://imgcar.encar.com' + p.photoPath + '?d=1080x608')))];
  if (!list.length) return '<div class="gal"><div style="aspect-ratio:4/3;display:grid;place-items:center;color:#9aa2b3">沒有照片</div></div>';
  // 大圖用 1280 寬（手機高解析螢幕才清楚），下方小縮圖只要 240 寬（省流量）
  const size = (u, w, h) => (u.startsWith('https://ci.encar.com') ? `${u}?impolicy=heightRate&rh=${h}`
    : w <= 240 ? u.replace('?d=1080x608', '?d=240x135') : u);
  // 大圖載入前，先用小縮圖（第一張用列表上已經載好的照片）墊在底下，不會看到一塊黑
  const ph = (u, i) => (i === 0 && listPhoto ? listPhoto : size(u, 240, 180));
  return `<div class="gal"><div class="track" id="track">${list.map((u, i) =>
    `<img src="${esc(size(u, 1280, 960))}" alt="${esc(alt)} 照片 ${i + 1}" ${i > 1 ? 'loading="lazy"' : i ? '' : 'fetchpriority="high"'} decoding="async" width="640" height="480" style="background-image:url('${esc(ph(u, i))}')">`).join('')}</div>
    <button class="nav prev" type="button" aria-label="上一張">‹</button><button class="nav next" type="button" aria-label="下一張">›</button>
    <span class="cnt" id="cnt">1 / ${list.length}</span></div>
    <div class="thumbs" id="thumbs">${list.map((u, i) => `<img src="${esc(size(u, 240, 180))}" alt="" loading="lazy" decoding="async" data-i="${i}" class="${i ? '' : 'on'}">`).join('')}</div>`;
}
function bindGallery() {
  const tr = $('#track'); if (!tr) return;
  const n = tr.children.length, th = $('#thumbs');
  const go = i => tr.scrollTo({ left: Math.max(0, Math.min(n - 1, i)) * tr.clientWidth, behavior: 'smooth' });
  const cur = () => Math.round(tr.scrollLeft / tr.clientWidth);
  let raf;
  tr.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const i = cur(); $('#cnt').textContent = `${i + 1} / ${n}`;
      th.querySelectorAll('img').forEach((im, k) => im.classList.toggle('on', k === i));
      const t = th.children[i]; if (t) th.scrollTo({ left: t.offsetLeft - th.clientWidth / 2 + t.clientWidth / 2, behavior: 'smooth' });
    });
  }, { passive: true });
  $('.gal .prev').onclick = () => go(cur() - 1);
  $('.gal .next').onclick = () => go(cur() + 1);
  th.onclick = e => { const im = e.target.closest('img'); if (im) go(+im.dataset.i); };
}

function priceCard(p, priceMan, rate, cc) {
  if (!p) return `<div class="card price"><h2>預估車價</h2><div class="krw">韓國售價 ${fmt(priceMan)} 萬韓元</div><p class="fine">匯率讀取失敗，暫時無法換算台幣，請稍後重新整理。</p></div>`;
  const ccTxt = p.lux ? '韓幣 7,000 萬以上・奢侈稅' : (cc > RULES.ccLimit ? `${fmt(cc)}cc・2000cc 以上` : cc ? `${fmt(cc)}cc・2000cc 以下` : '電動車');
  const t = new Date(rate.time);
  return `<div class="card price"><h2>預估車價</h2>
    <div class="big"><small>約 </small>${wan(p.price)}<small> 萬元</small></div>
    <div class="wan">NT$ ${fmt(p.price)}（未含手續費）</div>
    <div class="krw">韓國售價 ${fmt(priceMan)} 萬韓元</div>
    <details class="calc"><summary>查看計算方式</summary><div class="steps">
      <div><span>韓幣車價</span><b>${fmt(p.won)} 韓元</b></div>
      <div><span>${p.lux ? '奢侈稅' : '乘倍率'} × ${p.mul}<br><small>${ccTxt}</small></span><b>${fmt(p.wk)} 韓元</b></div>
      <div><span>換美金 ÷ ${p.krate.toLocaleString('en-US')}</span><b>${fmt(p.us)} 美金</b></div>
      <div><span>換台幣 × ${p.er.toFixed(3)}</span><b>${fmt(p.twd)} 台幣</b></div>
      <div><span>＋ 標準底價</span><b>${fmt(RULES.base)} 台幣</b></div>
      <div class="tot"><span>預估車價</span><b>${fmt(p.price)} 元</b></div>
    </div></details>
    <p class="fine">匯率：${esc(rate.src)}，${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} 更新${rate.stale ? '（網路異常，使用上次匯率）' : ''}；台幣匯率已加 ${RULES.buffer}% 緩衝。<br>實際金額依購買當日匯率與報價單為準。</p></div>`;
}

// Encar 刊登資訊：刊登幾天、多少人看過、多少人收藏
function listingInfo(m) {
  if (!m) return '';
  const t = Date.parse(m.firstAdvertisedDateTime || m.registDateTime || '');
  const days = isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 86400000));
  const parts = [days == null ? '' : days === 0 ? '今天剛刊登' : `Encar 刊登 ${fmt(days)} 天`,
    m.viewCount ? `${fmt(m.viewCount)} 次瀏覽` : '', m.subscribeCount ? `${fmt(m.subscribeCount)} 人收藏` : ''].filter(Boolean);
  return parts.length ? `<div class="lst">${parts.map(esc).join('<i>・</i>')}</div>` : '';
}
// 抵押、扣押（韓國車籍登記）：有的話要先解除才能過戶出口
function seizingHtml(sz) {
  if (!sz) return '';
  const p = sz.pledgeCount || 0, s = sz.seizingCount || 0;
  return `<div class="${p ? 'warn' : 'ok'}"><span>抵押紀錄</span><b>${p ? p + ' 筆' : '無'}</b></div><div class="${s ? 'warn' : 'ok'}"><span>扣押紀錄</span><b>${s ? s + ' 筆' : '無'}</b></div>`;
}
function recordCard(rec, rate, sz) {
  if (!rec || !rec.openData) return `<div class="card"><h2>保險／事故紀錄</h2>${sz ? `<div class="rec">${seizingHtml(sz)}</div>` : ''}<p class="fine" style="margin:${sz ? '10px' : '0'} 0 0">賣家未公開此車的保險紀錄，可透過 LINE 請我們協助查詢。</p></div>`;
  const krwTwd = rate ? rate.usdTwd / rate.usdKrw : 0;
  const money = w => (w ? `₩${fmt(w)}${krwTwd ? `<br><small>約 NT$ ${fmt(w * krwTwd)}</small>` : ''}` : '無');
  const flood = (rec.floodTotalLossCnt || 0) + (rec.floodPartLossCnt || 0);
  const biz = (rec.business || 0) + (rec.government || 0);
  const gap = [1, 2, 3, 4, 5].map(i => rec['notJoinDate' + i]).filter(Boolean)
    .map(s => s.replace(/(\d{4})(\d{2})/g, '$1/$2'));
  const item = (label, val, ok) => `<div class="${ok === null ? '' : ok ? 'ok' : 'warn'}"><span>${label}</span><b>${val}</b></div>`;
  return `<div class="card"><h2>保險／事故紀錄</h2><div class="rec">
    ${item('本車保險理賠', `${rec.myAccidentCnt || 0} 次`, !rec.myAccidentCnt)}
    ${item('理賠金額（本車）', money(rec.myAccidentCost), null)}
    ${item('他車造成損害', `${rec.otherAccidentCnt || 0} 次`, !rec.otherAccidentCnt)}
    ${item('理賠金額（他車）', money(rec.otherAccidentCost), null)}
    ${item('車主變更', `${rec.ownerChangeCnt || 0} 次`, true)}
    ${item('車牌變更', `${rec.carNoChangeCnt || 0} 次`, true)}
    ${item('全損紀錄', rec.totalLossCnt ? `${rec.totalLossCnt} 次` : '無', !rec.totalLossCnt)}
    ${item('泡水紀錄', flood ? `${flood} 次` : '無', !flood)}
    ${item('失竊紀錄', rec.robberCnt ? `${rec.robberCnt} 次` : '無', !rec.robberCnt)}
    ${item('租賃車（出租）紀錄', rec.loan ? '有' : '無', !rec.loan)}
    ${item('營業用／公務用紀錄', biz ? '有' : '無', !biz)}
    ${item('保險空窗期', gap.length ? `${gap.length} 段` : '無', !gap.length)}
    ${seizingHtml(sz)}
  </div>
  ${gap.length ? `<p class="fine"><b>保險未投保期間：</b>${gap.map(esc).join('、')}（此期間若有事故不會出現在紀錄中）</p>` : ''}
  <p class="fine">資料來源：韓國保險開發院（經 Encar 公開），僅含有申請保險理賠的紀錄；抵押／扣押為 Encar 提供的車籍登記資料，有紀錄需先解除才能過戶。</p></div>`;
}

// 配備：依類別分組。另外讀「原廠選配」（新車時加價選購的套件，名稱只有韓文）
const GROUP_EN = { '01': 'Exterior / Interior', '02': 'Safety', '03': 'Convenience / Multimedia', '04': 'Seats' };
let optData = { groups: [], choice: [] }; // 給「複製配備」按鈕用
function optionsCard(opt) {
  const groups = optionGroups(), by = {};
  // 依 Encar 原網站的配備順序排列（options.json 已照 Encar 順序）
  const have = new Set((opt && opt.standard) || []);
  for (const code of optionCodes()) if (have.has(code)) { const o = tOption(code); (by[o[0]] = by[o[0]] || []).push(o); }
  const keys = Object.keys(groups).filter(k => by[k]);
  optData = { groups: keys.map(k => ({ zh: groups[k], en: GROUP_EN[k] || '', items: by[k] })), choice: [] };
  if (!keys.length && !((opt && opt.choice) || []).length) return '';
  return `<div class="card opts"><div class="opth"><h2>車輛配備</h2><div class="cp"><button type="button" class="btn-s" data-lang="zh">複製中文</button><button type="button" class="btn-s" data-lang="en">複製英文</button></div></div>
    ${keys.map(k => `<h3>${esc(groups[k])}</h3><ul>${by[k].map(x => `<li>${esc(x[1])}</li>`).join('')}</ul>`).join('')}
    <div id="choiceBox"></div></div>`;
}
// 新車加價（萬韓元）約合台幣，取到百位
const choiceTwd = (man, rate) => (rate ? Math.round(man * 10000 / rate.usdKrw * rate.usdTwd / 100) * 100 : 0);
function choicePrice(x, rate) {
  if (!x.price) return '';
  const t = choiceTwd(x.price, rate);
  return `新車加價 ${fmt(x.price)} 萬韓元${t ? `（約 NT$ ${fmt(t)}）` : ''}`;
}
function choiceHtml(list, rate) {
  if (!list.length) return '';
  const mt = list.some(x => x.zh);
  return `<h3>原廠選配（新車時加價選購）</h3><ul class="choice">${list.map(x => `<li><b>${esc(x.zh || x.optionName)}</b>${x.zh ? `<em>${esc(x.optionName)}</em>` : ''}${x.price ? `<span>${choicePrice(x, rate)}</span>` : ''}</li>`).join('')}</ul>
    <p class="fine">${mt ? '選配名稱為自動翻譯，下方小字為 Encar 韓文原名。' : '選配名稱為 Encar 提供的韓文原名。'}</p>`;
}
function optionsText(lang, title) {
  const zh = lang === 'zh', L = [zh ? `【${title}】車輛配備` : `[${title}] Options`];
  for (const g of optData.groups) L.push((zh ? g.zh + '：' : g.en + ': ') + g.items.map(x => (zh ? x[1] : x[2] || x[1])).join(zh ? '、' : ', '));
  if (optData.choice.length) L.push((zh ? '原廠選配：' : 'Factory Options: ') + optData.choice.map(x => { const t = zh ? x.zh : x.en; return t ? (zh ? `${t}（${x.optionName}）` : `${t} (${x.optionName})`) : x.optionName; }).join(zh ? '、' : ', '));
  return L.join('\n\n');
}

// 參考比價：Encar 上同車型、同登錄年份、同燃料的車（夠多時再限縮到同等級），看這台的價格落在哪裡
async function compareCard(c, fuel, priceMan, cc, rate, mileage) {
  const regY = String(c.yearMonth || '').slice(0, 4);
  if (!regY || !c.modelName || !priceMan) return '';
  const f = { ct: c.domestic ? 'Y' : 'N', mk: c.manufacturerName, mg: c.modelGroupName, md: c.modelName, y1: regY, y2: regY, fuel: fuel ? [fuel] : [] };
  const { total, cars: all } = await searchCars(f, 'new', 0, 500); // 超過 500 台時取最新刊登的 500 台（不偏向便宜或貴的）
  let cars = all, scope = '同車型、同年份、同燃料';
  const same = all.filter(x => x.Badge && x.Badge === c.gradeName);
  if (same.length >= 5) { cars = same; scope += '、同等級'; }
  if (cars.length < 4) return '';
  const pr = cars.map(x => x.Price).sort((a, b) => a - b);
  const med = pr.length % 2 ? pr[(pr.length - 1) / 2] : (pr[pr.length / 2 - 1] + pr[pr.length / 2]) / 2;
  const min = pr[0], max = pr[pr.length - 1];
  const twd = man => { const p = calcPrice(man, cc, rate); return p ? `約 ${wan(p.price)} 萬` : `${fmt(man)} 萬韓元`; };
  const diff = (priceMan - med) / med * 100;
  const verdict = Math.abs(diff) < 3 ? '價格接近同款中位數'
    : diff < 0 ? `比同款中位數便宜約 <b class="ok">${Math.round(-diff)}%</b>` : `比同款中位數高約 <b class="hi">${Math.round(diff)}%</b>`;
  // 依「排名」放位置：最便宜在最左、中位數在正中間（對齊下方「中位數」）、最貴在最右
  const pos = v => {
    if (pr.length < 2) return 50;
    const below = pr.filter(x => x < v).length, same = pr.filter(x => x === v).length;
    return Math.max(0, Math.min(100, (below + (same ? (same - 1) / 2 : 0)) / (pr.length - 1) * 100));
  };
  const kms = cars.map(x => x.Mileage).filter(Boolean), avgKm = kms.length ? kms.reduce((a, b) => a + b, 0) / kms.length : 0;
  const cheaper = pr.filter(v => v < priceMan).length;
  const grade = cars !== all;
  const base = `Encar 上同車型、同年份、同燃料（${regY} 年登錄）共 ${fmt(total)} 台`;
  const cmpWho = total > all.length
    ? `${base}，取最新刊登的 500 台${grade ? `中同等級的 ${fmt(cars.length)} 台` : ''}比較`
    : `${base}${grade ? `，其中同等級 ${fmt(cars.length)} 台` : ''}`;
  return `<div class="card cmp"><h2>參考比價</h2>
    <p class="cmpv">${verdict}</p>
    <div class="cmpbar"><span class="med" style="left:50%"></span><span class="me${pos(priceMan) > 85 ? ' r' : pos(priceMan) < 15 ? ' l' : ''}" style="left:${pos(priceMan)}%"><i>這台</i></span></div>
    <div class="cmpk"><div><span>最低</span><b>${twd(min)}</b></div><div><span>中位數</span><b>${twd(med)}</b></div><div><span>最高</span><b>${twd(max)}</b></div></div>
    <p class="fine">${cmpWho}，這台比其中 ${fmt(cheaper)} 台貴。
    同款平均里程 ${km(avgKm)}，這台 ${km(mileage)}。車況、里程、配備不同，價格也會不同，僅供參考。</p></div>`;
}

// 相似車輛：同車型（太少就放寬到同車系），價格最接近這台的 4 台
async function similarCard(c, priceMan, rate) {
  const base = { ct: c.domestic ? 'Y' : 'N', mk: c.manufacturerName, mg: c.modelGroupName };
  let { cars } = await searchCars({ ...base, md: c.modelName }, 'new', 0, 80);
  cars = cars.filter(x => String(x.Id) !== String(id));
  if (cars.length < 4) cars = (await searchCars(base, 'new', 0, 80)).cars.filter(x => String(x.Id) !== String(id));
  if (!cars.length) return '';
  // 同一台車有時會有兩則刊登（照片相同），只留一則
  const seen = new Set(), key = x => x.Photo || (x.Photos && x.Photos[0] && x.Photos[0].location) || [x.Mileage, x.Price, x.Badge].join('|');
  const pick = cars.sort((a, b) => Math.abs(a.Price - priceMan) - Math.abs(b.Price - priceMan))
    .filter(x => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 4);
  return `<div class="card simc"><h2>相似車輛</h2><div class="sims">${pick.map(x => {
    const t = carTitle(x.Manufacturer, x.Model, x.Badge, x.BadgeDetail);
    const img = x.Photos && x.Photos[0] ? photoUrl(x.Photos[0].location) : (x.Photo ? photoUrl(x.Photo + '001.jpg') : '');
    const no = notAccepted(x.FuelType), p = !no && calcPrice(x.Price, guessCc(x.Badge, x.BadgeDetail, x.Model) || 0, rate);
    return `<a class="sim" href="detail.html?id=${encodeURIComponent(x.Id)}"><div class="sp">${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async">` : ''}<span>${esc(x.FormYear || String(x.Year).slice(0, 4))}</span></div>
      <b>${esc(t.sub || t.title)}</b><small>${esc(km(x.Mileage))}</small>
      <em>${no ? `<i class="no">${no}暫不接受代購</i>` : p ? `約 ${wan(p.price)} 萬` : `${fmt(x.Price)} 萬韓元`}</em></a>`;
  }).join('')}</div><p class="fine">同車型中價格最接近這台的車，預估車價依排氣量推估。</p></div>`;
}

(async () => {
  if (!id) return fail('找不到車輛', '網址缺少車輛編號');
  let d, rate;
  try { [, rate, d] = await Promise.all([loadI18n(), getRate(), getDetail(id)]); }
  catch (e) { return fail('這台車可能已售出或下架', 'Encar 上已找不到這台車，或網路暫時無法連線。'); }

  const c = d.category || {}, s = d.spec || {}, ad = d.advertisement || {};
  const mk = tMaker(c.manufacturerName);
  const model = tName(c.modelName);
  // 廠牌英文用我們的對照表（與列表一致，例如 Renault Korea），沒有對照才用 Encar 的英文
  const mkEn = mk.en && mk.en !== c.manufacturerName && mk.en !== 'Others' ? mk.en : (c.manufacturerEnglishName || mk.en);
  const title = (model.toLowerCase().startsWith(mkEn.toLowerCase()) ? model : `${mkEn} ${model}`).trim();
  // 等級名稱：優先用自己的翻譯（與列表一致），翻不完整（還有韓文）才用 Encar 的英文
  const pick = (ko, en) => { const t = tName(ko); return /[가-힣]/.test(t) && en ? en : t; };
  const sub = [pick(c.gradeName, c.gradeEnglishName), pick(c.gradeDetailName, c.gradeDetailEnglishName)].filter(Boolean).join(' ');
  document.title = `${title} | 佳德汽車 Encar 線上選車`;

  const fuel = s.fuelName || '';
  const no = notAccepted(fuel); // 柴油、純電、氫能：暫不接受代購
  const cc = s.displacement || 0;
  const priceMan = ad.price;
  const p = calcPrice(priceMan, cc, rate);
  const sold = ad.status && ad.status !== 'ADVERTISE';
  const region = (d.contact && d.contact.address || '').split(' ')[0];
  const color = [tSpec('color', s.customColor), tSpec('color', s.colorName)].filter(Boolean).join(' ');
  const url = carUrl(id);

  const kv = [
    ['年式', `${c.formYear || ''} 年式`], ['首次登錄', ym(c.yearMonth)], ['里程', km(s.mileage)],
    ['燃料', tSpec('fuel', fuel)], ['變速箱', tSpec('transmission', s.transmissionName)],
    ['排氣量', s.displacement ? `${fmt(s.displacement)} cc` : '—'], ['顏色', color || '—'],
    ['座位', s.seatCount ? `${s.seatCount} 人座` : '—'], ['車身類型', tSpec('category', s.bodyName) || '—'],
    ['所在地（韓國）', tSpec('region', region) || '—'],
  ];

  $('#app').innerHTML = `<div class="dt">
    <div>${gallery(d.photos, title, ad.underBodyPhotos)}</div>
    <div class="side" style="display:grid;gap:16px">
      <div class="card ttl"><button type="button" class="fav" id="favB">${HEART}</button><button type="button" class="tshr" id="share2" aria-label="分享這台車" title="分享這台車"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="mk">${esc(mk.zh)}${sold ? '　<span class="lux">此車已售出或暫停刊登</span>' : ''}</div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}${listingInfo(d.manage)}</div>
      ${no ? `<div class="card price"><h2>預估車價</h2><div class="big no">${no}暫不接受代購</div><div class="krw">韓國售價 ${fmt(priceMan)} 萬韓元</div></div>` : priceCard(p, priceMan, rate, cc)}
      ${no ? '' : '<div id="cmpBox"></div>'}
    </div>
    <div style="display:grid;gap:16px">
      <div class="card"><h2>車輛規格</h2><div class="kv">${kv.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div></div>
      <div id="inspBox"><div class="card"><h2>車況報告</h2><p class="fine" style="margin:0">讀取中…</p></div></div>
      <div id="recBox"><div class="card"><h2>保險／事故紀錄</h2><p class="fine" style="margin:0">讀取中…</p></div></div>
      ${optionsCard(d.options)}
      <div class="card src"><h2>原始車源</h2><p style="margin:0 0 6px">在 Encar 查看原始刊登頁面（韓文）：</p><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>
        <p class="fine">車輛編號 ${esc(id)}。車輛資料取自 Encar，車輛隨時可能售出。</p></div>
      <div id="simBox"></div>
    </div></div>`;
  bindGallery();

  const ob = document.querySelector('.opts .cp');
  if (ob) ob.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const m = (c.modelName || '').replace(/(\d+)세대/, 'Gen $1'); // 例：XC90 2세대 → XC90 Gen 2
    const enModel = /[가-힣]/.test(m) ? (c.modelGroupEnglishName || '') : m;
    const enTitle = [mkEn, enModel, c.gradeEnglishName, c.gradeDetailEnglishName].filter(Boolean).join(' ');
    const ok = await copyText(optionsText(b.dataset.lang, b.dataset.lang === 'zh' ? `${title} ${sub}`.trim() : enTitle));
    toast(ok ? (b.dataset.lang === 'zh' ? '已複製中文配備' : '已複製英文配備') : '無法複製，請手動選取');
  };
  const chosen = (d.options && d.options.choice) || [];
  if (chosen.length && d.vehicleId) getChoices(d.vehicleId)
    .then(async all => {
      const list = all.filter(x => chosen.includes(x.optionCd));
      const names = list.map(x => x.optionName);
      const [zhN, enN] = await Promise.all([autoTranslate(names, 'zh-TW'), autoTranslate(names, 'en')]);
      list.forEach((x, i) => { x.zh = zhN && zhN[i]; x.en = enN && enN[i]; });
      optData.choice = list; const box = $('#choiceBox'); if (box) box.innerHTML = choiceHtml(list, rate);
    })
    .catch(() => { const box = $('#choiceBox'); if (box) box.innerHTML = `<p class="fine">另有 ${chosen.length} 項原廠選配，請參考 Encar 原始頁面。</p>`; });
  // 分享：手機用系統分享選單（可直接選 LINE）；電腦顯示 QR Code 讓手機掃描
  $('#share').onclick = async () => {
    const link = location.href, name = `${title}${sub ? ' ' + sub : ''}`;
    if (isTouch && navigator.share) {
      try { await navigator.share({ title: name, text: `${name}｜佳德汽車 Encar 線上選車`, url: link }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    if (isTouch) { toast((await copyText(link)) ? '已複製這台車的連結' : '無法複製，請手動複製網址'); return; }
    openQr(link);
  };
  // 收藏
  const fb = $('#favB'), firstPhoto = (d.photos || []).filter(x => x.type !== 'THUMBNAIL').sort((a, b) => a.code.localeCompare(b.code))[0];
  const snap = { id, t: title, s: sub || mk.zh, img: firstPhoto ? photoUrl(firstPhoto.path) : '', y: c.formYear || '', km: s.mileage, price: priceMan, fuel, cc };
  setHeart(fb, isFav(id));
  if (isFav(id)) updateFav(id, { price: priceMan, km: s.mileage, cc }); // 價格有變就更新
  fb.onclick = () => {
    const on = toggleFav(snap);
    if (on === null) return toast(`最多收藏 ${FAV_MAX} 台，請先到收藏頁移除一些`);
    setHeart(fb, on); toast(on ? '已加入收藏' : '已取消收藏');
  };
  if (!no && $('#cmpBox')) compareCard(c, fuel, priceMan, cc, rate, s.mileage).then(h => { $('#cmpBox').outerHTML = h || ''; }).catch(() => { $('#cmpBox').remove(); });

  $('#share2').onclick = $('#share').onclick; // 標題旁的圓形分享按鈕，與底條分享相同
  similarCard(c, priceMan, rate).then(h => { $('#simBox').outerHTML = h || ''; }).catch(() => { $('#simBox')?.remove(); });
  $('#encLink').href = url;
  $('#askLine').onclick = () => askLine(lineText({ title, sub, year: `${c.formYear || ''} 年式`, mileage: km(s.mileage), price: p && !no ? wan(p.price) : '', url }));
  $('#bar').hidden = false;

  // 車況報告（性能檢查紀錄），與保險紀錄同時讀取
  (async () => {
    const insp = d.vehicleId ? await getInspection(d.vehicleId) : null;
    const ko = insp && insp.master && insp.master.detail && insp.master.detail.comments;
    const zh = ko ? await autoTranslate([ko.replace(/\s*\n\s*/g, ' ')], 'zh-TW') : null;
    $('#inspBox').innerHTML = await inspectionCard(insp, zh && zh[0]);
  })().catch(() => { $('#inspBox').innerHTML = '<div class="card"><h2>車況報告</h2><p class="fine" style="margin:0">暫時無法讀取，請稍後重新整理。</p></div>'; });
  const rec = d.vehicleId && d.vehicleNo ? await getRecord(d.vehicleId, d.vehicleNo) : null;
  $('#recBox').innerHTML = recordCard(rec, rate, d.condition && d.condition.seizing);
})();
