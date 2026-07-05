---
name: quote-contract-pdf
description: 產生繁體中文報價單／合約／費用方案 PDF（reportlab + CJK 字型、表格、簽署欄、公司印章）。當使用者要製作中文報價單、合約、業務合作方案等正式 PDF 文件時使用。
---

# 繁體中文報價單／合約 PDF 產生

一套用 Python 產生繁中正式商務 PDF（報價、合約、費用方案）的流程。本專案已有可直接沿用/仿作的範例腳本。

## 何時使用
使用者要做**報價單、合約、費用方案、業務合作方案**等繁體中文正式 PDF 時。

## 工具與範例
- **reportlab** + **STSong-Light** CID 字型（內建繁中，免外部字型檔）：
  ```python
  from reportlab.pdfbase import pdfmetrics
  from reportlab.pdfbase.cidfonts import UnicodeCIDFont
  pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
  ```
- 範例腳本（`scripts/`），都用同一個 `Doc` helper class（`title / subtitle / section 藍色標題條 / trow 表格列 / bullet / note / 簽署區`，在 canvas 上逐段畫、`self.y` 往下遞減）：
  - `gen_quote.py` — 系統開發完整報價單（含「為何導入」比較表）
  - `gen_server_quote.py` — 單頁成本／營運費報價
  - `gen_partnership_plan.py` — 對外合約（含簽署欄、統編/地址、公司印章）

## ⚠️ 字型缺字（最容易踩的雷）
STSong-Light CID 字型**缺某些字元，會顯示成 □（豆腐）**，務必避開：
- 減號 `−`(U+2212) → 改用 ASCII `-`
- 中間點 `·`(U+00B7) → 改用全形空格 `　` 或 `|`
- **可正常顯示**：`- + $ % ( ) / . , :`、全形（）、，：？、破折號 `—`(U+2014)
- 改完 grep 自檢：`grep -c $'−\|·' <file>` 應為 0。

## 印章（蓋章）
- 透明背景 PNG → `canvas.drawImage(path, x, y, w, h, mask='auto', preserveAspectRatio=True)`；alpha 會正確合成、不會白框。
- 先用 PIL 確認白底已透明（角落像素 alpha=0）；若是不透明白底要先去白底。
- 蓋在「負責人簽章」旁：公司大章 + 負責人小章並排。
- **私人法定印章不進 git**：用絕對路徑或環境變數引用，檔案不存在就跳過（留白簽章欄）。

## 輸出與版控
- 輸出路徑相對 repo：`os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'screenshots', '檔名.pdf')`，並 `os.makedirs(..., exist_ok=True)`。
- `screenshots/` 已 gitignore：**PDF 是產物、不進 git**；**只 commit 產生器腳本**。印章/名片等私人檔一律不進 git。

## 產生流程（重要：視覺驗證迴圈）
1. 改腳本 → `python3 scripts/gen_xxx.py`
2. **用 Read 工具開 PDF（帶 `pages` 參數）→ 會 render 成圖**，肉眼檢查版面／缺字／溢出。
3. 有問題就調整 → 重生 → 再看，直到正確。
4. `SendUserFile` 把 PDF 寄給使用者。
5. commit 產生器腳本。

## 商務文件要點
- **不要灌水數字**（可信度）：用真實成本。曾把紙券印刷估 8–12 萬、實際才 1 萬，客戶一眼看穿——改成質性描述、不提金額。
- **區分版本**：內部版（含成本/毛利）vs 對外版（只列定價，不露毛利/分潤）。
- **稅**：稅內含 vs **稅外加**（外加＝價格未稅，開發票另加 5% 營業稅）。
- **簽署欄**：公司名＋統編＋地址＋負責人＋簽章線＋日期；**統編必須對到法定公司名**（開票一致）。
- **法定名稱有疑義先問**：合約難以反悔；客戶方公司名／統編不確定時，先跟使用者確認再定稿（例：場地名 ≠ 開票的有限公司名）。
- 日期統一格式（如西元 YYYY 年 M 月 D 日）。
