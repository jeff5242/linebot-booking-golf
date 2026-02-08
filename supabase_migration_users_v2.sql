-- Add new columns to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS member_no text,
ADD COLUMN IF NOT EXISTS gender text,
ADD COLUMN IF NOT EXISTS tax_id text,
ADD COLUMN IF NOT EXISTS golfer_type text,
ADD COLUMN IF NOT EXISTS member_valid_until date;

-- Add check constraint for gender (optional, but good for data integrity)
-- ALTER TABLE public.users ADD CONSTRAINT users_gender_check CHECK (gender IN ('紳士', '女士', '保留'));

-- Add comment for column descriptions
COMMENT ON COLUMN public.users.member_no IS '會員編號';
COMMENT ON COLUMN public.users.gender IS '性別';
COMMENT ON COLUMN public.users.tax_id IS '統一編號 (8碼)';
COMMENT ON COLUMN public.users.golfer_type IS '擊球身分';
COMMENT ON COLUMN public.users.member_valid_until IS '有效日期';
