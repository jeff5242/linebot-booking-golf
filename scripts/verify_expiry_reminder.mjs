#!/usr/bin/env node
// 票券到期提醒 唯一綠燈：後端語法 + 單元/整合測試 (+ 前端 build)。任一步非 0 ⇒ 整體失敗。
import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const steps = [];
function run(label, cmd, opts = {}) {
  process.stdout.write(`\n▶ ${label}\n`);
  try { execSync(cmd, { cwd: root, stdio: 'inherit', ...opts }); steps.push([label, true]); }
  catch { steps.push([label, false]); }
}

run('node -c index.js', 'node -c index.js');

const testDir = path.join(root, 'test', 'expiry_reminder');
let tests = [];
try { tests = readdirSync(testDir).filter(f => f.endsWith('.test.mjs')).sort(); } catch {}
for (const f of tests) run(`test ${f}`, `node test/expiry_reminder/${f}`);

if (process.env.SKIP_BUILD === '1') process.stdout.write('\n▶ (略過前端 build：SKIP_BUILD=1)\n');
else run('client vite build', 'npx vite build', { cwd: path.join(root, 'client') });

console.log('\n──────── verify 看板 ────────');
let ok = true;
for (const [l, s] of steps) { console.log(`  ${s ? '✅' : '❌'} ${l}`); if (!s) ok = false; }
console.log(ok ? '綠燈 ✅ 全數通過' : '紅燈 ❌ 有步驟失敗');
process.exit(ok ? 0 : 1);
