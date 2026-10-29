// 整合測試（連 .env 的 Supabase）：建測試會員 → 改名 → 驗紀錄/同步保護/錯誤處理 → 清除。
// node test/member_name_edit/run_integration.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config({ quiet: true });
const MNE = require('../../services/MemberNameEdit.js');
const { buildUserRow } = require('../../scripts/syncUsers.js');

const TEST_PHONE = '0999000111';
const db = MNE.sb();
let userId = null;
let logRowExisted = false;
let passed = 0;
const t = async (n, fn) => { await fn(); passed++; console.log('  ✓', n); };

async function cleanup() {
  const { data: row } = await db.from('system_settings').select('value').eq('key', MNE.LOG_KEY).maybeSingle();
  if (row && userId) {
    const { [userId]: _removed, ...rest } = row.value || {};
    if (!logRowExisted && Object.keys(rest).length === 0) {
      await db.from('system_settings').delete().eq('key', MNE.LOG_KEY);
    } else {
      await db.from('system_settings').update({ value: rest, updated_at: new Date().toISOString() }).eq('key', MNE.LOG_KEY);
    }
  }
  await db.from('users').delete().eq('phone', TEST_PHONE);
}

async function main() {
  console.log('MemberNameEdit 整合測試');
  const { data: existing } = await db.from('users').select('id').eq('phone', TEST_PHONE);
  assert.equal(existing.length, 0, '測試電話已存在，中止以免動到真實資料');
  const { data: logRow } = await db.from('system_settings').select('key').eq('key', MNE.LOG_KEY).maybeSingle();
  logRowExisted = Boolean(logRow);

  const { data: created, error } = await db.from('users').insert({ phone: TEST_PHONE, display_name: '測試改名甲' }).select('id').single();
  if (error) throw error;
  userId = created.id;

  await t('改名成功、回傳新名字與紀錄', async () => {
    const r = await MNE.renameMember({ userId, newName: '  測試改名乙 ', operator: '測試員' });
    assert.equal(r.user.display_name, '測試改名乙');
    assert.equal(r.entry.from, '測試改名甲');
    assert.equal(r.entry.operator, '測試員');
    const { data: u } = await db.from('users').select('display_name').eq('id', userId).single();
    assert.equal(u.display_name, '測試改名乙');
  });

  await t('紀錄寫入 system_settings，且電話列入同步保護', async () => {
    const log = await MNE.getEditLog();
    assert.equal(log[userId].length, 1);
    assert.equal(log[userId][0].to, '測試改名乙');
    assert.equal(log[userId][0].phone, TEST_PHONE);
    assert.ok((await MNE.getNameLockedPhones()).has(TEST_PHONE));
  });

  await t('第二次改名：紀錄累加', async () => {
    await MNE.renameMember({ userId, newName: '測試改名丙', operator: '測試員' });
    const log = await MNE.getEditLog();
    assert.deepEqual(log[userId].map(e => e.to), ['測試改名乙', '測試改名丙']);
  });

  await t('同名、空白、不存在的會員 → 對應錯誤碼，名字不變', async () => {
    await assert.rejects(MNE.renameMember({ userId, newName: '測試改名丙' }), { code: 'SAME_NAME', status: 400 });
    await assert.rejects(MNE.renameMember({ userId, newName: '  ' }), { code: 'INVALID_NAME', status: 400 });
    await assert.rejects(MNE.renameMember({ userId: '00000000-0000-0000-0000-000000000000', newName: '某人' }), { code: 'NOT_FOUND', status: 404 });
    await assert.rejects(MNE.renameMember({ userId: 'not-a-uuid', newName: '某人' }), { code: 'NOT_FOUND', status: 404 });
    const { data: u } = await db.from('users').select('display_name').eq('id', userId).single();
    assert.equal(u.display_name, '測試改名丙');
  });

  await t('同步 upsert：保護中的電話不覆蓋名字、其他欄位照常更新', async () => {
    const row = buildUserRow({ phone: TEST_PHONE, name: '試算表舊名', golferType: '來賓' }, await MNE.getNameLockedPhones());
    const { error: upErr } = await db.from('users').upsert(row, { onConflict: 'phone' });
    if (upErr) throw upErr;
    const { data: u } = await db.from('users').select('display_name, golfer_type').eq('id', userId).single();
    assert.equal(u.display_name, '測試改名丙');
    assert.equal(u.golfer_type, '來賓');
  });

  await t('對照：沒保護時同步會覆蓋名字（確認測試抓得到差異）', async () => {
    const row = buildUserRow({ phone: TEST_PHONE, name: '試算表舊名' }, new Set());
    await db.from('users').upsert(row, { onConflict: 'phone' });
    const { data: u } = await db.from('users').select('display_name').eq('id', userId).single();
    assert.equal(u.display_name, '試算表舊名');
  });
}

main()
  .then(() => console.log(`\n${passed} 項通過`))
  .catch(e => { console.error('✗ 失敗:', e); process.exitCode = 1; })
  .finally(async () => {
    await cleanup();
    const { data: left } = await db.from('users').select('id').eq('phone', TEST_PHONE);
    const { data: logLeft } = await db.from('system_settings').select('value').eq('key', MNE.LOG_KEY).maybeSingle();
    console.log('清除後：測試會員', left.length, '筆；改名紀錄', logLeft ? Object.keys(logLeft.value).length + ' 位' : '不存在');
  });
