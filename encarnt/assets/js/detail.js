// 車輛詳細頁：detail.html?id=Encar 車輛編號
import { loadI18n, tMaker, tName, tSpec, tOption, optionGroups, optionCodes, autoTranslate } from './lib/i18n.js';
import { getDetail, getRecord, getChoices, photoUrl, carUrl, notAccepted } from './lib/encar.js';
import { getRate } from './lib/rate.js';
import { calcPrice, RULES } from './lib/pricing.js';
import { getInspection, inspectionCard } from './lib/inspect.js';
import { $, fmt, wan, esc, ym, km, askLine, lineText, copyText, toast } from './lib/ui.js';

const id = new URLSearchParams(location.search).get('id');

$('#back').onclick = () => {
  if (document.referrer && new URL(document.referrer).pathname.replace(/index\.html$/, '') === location.pathname.replace(/detail\.html$/, '')) history.back();
  else location.href = './';
};

function fail(title, msg) {
  $('#app').innerHTML = `<div class="err"><b>${esc(title)}</b>${esc(msg)}<br><br><a class="btn-m" href="./" style="text-decoration:none;display:inline-block">回到車輛列表</a></div>`;
}

// 照片：依 Encar 的編號排序（001 正面…）。THUMBNAIL 是 Encar 給列表用的重複縮圖，略過；同一張檔案只放一次
// 車底照片（Encar 診斷中心拍攝，放在最後；原檔很大，用 Encar 的縮小版）
function gallery(photos, alt, under) {
  const list = [...new Set((photos || []).filter(p => p.type !== 'THUMBNAIL').sort((a, b) => a.code.localeCompare(b.code)).map(p => photoUrl(p.path))
    .concat((under || []).filter(p => p.photoPath).map(p => 'https://imgcar.encar.com' + p.photoPath + '?d=1080x608')))];
  if (!list.length) return '<div class="gal"><div style="aspect-ratio:4/3;display:grid;place-items:center;color:#9aa2b3">沒有照片</div></div>';
  return `<div class="gal"><div class="track" id="track">${list.map((u, i) =>
    `<img src="${esc(u)}" alt="${esc(alt)} 照片 ${i + 1}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async" width="640" height="480">`).join('')}</div>
    <button class="nav prev" type="button" aria-label="上一張">‹</button><button class="nav next" type="button" aria-label="下一張">›</button>
    <span class="cnt" id="cnt">1 / ${list.length}</span></div>
    <div class="thumbs" id="thumbs">${list.map((u, i) => `<img src="${esc(u)}" alt="" loading="lazy" decoding="async" data-i="${i}" class="${i ? '' : 'on'}">`).join('')}</div>`;
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

function recordCard(rec, rate) {
  if (!rec || !rec.openData) return `<div class="card"><h2>保險／事故紀錄</h2><p class="fine" style="margin:0">賣家未公開此車的保險紀錄，可透過 LINE 請我們協助查詢。</p></div>`;
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
  </div>
  ${gap.length ? `<p class="fine"><b>保險未投保期間：</b>${gap.map(esc).join('、')}（此期間若有事故不會出現在紀錄中）</p>` : ''}
  <p class="fine">資料來源：韓國保險開發院（經 Encar 公開），僅含有申請保險理賠的紀錄。</p></div>`;
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

(async () => {
  if (!id) return fail('找不到車輛', '網址缺少車輛編號');
  let d, rate;
  try { [, rate, d] = await Promise.all([loadI18n(), getRate(), getDetail(id)]); }
  catch (e) { return fail('這台車可能已售出或下架', 'Encar 上已找不到這台車，或網路暫時無法連線。'); }

  const c = d.category || {}, s = d.spec || {}, ad = d.advertisement || {};
  const mk = tMaker(c.manufacturerName);
  const model = tName(c.modelName);
  const title = `${c.manufacturerEnglishName || mk.en} ${model}`.trim();
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
      <div class="card ttl"><div class="mk">${esc(mk.zh)}${sold ? '　<span class="lux">此車已售出或暫停刊登</span>' : ''}</div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
      ${no ? `<div class="card price"><h2>預估車價</h2><div class="big no">${no}暫不接受代購</div><div class="krw">韓國售價 ${fmt(priceMan)} 萬韓元</div></div>` : priceCard(p, priceMan, rate, cc)}
    </div>
    <div style="display:grid;gap:16px">
      <div class="card"><h2>車輛規格</h2><div class="kv">${kv.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div></div>
      <div id="inspBox"><div class="card"><h2>車況報告</h2><p class="fine" style="margin:0">讀取中…</p></div></div>
      <div id="recBox"><div class="card"><h2>保險／事故紀錄</h2><p class="fine" style="margin:0">讀取中…</p></div></div>
      ${optionsCard(d.options)}
      <div class="card src"><h2>原始車源</h2><p style="margin:0 0 6px">在 Encar 查看原始刊登頁面（韓文）：</p><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>
        <p class="fine">車輛編號 ${esc(id)}。車輛資料即時取自 Encar，車輛隨時可能售出。</p></div>
    </div></div>`;
  bindGallery();

  const ob = document.querySelector('.opts .cp');
  if (ob) ob.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const m = (c.modelName || '').replace(/(\d+)세대/, 'Gen $1'); // 例：XC90 2세대 → XC90 Gen 2
    const enModel = /[가-힣]/.test(m) ? (c.modelGroupEnglishName || '') : m;
    const enTitle = [c.manufacturerEnglishName || mk.en, enModel, c.gradeEnglishName, c.gradeDetailEnglishName].filter(Boolean).join(' ');
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
  $('#recBox').innerHTML = recordCard(rec, rate);
})();
