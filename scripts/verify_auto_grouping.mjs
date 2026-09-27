#!/usr/bin/env node
// 散客自動併組 唯一綠燈：後端語法 + 單元/整合測試 + 前端 build。任一步非 0 ⇒ 整體失敗。
import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const steps = [];
function run(label, cmd, opts = {}) {
  process.stdout.write(`\n▶ ${label}\n`);
  try {
    execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });
    steps.push([label, true]);
  } catch (e) {
    steps.push([label, false]);
  }
}

// ① 後端語法
run('node -c index.js', 'node -c index.js');

// ② 測試（test/auto_grouping/*.test.mjs），逐支跑；integration 需 env（.env 存在才跑）
const testDir = path.join(root, 'test', 'auto_grouping');
let tests = [];
try { tests = readdirSync(testDir).filter(f => f.endsWith('.test.mjs')).sort(); } catch { /* 尚無 */ }
for (const f of tests) run(`test ${f}`, `node test/auto_grouping/${f}`);

// ③ 前端 build（可用 SKIP_BUILD=1 略過以加速迭代）
if (process.env.SKIP_BUILD === '1') {
  process.stdout.write('\n▶ (略過前端 build：SKIP_BUILD=1)\n');
} else {
  run('client vite build', 'npx vite build', { cwd: path.join(root, 'client') });
}

// 看板
console.log('\n──────── verify 看板 ────────');
let allOk = true;
for (const [label, ok] of steps) { console.log(`  ${ok ? '✅' : '❌'} ${label}`); if (!ok) allOk = false; }
console.log('────────────────────────────');
console.log(allOk ? '綠燈 ✅ 全數通過' : '紅燈 ❌ 有步驟失敗');
process.exit(allOk ? 0 : 1);
