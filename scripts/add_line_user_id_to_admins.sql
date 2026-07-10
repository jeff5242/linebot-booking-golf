-- ============================================================
-- admins 新增 line_user_id（員工核銷 OA 綁定用）
--
-- 用途：員工在「員工核銷 OA」的 LIFF 綁定自己的 LINE 帳號後，
--       之後開核銷頁即以 LINE 身分免登入（不用手機 + PIN）。
--
-- 執行：到 Supabase SQL Editor 貼上執行一次（IF NOT EXISTS，可重複安全執行）
-- ============================================================

ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS line_user_id text;

-- 一個 LINE 帳號只能綁一個後台帳號
CREATE UNIQUE INDEX IF NOT EXISTS uq_admins_line_user_id
  ON public.admins(line_user_id)
  WHERE line_user_id IS NOT NULL;
