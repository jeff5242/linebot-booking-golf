'use strict';

/**
 * 應用層設定（存於 system_settings key-value）。
 * 目前提供「時區」：全站報表日界、時間顯示都以此為準，預設台灣（UTC+8）。
 * 之後要切換時區只改這一處設定即可。
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const TIMEZONE_KEY = 'app_timezone';
const DEFAULT_TIMEZONE = { offsetMinutes: 480, label: '台灣（UTC+8）' };

/** 取得目前時區設定（含預設） */
async function getTimezone() {
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', TIMEZONE_KEY)
    .maybeSingle();
  const s = data?.value || {};
  const offsetMinutes = Number.isInteger(s.offsetMinutes) ? s.offsetMinutes : DEFAULT_TIMEZONE.offsetMinutes;
  return { offsetMinutes, label: s.label || DEFAULT_TIMEZONE.label };
}

/** 更新時區設定（驗證 offset 範圍 -12:00 ~ +14:00） */
async function updateTimezone(cfg) {
  const off = Number(cfg?.offsetMinutes);
  if (!Number.isInteger(off) || off < -720 || off > 840) {
    throw new Error('時區位移不正確（需為 -720 ~ 840 分鐘）');
  }
  const value = {
    offsetMinutes: off,
    label: String(cfg?.label || '').trim().slice(0, 40) || DEFAULT_TIMEZONE.label,
  };
  const { data, error } = await supabase
    .from('system_settings')
    .upsert({ key: TIMEZONE_KEY, value, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data.value;
}

/** offsetMinutes → ISO 位移字串，例：480 → "+08:00"、-300 → "-05:00" */
function offsetSuffix(offsetMinutes) {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

/** 把 UTC 時間字串轉成該時區的 YYYY-MM-DD（用於報表日期分組） */
function zonedDate(iso, offsetMinutes) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso || '').slice(0, 10);
  return new Date(d.getTime() + offsetMinutes * 60000).toISOString().slice(0, 10);
}

module.exports = { getTimezone, updateTimezone, offsetSuffix, zonedDate, DEFAULT_TIMEZONE };
