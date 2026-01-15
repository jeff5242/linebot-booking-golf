# Golf Course Booking System

高爾夫球場預約管理系統 - LINE Web App

## 功能特色

### 用戶端 (LINE Web App)
- 📅 日曆選擇預約日期
- ⛳ 支援 9 洞 / 18 洞預約
- 👥 組員資料管理（最多 4 人）
- 🚗 服務選項（球車、桿弟）
- 📱 手機號碼驗證（台灣格式）
- 📋 我的預約查詢與取消

### 後台管理 (Admin Dashboard)
- 📊 視覺化時段管理
- ✅ 報到管理
- ⏰ 排定出發時間
- 🔗 18 洞轉場時段自動連動
- 👥 組員名單查看

## 技術架構

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Database**: Supabase (PostgreSQL)
- **Styling**: Vanilla CSS
- **LINE Integration**: LIFF SDK

## 安裝與設定

### 1. 安裝依賴

```bash
# 後端
npm install

# 前端
cd client
npm install
```

### 2. 環境變數設定

在 `client/.env` 中設定：

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_LIFF_ID=your_liff_id
```

### 3. 資料庫設定

在 Supabase SQL Editor 中執行：

1. 基礎架構：`supabase_schema.sql`
2. 組員資料：`supabase_migration_players.sql`
3. 服務選項：`supabase_migration_services.sql`
4. 時間追蹤：`supabase_migration_times.sql`

### 4. 啟動開發伺服器

```bash
# 前端
cd client
npm run dev

# 後端（如需）
npm run dev
```

## 核心邏輯

### 時段管理
- 營業時間：05:30 - 15:30
- 時段間隔：10 分鐘
- 18 洞最晚開球：13:00（需於 15:30 前完成轉場）

### 18 洞預約邏輯
- 自動佔用開球時段 (T) 和轉場時段 (T + 150 分鐘)
- 前後段時段自動連動顯示

## 專案結構

```
linebot-booking-golf/
├── client/                 # 前端應用
│   ├── src/
│   │   ├── pages/         # 頁面組件
│   │   ├── components/    # 共用組件
│   │   ├── utils/         # 工具函數
│   │   └── supabase.js    # Supabase 客戶端
│   └── .env               # 環境變數
├── index.js               # LINE Bot 後端
├── package.json
└── supabase_*.sql         # 資料庫遷移檔案
```

## License

ISC
