-- ============================================================
-- vouchers 新增 invoice_number（電子發票號碼）
--
-- 用途：販賣電子票券套本時輸入電子發票號碼，蓋在該套本的每張券上，
--       供交易紀錄／銷售明細對帳「哪張發票對應哪筆銷售」。
--
-- 執行：到 Supabase SQL Editor 貼上執行一次（IF NOT EXISTS，可重複安全執行）
-- ============================================================

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS invoice_number text;

-- 依發票號查詢/彙總（對帳）用
CREATE INDEX IF NOT EXISTS idx_vouchers_invoice_number
  ON public.vouchers(invoice_number);
