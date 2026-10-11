// 整合測試：ExpiryReminder.run（正式 DB、測試帳號、mock 推播不打 LINE、跑完清＋還原設定）
// node test/expiry_reminder/run_integration.test.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');
const ER = require('../../services/ExpiryReminder.js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const uid = crypto.randomUUID();
const lineId = 'TEST_LINE_' + uid.slice(0, 8);
const TODAY = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);       // 台灣今天
const EXPIRY = new Date(Date.now() + 8 * 3600 * 1000 + 100 * 86400000).toISOString().slice(0, 10); // +100 天
let prevCfg, prevLog;
let passed = 0;
const t = (n, fn) => { fn(); passed++; console.log('  ✓', n); };

async function main() {
  console.log(`ExpiryReminder.run 整合測試（today=${TODAY}, expiry=${EXPIRY}）`);

  // 快照設定與紀錄
  const { data: c0 } = await sb.from('system_settings').select('value').eq('key', ER.SETTINGS_KEY).maybeSingle();
  const { data: l0 } = await sb.from('system_settings').select('value').eq('key', ER.LOG_KEY).maybeSingle();
  prevCfg = c0 ? c0.value : undefined; prevLog = l0 ? l0.value : undefined;

  // 種測試會員（有綁 LINE）＋ 一批 today+100 到期的數位果嶺券（2 張）
  await sb.from('users').insert({ id: uid, display_name: '【測試】到期提醒', phone: '09' + String(Date.now()).slice(-8), line_user_id: lineId });
  await sb.from('vouchers').insert([0, 1].map(() => ({
    code: 'GF-' + crypto.randomBytes(4).toString('hex'), product_id: 0, product_name: '果嶺券', user_id: uid,
    status: 'active', source_type: 'digital_purchase', price: 200, valid_until: `${EXPIRY}T00:00:00+00:00`,
  })));

  // 啟用設定、清空紀錄
  await sb.from('system_settings').upsert({ key: ER.SETTINGS_KEY, value: { enabled: true, daysBefore: 100, windowDays: 7 }, updated_at: new Date().toISOString() });
  await sb.from('system_settings').upsert({ key: ER.LOG_KEY, value: {}, updated_at: new Date().toISOString() });

  // ① dry-run：試算應含測試會員、且不發送
  const dry = await ER.run({ dryRun: true, todayStr: TODAY });
  t('dry-run：試算包含測試會員（100天、2張）', () => {
    assert.equal(dry.enabled, true);
    const mine = dry.sample.find(s => s.name === '【測試】到期提醒');
    assert.ok(mine, '應含測試會員');
    assert.equal(mine.daysLeft, 100);
    assert.equal(mine.count, 2);
  });

  // ② 實際執行（注入 mock 推播，不打 LINE）：發 1 則、記錄去重
  const calls = [];
  const mockPush = async (id, text) => { calls.push({ id, text }); return { success: true }; };
  const r1 = await ER.run({ dryRun: false, todayStr: TODAY, pushFn: mockPush });
  t('執行：對測試會員推播 1 則（個人化文字含到期日）', () => {
    assert.ok(r1.sent >= 1);
    const mine = calls.find(c => c.id === lineId);
    assert.ok(mine, '應推播給測試會員');
    assert.ok(mine.text.includes(EXPIRY), '訊息含到期日');
    assert.ok(mine.text.includes('2'), '訊息含張數');
  });

  // ③ 再跑一次：已提醒過 → 去重，不再對測試會員發
  const calls2 = [];
  const r2 = await ER.run({ dryRun: false, todayStr: TODAY, pushFn: async (id, text) => { calls2.push(id); return { success: true }; } });
  t('去重：第二次執行不再對已提醒會員發送', () => {
    assert.ok(!calls2.includes(lineId), '不應重複推播');
  });

  console.log(`\n通過 ${passed} 項\n`);
}

async function cleanup() {
  try { await sb.from('vouchers').delete().eq('user_id', uid); } catch {}
  try { await sb.from('users').delete().eq('id', uid); } catch {}
  try {
    if (prevCfg === undefined) await sb.from('system_settings').delete().eq('key', ER.SETTINGS_KEY);
    else await sb.from('system_settings').upsert({ key: ER.SETTINGS_KEY, value: prevCfg, updated_at: new Date().toISOString() });
    if (prevLog === undefined) await sb.from('system_settings').delete().eq('key', ER.LOG_KEY);
    else await sb.from('system_settings').upsert({ key: ER.LOG_KEY, value: prevLog, updated_at: new Date().toISOString() });
  } catch {}
}

main().then(cleanup).catch(async (e) => { await cleanup(); console.error('整合測試失敗:', e.message); process.exit(1); });
