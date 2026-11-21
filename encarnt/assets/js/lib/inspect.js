// 車況報告：韓國「中古車性能・狀態檢查紀錄」（Encar 提供），翻成中文
import { API, PHOTO } from './encar.js?v=71';
import { esc, fmt } from './ui.js?v=71';

let dict = null;
async function loadDict() {
  if (!dict) dict = fetch(new URL('../../data/i18n/inspection.json?v=1', import.meta.url)).then(r => r.json());
  return dict;
}

/** 讀取性能檢查紀錄：沒有紀錄時回傳 null */
export async function getInspection(vehicleId) {
  try {
    const r = await fetch(`${API}/v1/readside/inspection/vehicle/${vehicleId}`);
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.master ? j : null;
  } catch (e) { return null; }
}

// Encar 原始性能檢查紀錄頁（韓文）
const origLink = j => (j.vehicleId ? `<a class="orig" href="${esc(`https://www.encar.com/md/sl/mdsl_regcar.do?method=inspectionViewNew&carid=${j.vehicleId}`)}" target="_blank" rel="noopener">查看 Encar 原始檢查紀錄（韓文）↗</a>` : '');
const ymd = s => (s && s.length >= 8 ? `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6, 8)}` : '');

function partName(T, ko) {
  // 同一個零件韓文有不同拼法（휀더／펜다…），先統一
  let s = (ko || '').replace(/휀더|휀다|펜다/g, '펜더');
  for (const [a, b] of T.partWords) s = s.split(a).join(b);
  s = s.replace(/\s+/g, ' ').replace(/ ?（/g, '（').trim();
  return /[가-힣]/.test(s) ? `${s}（${ko}）` : s;
}
const word = (T, ko) => (T.words[ko] || ko);

/** 機械檢查：攤平成 [分類, 項目, 狀態碼] */
function flatInners(T, inners) {
  const out = [];
  for (const g of inners || []) {
    const gName = T.inner[g.type.code] || g.type.title;
    const nm = n => T.inner[n.type.code] || n.type.title;
    // 沒有 statusType 的項目＝這台車不適用（例如自排車的離合器），略過
    for (const c of g.children || []) {
      if (c.statusType) out.push({ group: gName, name: nm(c), code: c.statusType.code });
      for (const gc of c.children || []) if (gc.statusType) out.push({ group: gName, name: `${nm(c)}・${nm(gc)}`, code: gc.statusType.code });
    }
  }
  return out;
}

/** 產生車況報告卡片的 HTML；comment 為已翻譯的檢查員備註（可為空） */
export async function inspectionCard(j, comment) {
  const T = await loadDict();
  if (!j) return `<div class="card insp"><h2>車況報告</h2><p class="fine" style="margin:0">這台車沒有提供韓國性能檢查紀錄，可透過 LINE 詢問我們協助查詢。</p></div>`;
  const m = j.master || {}, d = m.detail || {};

  // 部分車輛的檢查紀錄只有掃描圖檔（韓文），只能顯示重點判定和原始圖片
  if (!m.detail && !(j.inners || []).length) {
    const imgs = (j.images || []).filter(x => x.path);
    return `<div class="card insp"><h2>車況報告</h2>
      <div class="rec"><div class="${m.accdient ? 'warn' : 'ok'}"><span>事故車判定</span><b>${m.accdient ? '事故車' : '非事故車'}</b></div>
      <div class="${m.simpleRepair ? 'warn' : 'ok'}"><span>單純修理（外板）</span><b>${m.simpleRepair ? '有' : '無'}</b></div></div>
      ${imgs.length ? `<h3>原始檢查紀錄（韓文掃描檔）</h3><div class="scans">${imgs.map((x, i) => `<a href="${esc(PHOTO + x.path)}" target="_blank" rel="noopener"><img src="${esc(PHOTO + x.path)}" alt="檢查紀錄第 ${i + 1} 頁" loading="lazy"><span>第 ${i + 1} 頁</span></a>`).join('')}</div>` : ''}
      <p class="fine">這台車的檢查紀錄是掃描圖檔，無法自動翻譯細項，點圖片可放大查看；需要中文說明可透過 LINE 詢問我們。</p>${origLink(j)}</div>`;
  }

  // ① 重點判定
  const yes = (v, bad, good = '無') => ({ v: v ? bad : good, cls: v ? 'warn' : 'ok' });
  const usage = (d.usageChangeTypes || []).map(x => word(T, x.title));
  const serious = (d.seriousTypes || []).map(x => word(T, x.title));
  const recall = d.recall ? ((d.recallFullFillTypes || []).map(x => word(T, x.title)).join('、') || '有') : '無';
  const sum = [
    ['事故車判定', yes(m.accdient, '事故車', '非事故車')],
    ['單純修理（外板）', yes(m.simpleRepair, '有')],
    ['泡水', yes(d.waterlog, '有')],
    ['特殊紀錄（泡水／火災）', serious.length ? { v: serious.join('、'), cls: 'warn' } : { v: '無', cls: 'ok' }],
    ['用途變更', usage.length ? { v: usage.join('、'), cls: 'warn' } : { v: '無', cls: 'ok' }],
    ['改裝', d.tuning ? { v: (d.tuningStateTypes || []).map(x => word(T, x.title)).join('、') || '有', cls: 'warn' } : { v: '無', cls: 'ok' }],
    ['召回', { v: recall, cls: d.recall && /未/.test(recall) ? 'warn' : 'ok' }],
    ['檢查時里程', { v: d.mileage ? `${fmt(d.mileage)} 公里` : '—', cls: '' }],
  ];

  // ② 外板／骨架
  const outers = (j.outers || []).map(o => {
    const rank = (o.attributes || []).find(a => T.rank[a]);
    const frame = /RANK_[ABC]/.test(rank || '');
    return { name: partName(T, o.type.title), st: (o.statusTypes || []).map(s => T.outerStatus[s.code] || s.title).join('、'), rank: rank ? T.rank[rank] : '', frame };
  });
  const frameN = outers.filter(o => o.frame).length;
  const outerHtml = outers.length
    ? `<ul class="parts">${outers.map(o => `<li class="${o.frame ? 'frame' : ''}"><b>${esc(o.name)}</b><span>${esc(o.st)}</span>${o.rank ? `<em>${esc(o.rank)}</em>` : ''}</li>`).join('')}</ul>
       <p class="fine">${frameN ? `<b class="bad">有 ${frameN} 處骨架部位修理過</b>，屬於結構性修復，請特別留意。` : '修理部位都是外板，沒有骨架（車體結構）修理。'}外板 1 級為螺絲固定的鈑件（如車門、引擎蓋），2 級為焊接的鈑件（如後葉子板、車頂）。</p>`
    : '<p class="okline">✓ 外板與骨架都沒有交換、板金或焊接紀錄</p>';

  // ③ 機械檢查
  const items = flatInners(T, j.inners);
  const bad = items.filter(x => T.statusBad.includes(x.code)), warn = items.filter(x => T.statusWarn.includes(x.code));
  const st = c => T.status[c] || c;
  const cls = c => (T.statusBad.includes(c) ? 'bad' : T.statusWarn.includes(c) ? 'warnc' : 'okc');
  const groups = [...new Set(items.map(x => x.group))];
  const mechHtml = !items.length ? '<p class="fine" style="margin:0">沒有機械檢查資料</p>' : `<p class="${bad.length ? 'badline' : warn.length ? 'warnline' : 'okline'}">${bad.length ? `⚠ ${items.length} 項中有 ${bad.length} 項異常` : warn.length ? `${items.length} 項中有 ${warn.length} 項輕微狀況，其餘良好` : `✓ ${items.length} 項檢查全部正常`}</p>
    ${bad.concat(warn).length ? `<ul class="mech">${bad.concat(warn).map(x => `<li><span>${esc(x.group)}・${esc(x.name)}</span><b class="${cls(x.code)}">${esc(st(x.code))}</b></li>`).join('')}</ul>` : ''}
    <details><summary>查看全部檢查項目</summary>${groups.map(g => `<h4>${esc(g)}</h4><ul class="mech">${items.filter(x => x.group === g).map(x => `<li><span>${esc(x.name)}</span><b class="${cls(x.code)}">${esc(st(x.code))}</b></li>`).join('')}</ul>`).join('')}</details>`;

  // ④ 需要修理（檢查時標記）
  const fix = [];
  for (const g of j.etcs || []) {
    if (g.type.title !== '수리필요') continue;
    for (const c of g.children || []) {
      if (c.exists !== true && !(c.statusTypes || []).length) continue;
      const pos = (c.statusTypes || []).map(s => T.etc.pos[s.code] || s.title).join('、');
      fix.push((T.etc[c.type.code] || c.type.title) + (pos ? `（${pos}）` : ''));
    }
  }

  return `<div class="card insp"><h2>車況報告</h2>
    <p class="fine" style="margin:0 0 10px">韓國中古車性能・狀態檢查紀錄${d.issueDate ? `，檢查日期 ${ymd(d.issueDate)}` : ''}${d.validityEndDate ? `（有效至 ${ymd(d.validityEndDate)}）` : ''}</p>
    <div class="rec">${sum.map(([k, x]) => `<div class="${x.cls}"><span>${k}</span><b>${esc(x.v)}</b></div>`).join('')}</div>
    <h3>外板／骨架</h3>${outerHtml}
    <h3>機械檢查</h3>${mechHtml}
    ${fix.length ? `<h3>檢查時建議修理</h3><p class="warnline">${esc(fix.join('、'))}</p>` : ''}
    ${comment ? `<h3>檢查員備註（自動翻譯）</h3><p class="cmt">${esc(comment)}</p>` : ''}
    <p class="fine">資料來源：韓國中古車性能・狀態檢查紀錄（經 Encar 提供），實際以原始紀錄為準。</p>${origLink(j)}</div>`;
}
