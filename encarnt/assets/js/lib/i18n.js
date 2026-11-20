// 翻譯工具：把 Encar 的韓文（廠牌、車型、等級、規格、配備）轉成中文／台灣慣用英文。
// 對照表放在 assets/data/i18n/*.json，要修正翻譯只改 JSON，不用動程式。

const DATA = new URL('../../data/i18n/', import.meta.url);
const VERSION = '2'; // 對照表有更新時改這個數字，手機上的暫存就會重抓
const CACHE_KEY = 'encarnt_i18n_v' + VERSION;

let T = null;      // { makers, models, specs, options, terms }
let dict = null;   // 合併後的詞彙表（車系＋詞彙），依長度由長到短
let exact = null;  // 只能整個詞完全相同時才翻的短詞（避免拆錯字）

async function loadJson(name) {
  const r = await fetch(new URL(name + '.json?v=' + VERSION, DATA));
  if (!r.ok) throw new Error('翻譯表讀取失敗：' + name);
  return r.json();
}

export async function loadI18n() {
  if (T) return T;
  try { const c = JSON.parse(sessionStorage.getItem(CACHE_KEY)); if (c && c.makers) T = c; } catch (e) { /* 沒有暫存 */ }
  if (!T) {
    const [makers, models, specs, options, terms] = await Promise.all(
      ['makers', 'models', 'specs', 'options', 'terms'].map(loadJson));
    T = { makers, models, specs, options, terms };
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(T)); } catch (e) { /* 空間不足就算了 */ }
  }
  const all = { ...T.models, ...T.terms };
  delete all._說明;
  exact = new Map(); const sub = [];
  for (const [ko, v] of Object.entries(all)) {
    // 一個字的韓文（例如車系「씰」）只在整個詞相同時才翻，避免把別的詞拆錯
    exact.set(ko, v);
    if (ko.replace(/[^가-힣]/g, '').length > 1) sub.push([ko, v]);
  }
  dict = sub.sort((a, b) => b[0].length - a[0].length);
  return T;
}

const HANGUL = /[가-힣]/;

// 數字＋韓文單位：9인승 → 9人座、4도어 → 4門、3세대 → 第3代
function numberRules(s) {
  return s
    .replace(/(\d+)\s*인승/g, '$1人座')
    .replace(/(\d+)\s*도어/g, '$1門')
    .replace(/(\d+)\s*세대/g, '第$1代')
    .replace(/(\d+)\s*주년/g, '$1週年')
    .replace(/(\d+)\s*마력/g, '$1匹')
    .replace(/(\d+)\s*톤/g, '$1噸')
    .replace(/(\d+)\s*인치/g, '$1吋')
    .replace(/(\d+)\s*륜/g, '$1輪');
}

// 一段韓文：先找完全相同的，再由左到右找最長的詞
function translateWord(w) {
  if (!HANGUL.test(w)) return w;
  if (exact.has(w)) return exact.get(w);
  let out = [], i = 0, rest = '';
  while (i < w.length) {
    let hit = null;
    if (HANGUL.test(w[i])) for (const [ko, v] of dict) { if (w.startsWith(ko, i)) { hit = [ko, v]; break; } }
    if (hit) { if (rest) { out.push(rest); rest = ''; } out.push(hit[1]); i += hit[0].length; }
    else { rest += w[i]; i++; }
  }
  if (rest) out.push(rest);
  return out.filter(Boolean).join(' ');
}

/** 車型、等級名稱（韓文 → 台灣慣用英文／中文） */
export function tName(s) {
  if (!s) return '';
  let t = numberRules(String(s).trim());
  // 多字片語（例如「더 뉴」「세부등급 없음」）先整段處理
  for (const [ko, v] of dict) if (ko.includes(' ') && t.includes(ko)) t = t.split(ko).join(v);
  return t.split(/(\s+|[()\/,+])/).map(translateWord).join('')
    .replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
}

/** 廠牌：{ zh, en }，找不到就用原文 */
export function tMaker(ko) {
  const m = T && T.makers[ko];
  return m || { zh: ko, en: ko };
}

/** 規格欄位：fuel / transmission / category / color / region */
export function tSpec(kind, ko) {
  if (!ko) return '';
  const tbl = T && T.specs[kind];
  if (tbl && tbl[ko]) return tbl[ko];
  if (kind === 'color') return ko.split(/\s+/).map(x => (tbl && tbl[x]) || x).join(' ');
  return ko;
}

/** 配備代碼 → [分組, 中文名稱] */
export function tOption(code) { return (T && T.options[code]) || null; }
export function optionGroups() { return (T && T.specs.optionGroups) || {}; }
export function specTable(kind) { return (T && T.specs[kind]) || {}; }
export function makersTable() { return (T && T.makers) || {}; }
