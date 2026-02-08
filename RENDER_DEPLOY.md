# Render.com 部署後端指南

由於 Vercel 僅支援靜態前端或 Serverless Functions，我們需要另一個服務（如 Render.com）來運行 Node.js 後端服務。

## 步驟 1: 建立 Web Service

1. 登入 [Render.com](https://render.com/)
2. 點擊 **"New"** -> **"Web Service"**
3. 連結您的 GitHub 帳號並選擇 `linebot-booking-golf` 專案
4. 設定專案資訊：
   - **Name**: `linebot-booking-golf-backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`

## 步驟 2: 設定環境變數 (Environment)

在 Render 的 **Environment** 分頁中新增以下變數（請從您的 `.env` 複製）：

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LINE_PAY_CHANNEL_ID`
- `LINE_PAY_CHANNEL_SECRET`
- `LINE_PAY_API_URL` (測試用: `https://sandbox-api-pay.line.me`)
- `BASE_URL`: **重要** - 填入您前端 Vercel 的網址 (例如 `https://linebot-booking-golf-q3wo.vercel.app`)

## 步驟 3: 更新 Vercel 前端設定

1. 前往 **Vercel** 專案設定 -> **Environment Variables**
2. 新增或更新變數：
   - `VITE_API_URL`: 填入您 **Render 後端的網址** (例如 `https://linebot-booking-golf-backend.onrender.com`)
3. 重新部署 Vercel 或是重新推送 Git 觸發建置。

## 步驟 4: 更新 LINE Developers Console

1. 在 LINE Developers Console 的 **Messaging API** 頁面：
   - 更新 **Webhook URL** 為 Render 網址加上 `/webhook` (例如 `https://...onrender.com/webhook`)
2. 在 **LINE Pay** 設定中：
   - 確認 **Confirm URL** 與 **Cancel URL** 指向正確的後端位址 (通常後端會自動抓 `BASE_URL`)
