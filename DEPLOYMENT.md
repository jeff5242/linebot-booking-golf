# Vercel 部署指南

## 步驟 1: 登入 Vercel

1. 前往 https://vercel.com
2. 使用 GitHub 帳號登入

## 步驟 2: 匯入專案

1. 點擊 "Add New..." → "Project"
2. 選擇 `jeff5242/linebot-booking-golf`
3. 點擊 "Import"

## 步驟 3: 設定專案

### Build & Development Settings:
- **Framework Preset**: Vite
- **Root Directory**: `client`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Environment Variables:
在 Vercel 專案設定中新增以下環境變數：

```
VITE_SUPABASE_URL=https://yjglsxbvjhdfwmdtaspj.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_f_ysFAdVHTpi91Ob-8GysQ_ygEB34CT
VITE_LIFF_ID=2008898874-4qus3SyN
```

## 步驟 4: 部署

1. 點擊 "Deploy"
2. 等待建置完成（約 1-2 分鐘）
3. 取得部署 URL（例如：`https://linebot-booking-golf.vercel.app`）

## 步驟 5: 更新 LINE LIFF 設定

1. 前往 LINE Developers Console
2. 找到您的 LIFF App
3. 更新 Endpoint URL 為 Vercel 提供的 URL
4. 儲存設定

## 自動部署

之後每次推送到 GitHub main 分支，Vercel 會自動重新部署！

## HTTPS

✅ Vercel 自動提供免費的 HTTPS 憑證
✅ 所有流量都會自動重導向到 HTTPS
✅ 符合 LINE LIFF 的 HTTPS 要求
