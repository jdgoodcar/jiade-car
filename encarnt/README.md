# encarnt — Encar 線上選車

佳德汽車網站的「韓國 Encar 中古車線上選車」功能。車輛資料由瀏覽器即時向 Encar 讀取，網站本身不存車輛資料。

## 檔案說明

| 檔案 | 用途 |
|---|---|
| `index.html` | 選車列表頁（篩選、排序、無限捲動） |
| `detail.html` | 單台車詳細頁（`detail.html?id=Encar 車輛編號`） |
| `assets/css/encarnt.css` | 全部樣式 |
| `assets/js/list.js` | 列表頁程式 |
| `assets/js/detail.js` | 詳細頁程式 |
| `assets/js/lib/encar.js` | 讀取 Encar 資料（Encar 改版只改這裡） |
| `assets/js/lib/pricing.js` | 車價公式（與 `../car.html` 相同，改公式時兩邊一起改） |
| `assets/js/lib/rate.js` | 即時匯率 |
| `assets/js/lib/i18n.js` | 翻譯工具 |
| `assets/js/lib/ui.js` | 共用小工具（LINE 詢問、格式化） |
| `assets/data/i18n/makers.json` | 廠牌中文名稱 |
| `assets/data/i18n/models.json` | 車系英文名稱（由工具自動產生） |
| `assets/data/i18n/terms.json` | 車型／等級詞彙 |
| `assets/data/i18n/specs.json` | 燃料、變速箱、車身、顏色、地區 |
| `assets/data/i18n/options.json` | 配備 |
| `assets/data/i18n/inspection.json` | 車況報告（性能檢查）用詞 |
| `assets/data/search.json` | 搜尋框索引（由 tools/build-search.mjs 產生） |

## 修改翻譯
直接改 `assets/data/i18n/` 裡的 JSON，再把 `assets/js/lib/i18n.js` 裡的 `VERSION` 加 1（讓手機重新讀取）。

## 定期檢查翻譯（約每 1–3 個月）
在專案資料夾執行：`node tools/fetch-encar-names.mjs`、`node tools/collect-names.mjs`（約 15 分鐘）、`node tools/check-i18n.mjs`，把列出的新詞補進 terms.json；再執行 `node tools/build-models.mjs`、`node tools/build-search.mjs` 更新車系翻譯與搜尋框，最後把 i18n.js 的 VERSION 加 1。

## 預覽期間
兩個頁面都有 `<meta name="robots" content="noindex">`，正式上線時移除，並在首頁加入口連結。

## 收藏、參考比價、分享預覽卡（2026-11）
- `fav.html` + `assets/js/fav.js`：我的收藏頁；`assets/js/lib/fav.js`：收藏資料（存在瀏覽器 localStorage `encarnt_fav`，最多 50 台）。收藏頁打開時會向 Encar 確認是否已售出、價格有沒有變。
- 詳細頁「參考比價」：同車型、同登錄年份、同燃料（夠 5 台再限縮同等級），顯示最低／中位數／最高與這台的位置。
- 分享預覽卡：`index.html`、`detail.html`、`fav.html` 的 `og:` 標籤，圖片 `assets/og.jpg`（1200×630）。
  **換網域時**：把這三個檔案裡的 `https://jdgoodcar.github.io/jiade-car/encarnt/` 換成新網址。LINE 會快取舊預覽，換完可能要過幾天才更新。
- Encar 沒有「年份：舊 → 新」排序（只有新 → 舊），所以排序選單沒有這項。
- 車輛比較：`compare.html?ids=編號,編號`（2～4 台）+ `assets/js/compare.js`。在收藏頁勾選「加入比較」後進入；左右並排價格、基本資料、車況、配備（預設只列出不同的配備）。
