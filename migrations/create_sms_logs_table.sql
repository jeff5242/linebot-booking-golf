-- SMS 發送記錄表
-- 記錄每次簡訊發送的詳細資訊供備查

CREATE TABLE IF NOT EXISTS public.sms_logs (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    phone text NOT NULL,                    -- 接收手機號碼
    message text NOT NULL,                  -- 簡訊內容
    otp_code text,                          -- 發送的驗證碼（若為 OTP 簡訊）
    purpose text,                           -- 用途 ('registration' | 'rebind' | 'notification')
    msg_id text,                            -- 三竹回傳的 Message ID
    status_code text,                       -- 三竹回傳的狀態碼 (1=成功)
    status text DEFAULT 'pending',          -- 狀態: pending / success / failed
    account_point int,                      -- 發送後剩餘點數
    error_message text,                     -- 失敗時的錯誤訊息
    sent_at timestamptz DEFAULT now(),      -- 發送時間
    created_at timestamptz DEFAULT now()
);

-- 索引：依手機號碼和時間查詢
CREATE INDEX IF NOT EXISTS idx_sms_logs_phone ON public.sms_logs (phone, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_at ON public.sms_logs (sent_at DESC);

-- RLS
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON public.sms_logs USING (true) WITH CHECK (true);
