---
name: golf-linebot-dev
description: 在本專案（linebot-booking-golf：Express + React/Vite + Supabase + Render/Vercel + LINE OA/LIFF）安全地開發、測試、上線功能的流程與慣例。當要新增/修改後端端點、前端頁面、票券/核銷/LINE 相關功能，或要在本機驗證、開 PR、部署時使用。
---

# 大衛營高爾夫 LINE Bot 開發流程

Express 後端（`index.js` + `services/`）＋ React/Vite 前端（`client/`）＋ Supabase（PostgREST）＋ Render(後端,正式,手動部署)/Vercel(前端,自動)。`.env` 連的是**正式 Supabase**——本機測會動到正式資料，務必用測試帳號 + 跑完清除。

## 開發流程（每個功能）
1. **先開分支**：`git checkout -b feat/xxx`。**絕不直接 commit/push main**（hotfix 也要走 PR + branch）。曾漏建分支直接進 main 又被 force-push 權限擋下，很難善後。
2. **改後端 + 前端**：端點加在 `index.js`，商業邏輯放 `services/*.js`。
3. **驗證**（見下方「測試」）。
4. `node -c index.js`（後端語法）＋ `cd client && npx vite build`（前端）。
5. **commit**（conventional：feat/fix/refactor…，全域已關 Co-Author 署名）→ `gh pr create` → 合併用 **git CLI**（`git checkout main && git merge --no-ff <branch>`，`gh pr merge` 常有 token 問題）→ `git push origin main`。
6. **部署**：Render = **手動**（正式環境，Manual Deploy latest commit）；Vercel = merge main 後**自動**。

## 測試（對正式 DB，安全做法）
- **後端邏輯**：直接 `node -e` require service/建立 supabase client 測；寫入流程用**測試帳號**（如 `方乃正 / 1111111111`、`line_user_id=test_user_001`），**跑完刪掉**（voucher_logs → vouchers → users 順序；設定類還原原值）。
- **端點**：本機 `PORT=3000 node index.js &`（背景），`curl` 打。重啟前先清殘留：`lsof -ti tcp:3000 | xargs kill -9`。
- **前端 UI**：本機起全棧 → `PORT=3000 node index.js` + `cd client && VITE_API_URL=http://localhost:3000 npx vite --port 5173`，用 **Playwright**（`import { chromium } from '<repo>/node_modules/playwright/index.mjs'`，非 MCP——MCP 要瀏覽器擴充、headless 不能用；首次 `npx playwright install chromium`）。
  - **後台免登入**：`AuthService.issueTokenForUsername('admin')` 產 JWT → `page.evaluate` 注入 `sessionStorage`（admin_jwt/admin_permissions/admin_info…）→ goto `/admin`。
  - **會員專區**：DEV 模式的 `ProtectedRoute` 會強制 mock `test_user_001`；要測就建一個 `line_user_id=test_user_001` 的測試會員（帶券/期限）再測、測完刪。

## 資料/Schema 慣例
- **盡量不動 schema**：優先 `system_settings`（key-value，jsonb `value`）存設定（發券設定、轉贈開關、OA 功能權限…）。
- **真的要加欄位**：寫 `scripts/xxx.sql`（`ALTER TABLE … ADD COLUMN IF NOT EXISTS`）給使用者到 Supabase SQL Editor 跑。**一定要在後端部署前先跑**，否則新程式寫入不存在的欄位會 500。（supabase-js 無法跑 DDL。）
- **PostgREST 單次上限 1000 筆**：要全量就用 `.range()` 分頁（`fetchAllRows` 模式），否則報表/對帳默默漏算。

## 權限
- 角色權限存 `roles.permissions`（陣列）；`requireAuth('key')` 擋端點；**權限存在登入 JWT 裡 → 改角色後要重新登入才生效**。
- 新增「頁面 tab」權限要**同步兩處** ALL_TABS：`Admin.jsx`（導覽）＋ `RolePermissionManager.jsx`（權限矩陣）。但**只是能力、非頁面**的權限（如 `redeem_green_fee`）**只加矩陣、別加導覽**（否則出現空白分頁）。

## LINE OA / LIFF（員工核銷站範例）
- LIFF 現在**只能建在 LINE Login channel**（不能在 Messaging API channel）。ID token 驗證的 `client_id` = **LINE Login channel ID**（= LIFF ID 前綴）。
- **驗 ID token 一定在後端**：`POST https://api.line.me/oauth2/v2.1/verify`（`id_token` + `client_id`），驗 `aud`、取 `sub`=line_user_id；**別信前端傳的 line_user_id**。
- 綁定：`admins.line_user_id`（unique），首次以「姓名+手機」比對既有帳號後綁定；之後 LINE 免登入。非 LINE 環境退回姓名+手機登入。
- 員工 OA 若只做選單+LIFF，**不需要 webhook**（且別指到客戶 channel 的 `/webhook`，secret 驗簽會錯）。

## 部署眉角
- **版本落差**：Vercel merge 後自動上前端、Render 手動 → 有「前端新、後端舊」空窗。前後端相依的改動要注意順序（前端先上通常較安全：舊後端忽略新參數；但若前端改了送出格式、舊後端會失敗，如 PIN→姓名+手機）。
- **Vercel env 是 build 時注入**：加/改 `VITE_*` 後**必須 redeploy 前端**才生效。可用 `curl <site>/assets/index-*.js | grep <值>` 確認已打包。
- 部署後：改過角色/權限的人**重新登入**；用 Playwright 或 curl 對**正式站**驗新端點（401 有此端點＝已上；404＝還沒上）。

## 慣用格式
- 民國日期：`member_valid_until` 存民國字串（`0YYY-MM-DD`，115=2026）；券的 `valid_from/until` 是西元 timestamptz。顯示時互轉（民國=西元-1911）。
- 電子發票號：台灣證明聯「左邊」QR 開頭 10 碼＝發票號（`^[A-Z]{2}\d{8}$`）；右邊 QR 是明細、沒有號碼。沿用 `html5-qrcode` 掃。
