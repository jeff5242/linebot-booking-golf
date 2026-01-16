-- 1. 清理重複的 phone 資料，只保留最新的 (created_at 最大的)
-- 使用 CTE 找出重複的電話，並刪除較舊的記錄
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY phone 
           ORDER BY created_at DESC
         ) as row_num
  FROM public.users
)
DELETE FROM public.users
WHERE id IN (
  SELECT id FROM duplicates WHERE row_num > 1
);

-- 2. 為 phone 欄位加上 UNIQUE 約束
ALTER TABLE public.users
ADD CONSTRAINT users_phone_key UNIQUE (phone);
