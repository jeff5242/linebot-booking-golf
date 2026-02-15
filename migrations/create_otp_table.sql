-- OTP 驗證碼表
CREATE TABLE IF NOT EXISTS public.otp_codes (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    phone text NOT NULL,
    code text NOT NULL,
    purpose text DEFAULT 'registration',  -- 'registration' | 'rebind'
    expires_at timestamptz NOT NULL,
    verified boolean DEFAULT false,
    attempts int DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

-- 索引：快速查詢最新 OTP
CREATE INDEX IF NOT EXISTS idx_otp_phone_created ON public.otp_codes (phone, created_at DESC);

-- RLS
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON public.otp_codes USING (true) WITH CHECK (true);
