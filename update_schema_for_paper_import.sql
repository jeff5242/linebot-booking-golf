-- ========================================
-- 紙券批次匯入功能 - 資料庫更新腳本
-- ========================================

-- 1. 允許 users 表格的 line_user_id 為 NULL
--    (用於儲存尚未透過 LINE 註冊的客戶)
ALTER TABLE public.users 
ALTER COLUMN line_user_id DROP NOT NULL;

-- 2. 為 vouchers 表格新增購買日期和價格欄位
ALTER TABLE public.vouchers 
ADD COLUMN IF NOT EXISTS purchase_date timestamp with time zone;

ALTER TABLE public.vouchers 
ADD COLUMN IF NOT EXISTS price numeric DEFAULT 0;

-- 3. 確保 phone 欄位有唯一性約束（如果還沒有的話）
--    這樣可以避免重複建立相同電話的用戶
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'users_phone_unique'
    ) THEN
        ALTER TABLE public.users 
        ADD CONSTRAINT users_phone_unique UNIQUE (phone);
    END IF;
END $$;

-- 完成！現在可以開始匯入紙券資料了
