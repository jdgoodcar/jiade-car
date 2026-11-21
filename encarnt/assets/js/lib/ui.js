// 共用的小工具：數字格式、LINE 詢問、提示訊息、車輛標題

import { tMaker, tName } from './i18n.js?v=79';

// /R/ 格式的 LINE 連結在手機上會直接開啟 LINE App
export const LINE_URL = 'https://line.me/R/ti/p/Pnn6ZRFaYI';
// 手機（觸控螢幕）在同一頁開啟 LINE 連結，App 比較能直接跳出；電腦開新分頁
export const isTouch = matchMedia('(pointer: coarse)').matches;
export const PHONE = '08-765-6777';

export const $ = (s, el = document) => el.querySelector(s);
export const fmt = n => Math.round(n).toLocaleString('zh-TW');
export const wan = n => (n / 10000).toLocaleString('zh-TW', { maximumFractionDigits: 1 });
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 2021 年 3 月 → 「2021/03」 */
export const ym = v => { const s = String(Math.round(v || 0)); return s.length >= 6 ? `${s.slice(0, 4)}/${s.slice(4, 6)}` : s; };
// 里程 0：賣家沒填（新車也至少有幾公里）
export const km = v => (!v ? '里程未填' : v >= 10000 ? wan(v) + ' 萬公里' : fmt(v) + ' 公里');

// 照片載入失敗（Encar 上的照片檔不存在）：不顯示破圖，改成「暫無照片」
addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || img.dataset.err) return;
  img.dataset.err = '1';
  const box = img.closest('.ph, .cimg, .sp, .gal');
  if (box) box.classList.add('noimg');
  img.style.visibility = 'hidden';
}, true);

/** 車輛標題：{ title: 'Hyundai The New Grandeur (GN7)', sub: '汽油 2.5 Premium' } */
export function carTitle(maker, model, badge, detail) {
  const mk = tMaker(maker);
  const md = tName(model);
  const title = (md.toLowerCase().startsWith(mk.en.toLowerCase()) ? md : `${mk.en} ${md}`).trim();
  const sub = [tName(badge), tName(detail)].filter(Boolean).join(' ').trim();
  return { title, sub, makerZh: mk.zh };
}

let toastTimer;
export function toast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { /* 無法複製 */ }
    ta.remove(); return ok;
  }
}

/** LINE 詢問：複製車輛資訊 → 打開 LINE */
// 先在點擊當下打開 LINE（延遲開啟會被 iPhone 等瀏覽器當成彈出視窗擋掉），同時複製車輛資訊
export function askLine(text) {
  const copying = copyText(text);
  if (isTouch) location.href = LINE_URL;
  else if (!window.open(LINE_URL, '_blank', 'noopener')) location.href = LINE_URL;
  copying.then(ok => toast(ok ? '已複製車輛資訊，請在 LINE 對話框貼上' : '請直接在 LINE 告訴我們車輛網址'));
}

export function lineText({ title, sub, year, mileage, price, url }) {
  return `您好，我想詢問這台韓國 Encar 車輛：\n${title}${sub ? '\n' + sub : ''}\n年份：${year}　里程：${mileage}\n` +
    (price ? `預估車價：約 ${price} 萬元（未含手續費）\n` : '') +
    `車輛網址：${url}\n\n佳德汽車 · 一條龍完整服務 ${PHONE}`;
}
