# 開發技能記錄與最佳實踐

本文件記錄專案開發過程中的經驗、問題解決方案和最佳實踐，用於加快未來開發速度。

---

## 📋 目錄
1. [專案架構](#專案架構)
2. [開發工作流程](#開發工作流程)
3. [常見問題與解決方案](#常見問題與解決方案)
4. [AI 協作防錯清單](#ai-協作防錯清單) **← 新增**
5. [部署流程](#部署流程)
6. [API 開發規範](#api-開發規範)
7. [資料庫 Migration](#資料庫-migration)
8. [環境變數管理](#環境變數管理)

---

## 專案架構

### 技術棧
- **前端**: React 19 + Vite + Tailwind CSS v3
- **後端**: Node.js + Express.js
- **資料庫**: Supabase (PostgreSQL)
- **部署**:
  - 前端: Vercel (https://linebot-booking-golf-q3wo.vercel.app)
  - 後端: Render (https://linebot-booking-golf-backend.onrender.com)

### 專案結構
```
linebot-booking-golf/
├── client/                          # 前端專案（Vite + React）
│   ├── src/
│   │   ├── components/
│   │   │   ├── AdminSettings.jsx    # 系統參數設定 UI
│   │   │   ├── CaddyManagement.jsx  # 桿弟名冊管理 UI
│   │   │   ├── ChargeCardModal.jsx  # 收費卡設定+預覽彈窗
│   │   │   ├── ChargeCardTemplate.jsx # 收費卡列印模板
│   │   │   ├── RateManagement.jsx   # 費率管理 UI
│   │   │   └── WaitlistMonitor.jsx  # 候補監控
│   │   ├── pages/
│   │   │   ├── Admin.jsx            # 管理後台（~2000 行，含多個 Tab 和子元件）
│   │   │   ├── Booking.jsx          # 用戶端預約頁面
│   │   │   └── Register.jsx         # 註冊頁面
│   │   └── utils/
│   │       └── golfLogic.js         # 球場邏輯工具（時段計算、golferTypeToTier 等）
│   ├── .env.production              # 生產環境變數（VITE_API_URL）
│   ├── tailwind.config.js
│   └── vite.config.js
├── services/                        # 後端業務邏輯
│   ├── RateManagement.js            # 費率計算引擎（calculateTotalFee, getActiveRateConfig）
│   ├── ChargeCard.js                # 收費卡產生 + LINE 通知
│   ├── CaddyManagement.js           # 桿弟名冊 CRUD
│   ├── LineNotification.js          # LINE Push 訊息封裝
│   ├── SmsService.js                # 三竹簡訊 HTTP API（含 DB log）
│   ├── OtpService.js                # OTP 驗證碼產生 / 驗證
│   ├── RichMenuService.js           # LINE Rich Menu 切換（登入前/後）
│   ├── BookingLogic.js              # 訂位邏輯
│   ├── SystemSettings.js            # 系統設定
│   └── OperationalCalendar.js       # 營運行事曆
├── migrations/                      # 資料庫 Migration SQL
├── index.js                         # 後端主程式（Express 路由層）
└── supabase_schema.sql              # 資料庫 Schema 參考（CHECK 約束在此）
```

### 前後端分離架構
- **開發環境**: Vite Proxy（自動轉發 `/api` 到 localhost:3000）
- **生產環境**: 前後端完全分離，需透過環境變數 `VITE_API_URL` 指定後端位置

---

## 開發工作流程

### 1. 本地開發

**啟動開發環境：**
```bash
# 終端機 1：啟動後端（port 3000）
node index.js

# 終端機 2：啟動前端（port 5174）
cd client && npm run dev
```

**開發新功能流程：**
1. 如果需要資料庫變更：先建立 Migration SQL
2. 開發後端 Service（`services/` 目錄）
3. 在 `index.js` 新增 API 路由
4. 開發前端 Component（`client/src/components/`）
5. 整合到頁面（`client/src/pages/`）
6. 本地測試

### 2. Git 提交規範

**Commit Message 格式：**
```
<type>: <subject>

<body>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Type 類型：**
- `Feature`: 新功能
- `Fix`: 錯誤修復
- `Refactor`: 重構
- `Docs`: 文件更新
- `Style`: 樣式調整

**範例：**
```bash
git commit -m "$(cat <<'EOF'
Feature: Add comprehensive rate management system

- Rate calculation engine with multi-tier pricing
- Real-time calculator and receipt preview
- Database migration for rate configs table

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

### 3. 部署流程

詳見 [部署流程](#部署流程) 章節。

---

## 常見問題與解決方案

### ❌ 問題 1: 前端 API 調用在生產環境失敗

**症狀：**
- 本地開發正常，部署到 Vercel 後 API 無法連接
- 頁面卡在「載入中」狀態
- Console 出現 CORS 或 404 錯誤

**原因：**
使用相對路徑調用 API（如 `fetch('/api/settings')`），在生產環境中前後端分離導致路徑錯誤。

**解決方案：**
所有前端 API 調用必須使用 `VITE_API_URL` 環境變數：

```javascript
// ❌ 錯誤寫法
const res = await fetch('/api/settings');

// ✅ 正確寫法
const apiUrl = import.meta.env.VITE_API_URL || '';
const res = await fetch(`${apiUrl}/api/settings`);
```

**檢查清單：**
- [ ] 所有 `fetch()` 調用都使用 `VITE_API_URL`
- [ ] Vercel 環境變數已設定 `VITE_API_URL`
- [ ] 環境變數值不包含結尾斜線

---

### ❌ 問題 2: Tailwind CSS 未載入

**症狀：**
- 頁面顯示但沒有樣式
- 開發工具檢查元素有 class 但無樣式

**原因：**
Tailwind v4 與專案配置不相容，或缺少必要配置檔。

**解決方案：**
1. 使用 Tailwind v3：
```bash
cd client
npm install tailwindcss@^3.4.19
```

2. 確保配置檔存在：
   - `client/tailwind.config.js`
   - `client/postcss.config.js`

3. 在 `client/src/index.css` 加入：
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

### ❌ 問題 3: 生產環境資料庫表不存在

**症狀：**
- 本地運行正常，生產環境報錯「table does not exist」
- API 回傳 500 錯誤

**原因：**
Migration SQL 只在本地 Supabase 執行，未在生產環境執行。

**解決方案：**
1. 準備生產環境 Migration SQL（`migrations/PRODUCTION_MIGRATION.sql`）
2. 登入 Supabase Dashboard → SQL Editor
3. 執行 Migration SQL
4. 驗證表是否建立：
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public';
```

---

### ❌ 問題 4: CORS 錯誤

**症狀：**
前端調用後端 API 時出現 CORS 錯誤。

**解決方案：**
確保後端 `index.js` 中 CORS 設定包含正確的前端網址：

```javascript
const cors = require('cors');

const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://linebot-booking-golf-q3wo.vercel.app',
    // 其他 Vercel preview 網址
];

app.use(cors({
    origin: function(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
```

---

## AI 協作防錯清單

> 以下規則源自實際開發過程中反覆發生的錯誤，**每次修改程式碼前請逐條檢查**。

### 規則 1: 資料庫 INSERT/UPDATE 前必查 CHECK 約束

**背景**: 本專案多個表有 `CHECK` 約束限制欄位值。曾因 3 次 CHECK 違反導致功能失敗。

**錯誤案例**:
```javascript
// ❌ 'unpaid' 不在 bookings.payment_status 允許值中
{ payment_status: 'unpaid' }  // → 正確值: 'pending'

// ❌ 'pending' 不在 waitlist.status 允許值中
{ status: 'pending' }  // → 正確值: 'queued'
```

**執行規則**:
1. 任何 `INSERT` / `UPDATE` 操作前，先查 `supabase_schema.sql` 確認 CHECK 約束
2. 參考下方「核心表 Status 速查表」快速確認

---

### 規則 2: 子元件新增 Props 必須同步更新父元件

**背景**: 修改子元件函數簽名（新增 props）但忘記在父元件傳入，導致功能無反應。

**錯誤案例**:
```javascript
// 子元件新增了 setChargeCardBooking 參數
function StarterDashboard({ selectedDate, ..., setChargeCardBooking }) { ... }

// ❌ 但父元件忘記傳入
<StarterDashboard selectedDate={date} />

// ✅ 父元件必須同步更新
<StarterDashboard selectedDate={date} setChargeCardBooking={setChargeCardBooking} />
```

**執行規則**:
1. 修改元件函數簽名後，立即搜尋所有 `<ComponentName` 引用處
2. 確認每個引用都傳入新的 props
3. 特別注意 Admin.jsx 中的子元件（StarterDashboard, ScheduleBoard 等）

---

### 規則 3: 新增 API 路由後必須重啟後端

**背景**: 在 `index.js` 新增路由後忘記重啟，前端收到 HTML 404（而非 JSON 錯誤），導致 `Unexpected token '<'` 錯誤。

**執行規則**:
1. 修改 `index.js` 路由後，終止並重啟 `node index.js`
2. 用 `curl` 測試新路由是否返回 JSON
3. 如看到 `Unexpected token '<'` 錯誤，首先檢查後端是否已重啟

---

### 規則 4: 所有前端 fetch 必須使用 VITE_API_URL

**背景**: 生產環境前後端分離，相對路徑 `/api/...` 在 Vercel 上無法連到 Render 後端。

**執行規則**:
```javascript
// 每個有 fetch 的元件開頭必須有：
const apiUrl = import.meta.env.VITE_API_URL || '';

// 每個 fetch 調用必須：
fetch(`${apiUrl}/api/endpoint`);
```

---

### 規則 5: 引用函數前先確認函數存在

**背景**: 使用不存在的 `loadAvailableSlots()` 導致執行錯誤，實際應使用已有的 `fetchBookings()`。

**執行規則**:
1. 調用任何函數前，先搜尋該函數是否在當前作用域中定義
2. 注意同一功能在不同元件中可能有不同名稱（例如 `fetchBookings` vs `loadAvailableSlots`）
3. 優先使用元件內已定義的函數

---

### 核心表 Status 速查表

| 表 | 欄位 | 允許值 |
|---|---|---|
| `bookings` | `status` | `confirmed`, `checked_in`, `completed`, `cancelled`, `no_show` |
| `bookings` | `payment_status` | `pending`, `paid`, `failed`, `refunded` |
| `waitlist` | `status` | `queued`, `notified`, `confirmed`, `expired`, `cancelled` |
| `charge_cards` | `status` | `created`, `printed`, `paid`, `voided` |
| `caddies` | `status` | `active`, `inactive` |
| `rate_configs` | `status` | `active`, `draft`, `archived` |

---

## 部署流程

### 完整部署檢查清單

#### 階段 1: 程式碼準備
- [ ] 本地開發測試完成
- [ ] 所有 API 調用使用 `VITE_API_URL`
- [ ] 建立 Migration SQL（如有資料庫變更）
- [ ] 更新 `.gitignore`（避免提交敏感檔案）

#### 階段 2: Git 提交與推送
```bash
# 1. 檢查變更
git status

# 2. Stage 檔案
git add <files>

# 3. 提交（使用規範格式）
git commit -m "..."

# 4. 推送到 GitHub
git push origin main
```

#### 階段 3: 資料庫 Migration（如需要）
1. 登入 Supabase: https://supabase.com/dashboard
2. 選擇專案
3. SQL Editor → New query
4. 複製並執行 Migration SQL
5. 驗證結果

#### 階段 4: 環境變數檢查

**Vercel（前端）：**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_LIFF_ID`
- `VITE_API_URL` ← **重要！指向 Render 後端**

**Render（後端）：**
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BASE_URL` ← **重要！指向 Vercel 前端**
- `LINE_PAY_*`（如使用）

#### 階段 5: 觸發部署
- **Vercel**: Git push 自動觸發（1-2 分鐘）
- **Render**: Git push 自動觸發（2-3 分鐘）

#### 階段 6: 部署驗證
```bash
# 測試後端 API
curl https://linebot-booking-golf-backend.onrender.com/api/rates/active

# 前端測試
# 開啟 https://linebot-booking-golf-q3wo.vercel.app/admin
# 檢查功能是否正常
```

---

## API 開發規範

### 後端 API 結構

**新架構（推薦）：**
```
services/               ← 業務邏輯層
├── RateManagement.js  ← 費率管理
├── BookingLogic.js    ← 訂位邏輯
└── SystemSettings.js  ← 系統設定

index.js               ← 路由層（薄層，只處理請求）
```

**API 路由範例：**
```javascript
// index.js
const RateManagement = require('./services/RateManagement');

// GET 取得生效費率
app.get('/api/rates/active', async (req, res) => {
    try {
        const config = await RateManagement.getActiveRateConfig();
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST 計算費用
app.post('/api/rates/calculate', async (req, res) => {
    try {
        const result = await RateManagement.calculateTotalFee(req.body);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
```

### 前端 API 調用規範

**統一使用環境變數：**
```javascript
// 在組件中
const apiUrl = import.meta.env.VITE_API_URL || '';

// GET 請求
const res = await fetch(`${apiUrl}/api/rates/active`);
const data = await res.json();

// POST 請求
const res = await fetch(`${apiUrl}/api/rates/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
});
```

### 錯誤處理

**後端：**
```javascript
try {
    const result = await someOperation();
    res.json({ success: true, data: result });
} catch (error) {
    console.error('操作失敗:', error);
    res.status(500).json({
        success: false,
        error: error.message
    });
}
```

**前端：**
```javascript
try {
    const res = await fetch(`${apiUrl}/api/endpoint`);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    // 處理成功
} catch (error) {
    console.error('API 調用失敗:', error);
    setError('操作失敗，請稍後再試');
}
```

---

## 資料庫 Migration

### Migration 檔案結構

```sql
-- ============================================
-- Migration 標題與說明
-- ============================================

-- 1. 建立表格
CREATE TABLE IF NOT EXISTS table_name (...);

-- 2. 建立索引
CREATE INDEX IF NOT EXISTS idx_name ON table_name(column);

-- 3. 插入初始資料
INSERT INTO table_name (...) VALUES (...)
ON CONFLICT (unique_column) DO NOTHING;

-- 4. RLS 政策
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policy_name" ON table_name FOR SELECT USING (...);
```

### 本地 vs 生產環境

**本地開發：**
- 可以直接在 Supabase Dashboard 執行
- 使用 `CREATE TABLE IF NOT EXISTS` 避免重複執行錯誤

**生產環境：**
- 務必先備份資料
- 使用 `ON CONFLICT DO NOTHING` 避免覆蓋現有資料
- 測試 Migration 在本地環境無誤後再執行

### RLS 政策注意事項

**避免使用外鍵引用 auth.users：**
```sql
-- ❌ 可能導致錯誤
created_by UUID REFERENCES auth.users(id)

-- ✅ 改用簡單的 UUID
created_by UUID
```

**政策範例：**
```sql
-- 允許所有人讀取 active 狀態的資料
CREATE POLICY "Allow all to read active"
ON table_name FOR SELECT
USING (status = 'active');

-- 只允許管理員修改
CREATE POLICY "Only admins can modify"
ON table_name FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM admins
        WHERE admins.user_id = auth.uid()
    )
);
```

---

## 環境變數管理

### 本地開發（.env）

```bash
# LINE Bot
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_CHANNEL_SECRET=...

# Supabase
SUPABASE_URL=https://yjglsxbvjhdfwmdtaspj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

# 伺服器
PORT=3000
```

### Vercel 環境變數

**必要變數：**
```
VITE_SUPABASE_URL=https://yjglsxbvjhdfwmdtaspj.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_LIFF_ID=...
VITE_API_URL=https://linebot-booking-golf-backend.onrender.com
```

**設定位置：**
- Project → Settings → Environment Variables

**注意事項：**
- 前端變數必須以 `VITE_` 開頭
- 修改後需要重新部署才會生效
- 不要在變數值結尾加斜線

### Render 環境變數

**必要變數：**
```
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_CHANNEL_SECRET=...
SUPABASE_URL=https://yjglsxbvjhdfwmdtaspj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
BASE_URL=https://linebot-booking-golf-q3wo.vercel.app
MITAKE_USERNAME=...          # 三竹簡訊帳號（⚠️ 海外 IP 問題待解決）
MITAKE_PASSWORD=...          # 三竹簡訊密碼
MITAKE_API_URL=https://smsapi.mitake.com.tw/api/mtk/SmSend
RICH_MENU_BEFORE_LOGIN=...   # 執行 setupRichMenus.js 取得
RICH_MENU_AFTER_LOGIN=...    # 執行 setupRichMenus.js 取得
```

**設定位置：**
- Service → Environment

**注意事項：**
- 修改後服務會自動重啟
- `BASE_URL` 用於 CORS 和 webhook 設定
- ⚠️ 三竹簡訊在 Render 海外 IP 無法正常使用（`statuscode=k`），詳見待辦事項

---

## 最近開發記錄

### 2026-02-11 (早): 費率管理系統部署

**新增功能：**
1. 費率管理系統（前後端完整）
   - 多維度費率矩陣（會員等級 x 球洞 x 平假日）
   - 桿弟費配比計算
   - 即時試算工具
   - 收費卡預覽

2. AdminSettings 重新設計
   - Tailwind CSS 專業 UI
   - Headless UI 組件
   - 即時預覽面板

3. 候補監控組件

**關鍵檔案：**
- `services/RateManagement.js` - 費率計算引擎
- `client/src/components/RateManagement.jsx` - 費率管理 UI
- `client/src/components/AdminSettings.jsx` - 參數設定 UI
- `migrations/PRODUCTION_MIGRATION.sql` - 資料庫 Schema

**遇到的問題與解決：**
1. **API URL 問題**: 前端使用相對路徑導致生產環境失敗
   - 解決：統一使用 `VITE_API_URL` 環境變數

2. **Tailwind v4 不相容**:
   - 解決：降級至 Tailwind v3

3. **資料庫表不存在**:
   - 解決：執行 PRODUCTION_MIGRATION.sql

---

### 2026-02-11 (晚): 收費卡系統 + 候補修復 + 生產環境修正

**新增功能：**
1. 收費卡產生系統（7 個新檔案）
   - 出發台報到後，可產生收費卡、指派桿弟
   - 費用依會員等級自動計算（呼叫 RateManagement）
   - 可列印的大衛營收費卡 HTML 模板
   - LINE Push 通知球員集合資訊
2. 桿弟名冊管理（Admin Tab）
3. 候補功能（waitlist + peak_type）

**關鍵檔案：**
- `services/ChargeCard.js` - 收費卡核心邏輯
- `services/CaddyManagement.js` - 桿弟名冊
- `services/LineNotification.js` - LINE Push 封裝
- `client/src/components/ChargeCardModal.jsx` - 收費卡彈窗
- `client/src/components/ChargeCardTemplate.jsx` - 列印模板
- `client/src/components/CaddyManagement.jsx` - 桿弟管理 UI
- `migrations/create_charge_card_tables.sql` - caddies + charge_cards 表

**遇到的 6 個錯誤及修正：**

| # | 錯誤 | 根因 | 修正 |
|---|------|------|------|
| 1 | `waitlist_status_check` 違反 | 用 `'pending'` 但 waitlist 只接受 `'queued'` | 改為 `'queued'` |
| 2 | `bookings_payment_status_check` 違反 | 用 `'unpaid'` 但只接受 `'pending'` | 改為 `'pending'` |
| 3 | `loadAvailableSlots is not defined` | 引用不存在的函數 | 改用 `fetchBookings()` |
| 4 | 生產環境預約間隔不連動 | Booking.jsx 未用 `VITE_API_URL` | 加入環境變數 |
| 5 | `Unexpected token '<'` | 後端新增路由後未重啟 | 重啟 node index.js |
| 6 | 產生收費卡無反應 | `setChargeCardBooking` 未傳入 StarterDashboard | 加入 props |

**教訓總結：**
- 3/6 的錯誤可以透過「查 Schema CHECK 約束」避免
- 1/6 的錯誤可以透過「搜尋函數是否存在」避免
- 1/6 的錯誤可以透過「搜尋子元件引用處」避免
- 1/6 的錯誤可以透過「重啟後端」避免

---

## 溝通建議

### 加快開發速度的溝通技巧

1. **明確需求描述：**
   - ✅ "需要一個費率管理系統，包含多維度價格矩陣、版本控制、審核流程"
   - ❌ "做一個管理費率的功能"

2. **提供範例或參考：**
   - 提供 UI 設計圖或截圖
   - 說明參考的現有功能
   - 提供 HTML/CSS 模板（如收費卡模板）效果很好

3. **分階段確認：**
   - 大功能可以分階段確認（資料庫設計 → 後端 API → 前端 UI）
   - 每個階段確認後再進行下一階段

4. **說明部署需求：**
   - 開發時明確是本地測試還是需要部署
   - 如需部署，提前說明環境（開發/測試/正式）

5. **問題回報格式：**
   ```
   問題：參數設定頁面一直載入中
   環境：正式環境（Vercel）
   重現步驟：登入後台 → 點擊參數設定
   預期行為：顯示設定表單
   實際行為：停在載入畫面
   ```

6. **提供相關資訊：**
   - 環境網址（前端、後端）
   - 錯誤訊息截圖或 Console 日誌
   - 已嘗試的解決方法

### AI 協作加速指令（給 AI 的提示）

> 在新對話開始時，可以先請 AI 閱讀此檔案以快速了解專案：

```
請先閱讀 SKILL.md 了解專案架構和開發規範，再開始實作。
```

> 需要修改資料庫欄位值時：

```
請先查 supabase_schema.sql 確認 [表名] 的 CHECK 約束後再寫入。
```

> 修改子元件後：

```
修改完元件後，請搜尋所有使用 <ComponentName 的地方，確認 props 已同步更新。
```

> 新增 API 路由後的提醒：

```
路由已加入 index.js，請提醒我重啟後端。
```

> 大功能開發時建議使用的需求格式（如本次收費卡 SOP 格式就很好）：

```
功能名稱：XXX
觸發條件：什麼時候使用
操作流程：1. → 2. → 3.
UI 需求：描述介面
資料需求：需要哪些資料
通知需求：是否需要推播
參考模板：[附上 HTML/截圖]
```

### ❌ 問題 5: LINE Rich Menu 圖片上傳 415 Unsupported Media Type

**症狀：**
- 執行 `scripts/setupRichMenus.js` 上傳 Rich Menu 圖片時回傳 `415 Unsupported Media Type`

**原因：**
LINE SDK `setRichMenuImage()` 內部讀取 `body.type` 作為 `Content-Type` header。Node.js 的 `Buffer` 沒有 `.type` 屬性，導致 `Content-Type: undefined`。

**解決方案：**
```javascript
// ❌ 錯誤：直接用 Buffer
const image = fs.readFileSync(imagePath);
await blobClient.setRichMenuImage(menuId, image);

// ✅ 正確：用 Blob 包裝，指定 type
const image = fs.readFileSync(imagePath);
const blob = new Blob([image], { type: 'image/png' });
await blobClient.setRichMenuImage(menuId, blob);
```

**關鍵檔案：** `scripts/setupRichMenus.js`

---

### ❌ 問題 6: Render 海外 IP 無法存取三竹簡訊 API

**症狀：**
- 三竹 Mitake API 從 Render 發送時返回 `statuscode=k`（帳號或密碼錯誤）
- 相同帳密從本地台灣 IP 發送成功

**原因：**
Render 免費方案的伺服器位於美國/歐洲。三竹簡訊 API 可能限制僅允許台灣 IP 存取。

**確認方式：**
- `sms_logs` 表中查看 `error_message` 欄位，含遮罩帳號資訊 `[user=535***50,pass=10chars]`
- 帳密正確但從海外 IP 請求返回 `statuscode=k`

**狀態：** 🔴 未解決 — 詳見待辦事項

**關鍵檔案：** `services/SmsService.js`

---

### ❌ 問題 7: 三竹簡訊中文亂碼

**症狀：**
- 透過三竹 Mitake API 發送含中文的簡訊，手機收到亂碼

**原因：**
`CharsetURL=UTF-8` 放在 POST body 裡，三竹 API 無法正確識別編碼。三竹要求此參數放在 **URL query string**。

**解決方案：**
```javascript
// ❌ 錯誤：CharsetURL 放在 POST body
const params = new URLSearchParams();
params.append('CharsetURL', 'UTF-8');
params.append('smbody', message);
axios.post(MITAKE_API_URL, params.toString());

// ✅ 正確：CharsetURL 放在 URL query string，Content-Type 加上 charset
const apiUrl = `${MITAKE_API_URL}?CharsetURL=UTF-8`;
const params = new URLSearchParams();
params.append('smbody', message);
axios.post(apiUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' }
});
```

**關鍵檔案：** `services/SmsService.js`

---

## 快速參考

### 常用指令

```bash
# 本地開發
node index.js                    # 啟動後端
cd client && npm run dev         # 啟動前端

# Git 操作
git status                       # 檢查狀態
git add <files>                  # Stage 檔案
git commit -m "message"          # 提交
git push origin main             # 推送

# 測試 API
curl https://backend-url/api/endpoint

# Supabase CLI（如已安裝）
supabase start                   # 啟動本地 Supabase
supabase migration new <name>    # 建立新 Migration
```

### 重要網址

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Render Dashboard**: https://dashboard.render.com
- **Supabase Dashboard**: https://supabase.com/dashboard
- **GitHub Repository**: https://github.com/jeff5242/linebot-booking-golf
- **前端正式環境**: https://linebot-booking-golf-q3wo.vercel.app
- **後端正式環境**: https://linebot-booking-golf-backend.onrender.com

---

## 附錄

### 依賴版本記錄

**前端主要依賴：**
- react: ^19.2.0
- tailwindcss: ^3.4.19
- @headlessui/react: ^2.2.9
- lucide-react: ^0.562.0
- vite: ^7.3.1

**後端主要依賴：**
- express: ^4.x
- @supabase/supabase-js: ^2.x
- cors: ^2.x
- dotenv: ^17.x

### 資料庫 Schema 參考

**核心業務表：**
- `users` - 用戶資料（含 golfer_type, line_user_id, member_no）
- `bookings` - 訂位記錄（status CHECK, payment_status CHECK）
- `waitlist` - 候補名單（status CHECK: queued/notified/confirmed/expired/cancelled）
- `charge_cards` - 收費卡（status CHECK: created/printed/paid/voided）
- `caddies` - 桿弟名冊（status CHECK: active/inactive）

**費率管理表：**
- `rate_configs` - 費率配置主表（含 green_fees, caddy_fees, base_fees, tax_config JSONB）
- `rate_change_requests` - 費率變更請求
- `rate_audit_log` - 審計日誌
- `membership_tiers` - 會員等級定義
- `membership_benefits_issued` - 禮遇發放記錄

**系統表：**
- `system_settings` - 系統參數（預約間隔、開放天數等）
- `admins` - 管理員權限
- `operational_calendar` - 營運行事曆

**會員等級對應費率 Tier：**
```
白金會員 → platinum | 金卡會員 → gold | 社區會員 → gold
VIP-A → gold | VIP-B → gold | 團友 → team_friend | 來賓 → guest
```

---

### 2026-02-14/15: OTP 手機驗證 + 會員中心 + Rich Menu

#### 開發對話摘要

本次開發為期兩天，涵蓋三大功能模組：OTP 手機驗證、會員個人中心、LINE Rich Menu 整合。開發過程中解決了多個生產環境問題，包括三竹簡訊中文亂碼、LINE SDK 圖片上傳 415 錯誤、以及 Render 海外 IP 無法存取三竹 API 的問題。

#### 開發過程（時間線）

**Phase 1: 設計規劃**
- 制定 OTP 驗證架構：`Register.jsx` → `POST /api/otp/send` → `SmsService` → 三竹 API
- 設計會員中心頁面結構：會員卡片 + Tab 分頁（預約/收費卡/優惠券）
- 規劃 Rich Menu 切換邏輯：登入前 2 格 / 登入後 3 格

**Phase 2: 後端開發**
- 建立 `otp_codes` 表 + `sms_logs` 表（Supabase Migration）
- 開發 `SmsService.js`：三竹 HTTP API 串接 + DB 日誌記錄
- 開發 `OtpService.js`：OTP 產生/驗證（含冷卻期、每日上限、嘗試次數限制）
- 開發 `RichMenuService.js`：Rich Menu 切換邏輯
- 在 `index.js` 新增 OTP + 會員 + Rich Menu API 端點

**Phase 3: 前端開發**
- 修改 `Register.jsx`：真實 OTP 取代 mock SMS Modal
- 新增 `MemberCenter.jsx`：會員卡片、預約紀錄 Tab、收費卡 Tab、優惠券 Tab、重新綁定手機 Modal
- 更新 `App.jsx`：新增 `/member` 路由

**Phase 4: 本地測試與除錯**
- 驗證 Supabase migration 執行成功（`otp_codes` + `sms_logs` 表）
- 測試 OTP 發送 → 發現中文亂碼 → 修正 `CharsetURL` 位置
- 重新發送 → 中文正常顯示 ✅

**Phase 5: Rich Menu 設定**
- 準備 Rich Menu 圖片（1200x405 px）
- 執行 `scripts/setupRichMenus.js` → 遇到 415 Unsupported Media Type 錯誤
- 修正：LINE SDK `setRichMenuImage()` 需要 `Blob` 而非 `Buffer`
- 再次執行 → Rich Menu 建立成功 ✅
- 新增自動刪除舊 Rich Menu 邏輯（避免累積）

**Phase 6: 部署與生產測試**
- `vite build` 前端編譯成功
- 設定 Render 環境變數（`MITAKE_*` + `RICH_MENU_*`）
- Git commit + push → 觸發 Vercel + Render 自動部署
- 測試 Rich Menu → 點擊「升級會員」→ 已註冊用戶跳轉到 `/member` ✅

**Phase 7: 生產問題排查**
- 問題 1：「重新綁定手機」網路錯誤 → SMS 從 Render 發送失敗（`statuscode=k`）
- 問題 2：「運勢卡」白畫面 → `/fortune` 路由不存在
- 問題 3：「球場資訊」白畫面 → `/course-info` 路由不存在
- 排查 SMS 問題：加入遮罩帳號資訊到 `sms_logs` → 確認帳密正確
- 結論：Render 伺服器在海外（US/EU），三竹 API 可能有 IP 區域限制

#### 新增功能

1. **OTP 手機驗證**（三竹簡訊 Mitake API）
   - 6 位數驗證碼，5 分鐘有效，60 秒冷卻，每日 10 次上限，最多 5 次嘗試
   - SMS 發送記錄寫入 `sms_logs` 表（含 Message ID、狀態碼、剩餘點數、驗證碼）
   - Dev 模式：`MITAKE_USERNAME` 未設定時，OTP 只 log 到 console
2. **會員個人中心 `/member`**（MemberCenter.jsx）
   - 會員卡片（身分 badge、會員編號、有效期）
   - 預約紀錄 Tab（狀態 badge、分頁）
   - 收費卡 Tab（歷史收費卡）
   - 優惠券 Tab（`membership_benefits_issued`）
   - 重新綁定手機功能（OTP 再驗證）
   - 快捷操作：新增預約、報到 QR
3. **LINE Rich Menu 自動切換**
   - 登入前 2 格：升級會員/運勢卡、球場資訊
   - 登入後 3 格：會員專區、運勢卡、球場資訊
   - 註冊成功自動切換、follow 事件判斷
   - `scripts/setupRichMenus.js` 自動建立 + 上傳圖片 + 刪除舊 Menu

#### 新增檔案

| 檔案 | 說明 |
|------|------|
| `services/SmsService.js` | 三竹簡訊 HTTP API + DB 日誌記錄 |
| `services/OtpService.js` | OTP 產生/驗證（含安全限制） |
| `services/RichMenuService.js` | LINE Rich Menu 切換（per-user） |
| `client/src/pages/MemberCenter.jsx` | 會員個人中心頁面 |
| `scripts/setupRichMenus.js` | Rich Menu 建立/上傳/設定腳本 |
| `migrations/create_otp_table.sql` | `otp_codes` 表 |
| `migrations/create_sms_logs_table.sql` | `sms_logs` 表 |

#### 修改檔案

| 檔案 | 修改內容 |
|------|----------|
| `index.js` | 新增 OTP + 會員 + Rich Menu API 端點（約 200 行） |
| `client/src/pages/Register.jsx` | 真實 OTP 取代 mock SMS Modal |
| `client/src/App.jsx` | 新增 `/member` 路由 |

#### 環境變數（新增）

| 變數名稱 | 說明 | Render 必需 |
|----------|------|:-----------:|
| `MITAKE_USERNAME` | 三竹簡訊帳號 | ⚠️ 見待辦 |
| `MITAKE_PASSWORD` | 三竹簡訊密碼 | ⚠️ 見待辦 |
| `MITAKE_API_URL` | 三竹 API 網址 | ⚠️ 見待辦 |
| `RICH_MENU_BEFORE_LOGIN` | 登入前 Rich Menu ID | ✅ |
| `RICH_MENU_AFTER_LOGIN` | 登入後 Rich Menu ID | ✅ |

#### 踩坑記錄

| # | 問題 | 根因 | 解決方案 | 關鍵檔案 |
|---|------|------|----------|----------|
| 1 | 三竹中文簡訊亂碼 | `CharsetURL=UTF-8` 放在 POST body | 改放 URL query string + Content-Type 加 `charset=utf-8` | `SmsService.js` |
| 2 | Rich Menu 圖片上傳 415 | LINE SDK `setRichMenuImage()` 需要 `Blob` | `new Blob([buffer], { type: 'image/png' })` 包裝 | `setupRichMenus.js` |
| 3 | Render SMS `statuscode=k` | Render 伺服器在海外，三竹 API 可能限制 IP 區域 | **未解決** — 需聯繫三竹或改用台灣主機 | `SmsService.js` |
| 4 | 舊 server 佔 port 3000 | 前次 server 未關閉 | `lsof -i :3000 -t \| xargs kill -9` | — |
| 5 | 已註冊用戶看到白畫面 | Register 跳轉 `/member` 但新頁面未部署 | 等待 Vercel 部署完成 | `Register.jsx` |

---

## 📌 待辦事項（TODO）

> 上次開發截止時的未完成項目，後續開發請優先處理。

### 🔴 高優先：三竹簡訊 Render 海外 IP 問題

**問題描述：**
三竹 Mitake SMS API 從 Render（海外伺服器）發送時返回 `statuscode=k`（帳號或密碼錯誤），但相同帳密從本地（台灣 IP）發送成功。

**已確認：**
- 帳密正確（`sms_logs` 記錄：`user=535***50, pass=10chars`）
- 本地發送成功（`statuscode=1`，剩餘點數 12905）
- Render 發送失敗 4 次（全部 `statuscode=k`）

**可能解決方案（擇一）：**
1. 聯繫三竹客服，確認是否有 IP 白名單限制，要求開放 Render IP
2. 將後端遷移至台灣 GCP（asia-east1）或 AWS（ap-northeast-1）
3. 建立一個台灣 VPS 作為 SMS Proxy（後端 → 台灣 Proxy → 三竹 API）
4. 改用其他支援海外的 SMS 服務商（如 Twilio）

### 🔴 高優先：Rich Menu 缺失頁面（白畫面）

**問題描述：**
Rich Menu 中「運勢卡」和「球場資訊」按鈕連結到 `/fortune` 和 `/course-info`，但這兩個路由在 `App.jsx` 中不存在。

**需要處理：**
- 建立 `/fortune` 路由與頁面（`client/src/pages/Fortune.jsx`）— 運勢卡功能
- 建立 `/course-info` 路由與頁面（`client/src/pages/CourseInfo.jsx`）— 球場資訊頁面
- 或修改 Rich Menu 連結指向已有頁面（暫時方案）
- 更新 `App.jsx` 加入新路由

### 🟡 中優先：清理除錯程式碼

**問題描述：**
`SmsService.js` 中加入了遮罩帳號資訊的除錯日誌（寫入 `sms_logs.error_message`），確認問題後應移除。

**需要處理：**
- 移除 `maskedUser`、`maskedPass` 相關 console.log
- 移除 `sms_logs.error_message` 中的 `[user=...,pass=...,url=...]` debug info
- 恢復簡潔的錯誤訊息

### 🟡 中優先：OTP API 錯誤碼改進

**問題描述：**
`POST /api/otp/send` 對所有 `!result.success` 都回傳 HTTP 429，無法區分「冷卻中」vs「SMS 發送失敗」。

**建議修改 `index.js`：**
```javascript
// 區分不同錯誤類型
if (result.message.includes('冷卻') || result.message.includes('上限')) {
    return res.status(429).json({ error: result.message });
}
return res.status(500).json({ error: result.message });
```

### 🟢 低優先：其他改進

1. **導航優化**：Booking 頁面加「個人中心」按鈕，MyBookings 加「返回個人中心」按鈕
2. **Register 流程優化**：註冊成功後直接跳轉 `/member`（目前已實作）
3. **Rich Menu 建立腳本**：加入 LIFF ID 環境變數化（目前寫死在 `setupRichMenus.js` 中）
4. **SMS 重試機制**：SMS 發送失敗時自動重試一次（需注意冷卻期）

---

### API 端點總覽（本次新增）

| Method | Path | 說明 | Auth |
|--------|------|------|------|
| POST | `/api/otp/send` | 發送 OTP 簡訊 | 無 |
| POST | `/api/otp/verify` | 驗證 OTP | 無 |
| POST | `/api/member/register` | OTP 驗證 + LINE 綁定 | 無 |
| POST | `/api/member/rebind` | 重新綁定手機 | 無 |
| GET | `/api/member/profile?lineUserId=` | 會員資料 + 統計 | 無 |
| GET | `/api/member/bookings?lineUserId=` | 預約紀錄（分頁） | 無 |
| GET | `/api/member/charge-cards?lineUserId=` | 收費卡紀錄（分頁） | 無 |
| GET | `/api/member/vouchers?lineUserId=` | 優惠券 | 無 |

---

**文件版本**: v4.0
**最後更新**: 2026-02-15
**維護者**: Development Team + Claude Opus 4.6
