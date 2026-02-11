# 開發技能記錄與最佳實踐

本文件記錄專案開發過程中的經驗、問題解決方案和最佳實踐，用於加快未來開發速度。

---

## 📋 目錄
1. [專案架構](#專案架構)
2. [開發工作流程](#開發工作流程)
3. [常見問題與解決方案](#常見問題與解決方案)
4. [部署流程](#部署流程)
5. [API 開發規範](#api-開發規範)
6. [資料庫 Migration](#資料庫-migration)
7. [環境變數管理](#環境變數管理)

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
├── client/                 # 前端專案（Vite + React）
│   ├── src/
│   │   ├── components/    # React 組件
│   │   ├── pages/         # 頁面組件
│   │   └── utils/         # 工具函數
│   ├── tailwind.config.js
│   └── vite.config.js
├── services/              # 後端業務邏輯（新架構）
│   ├── RateManagement.js # 費率管理服務
│   ├── BookingLogic.js   # 訂位邏輯
│   └── SystemSettings.js # 系統設定
├── migrations/            # 資料庫 Migration SQL
├── index.js               # 後端主程式（Express）
└── package.json           # 後端依賴
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
```

**設定位置：**
- Service → Environment

**注意事項：**
- 修改後服務會自動重啟
- `BASE_URL` 用於 CORS 和 webhook 設定

---

## 最近開發記錄

### 2026-02-11: 費率管理系統部署

**新增功能：**
1. 費率管理系統（前後端完整）
   - 多維度費率矩陣（會員等級 × 球洞 × 平假日）
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

**提交記錄：**
- `c1aea94`: Feature: Add comprehensive rate management system
- `380e21d`: Fix: Use VITE_API_URL for production API calls

---

## 溝通建議

### 加快開發速度的溝通技巧

1. **明確需求描述：**
   - ✅ "需要一個費率管理系統，包含多維度價格矩陣、版本控制、審核流程"
   - ❌ "做一個管理費率的功能"

2. **提供範例或參考：**
   - 提供 UI 設計圖或截圖
   - 說明參考的現有功能

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

**費率管理系統表：**
- `rate_configs` - 費率配置主表
- `rate_change_requests` - 費率變更請求
- `rate_audit_log` - 審計日誌
- `membership_tiers` - 會員等級定義
- `membership_benefits_issued` - 禮遇發放記錄

**其他核心表：**
- `users` - 用戶資料
- `bookings` - 訂位記錄
- `system_settings` - 系統參數
- `admins` - 管理員權限

---

**文件版本**: v1.0
**最後更新**: 2026-02-11
**維護者**: Development Team + Claude Sonnet 4.5
