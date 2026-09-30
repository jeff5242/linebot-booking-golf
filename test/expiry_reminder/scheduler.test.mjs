// 整合測試：maybeRunDaily 排程 gating（正式 DB，注入 nowMs/pushFn，不打 LINE，還原設定/狀態）
// node test/expiry_reminder/scheduler.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');
const ER = require('../../services/ExpiryReminder.js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
const noPush = async () => ({ success: true });
const AT_08 = Date.parse('2026-09-30T00:00:00Z'); // +8h = 08:00 台灣（未到 runHour 10）
const AT_10 = Date.parse('2026-09-30T02:00:00Z'); // +8h = 10:00 台灣（到 runHour）
let prevCfg, prevState, prevLog;
let passed = 0;
const t = (n, fn) => { fn(); passed++; console.log('  ✓', n); };

async function setCfg(v) { await sb.from('system_settings').upsert({ key: ER.SETTINGS_KEY, value: v, updated_at: new Date().toISOString() }); }

async function main() {
  console.log('maybeRunDaily 排程 gating 測試');
  const { data: c0 } = await sb.from('system_settings').select('value').eq('key', ER.SETTINGS_KEY).maybeSingle();
  const { data: s0 } = await sb.from('system_settings').select('value').eq('key', ER.STATE_KEY).maybeSingle();
  const { data: g0 } = await sb.from('system_settings').select('value').eq('key', ER.LOG_KEY).maybeSingle();
  prevCfg = c0 ? c0.value : undefined; prevState = s0 ? s0.value : undefined; prevLog = g0 ? g0.value : undefined;

  // ① 功能關閉 → skipped disabled
  await setCfg({ enabled: false });
  const r0 = await ER.maybeRunDaily({ nowMs: AT_10, pushFn: noPush });
  t('關閉時 → skipped disabled（不發送）', () => assert.equal(r0.skipped, 'disabled'));

  // 啟用、清狀態
  await setCfg({ enabled: true, daysBefore: 100, windowDays: 7, runHour: 10 });
  await sb.from('system_settings').delete().eq('key', ER.STATE_KEY);

  // ② 未到執行時 → skipped before_run_hour
  const r1 = await ER.maybeRunDaily({ nowMs: AT_08, pushFn: noPush });
  t('未到執行時（08<10）→ skipped before_run_hour', () => assert.equal(r1.skipped, 'before_run_hour'));

  // ③ 到執行時、當天首次 → ran，並記 lastRun
  const r2 = await ER.maybeRunDaily({ nowMs: AT_10, pushFn: noPush });
  t('到執行時首次 → ran', () => assert.equal(r2.ran, true));
  const { data: st } = await sb.from('system_settings').select('value').eq('key', ER.STATE_KEY).single();
  t('已記錄 lastRun = 當天', () => assert.equal(st.value.lastRun, '2026-09-30'));

  // ④ 同一天再呼叫 → skipped already_ran
  const r3 = await ER.maybeRunDaily({ nowMs: AT_10, pushFn: noPush });
  t('同日再呼叫 → skipped already_ran', () => assert.equal(r3.skipped, 'already_ran'));

  console.log(`\n通過 ${passed} 項\n`);
}

async function cleanup() {
  try {
    if (prevCfg === undefined) await sb.from('system_settings').delete().eq('key', ER.SETTINGS_KEY);
    else await sb.from('system_settings').upsert({ key: ER.SETTINGS_KEY, value: prevCfg, updated_at: new Date().toISOString() });
    if (prevState === undefined) await sb.from('system_settings').delete().eq('key', ER.STATE_KEY);
    else await sb.from('system_settings').upsert({ key: ER.STATE_KEY, value: prevState, updated_at: new Date().toISOString() });
    if (prevLog === undefined) await sb.from('system_settings').delete().eq('key', ER.LOG_KEY);
    else await sb.from('system_settings').upsert({ key: ER.LOG_KEY, value: prevLog, updated_at: new Date().toISOString() });
  } catch {}
}

main().then(cleanup).catch(async (e) => { await cleanup(); console.error('排程測試失敗:', e.message); process.exit(1); });
