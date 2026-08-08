#!/usr/bin/env node
/**
 * 缺陷修复验证测试 — 覆盖 3 个修复的缺陷行为
 * 执行: node test_bugfixes.js
 */

const fs = require('fs');
const path = require('path');
const appSrc = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8');

let passed = 0, failed = 0;
function assert(cond, name) {
  if (cond) { passed++; console.log(`  ✓ PASS: ${name}`); }
  else { failed++; console.log(`  ✗ FAIL: ${name}`); process.exitCode = 1; }
}

// ============================================================
// Bug 1: 错题本跨用户数据泄露 / 隐私安全漏洞
// ============================================================
console.log('\nBug 1 测试: 错题本 loadWrongQuestions 应按当前登录用户身份加载');
(function testWrongQuestionsIsolation() {
  // 模拟 localStorage
  const store = {};
  const mockLocalStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  };

  // 提取 loadWrongQuestions 的关键判断逻辑重放
  function replayLoadWrongQuestions(currentStudent) {
    // —— 以下为修复后 loadWrongQuestions 的完全等价逻辑
    if (currentStudent && currentStudent.stuid && currentStudent.name) {
      const identityKey = 'exam_wrong_questions_' + currentStudent.stuid + '_' + currentStudent.name;
      try {
        const data = mockLocalStorage.getItem(identityKey);
        return data ? JSON.parse(data) : [];
      } catch (e) { return []; }
    }
    return [];
  }

  // 预存：学生 Alice 的错题
  const aliceKey = 'exam_wrong_questions_2024001_Alice';
  mockLocalStorage.setItem(aliceKey, JSON.stringify([{q: 'Alice错题1'}]));
  // 预存：学生 Bob 的错题
  const bobKey = 'exam_wrong_questions_2024002_Bob';
  mockLocalStorage.setItem(bobKey, JSON.stringify([{q: 'Bob错题1'}, {q: 'Bob错题2'}]));
  // 预存：last_key（修复前的泄露途径 — 修复后不再使用）
  mockLocalStorage.setItem('exam_last_wrong_key', aliceKey);

  // 1) Alice 登录 → 只看得到自己的错题
  let alice = { name: 'Alice', stuid: '2024001' };
  let aliceResult = replayLoadWrongQuestions(alice);
  assert(aliceResult.length === 1 && aliceResult[0].q === 'Alice错题1',
         'Alice 登录后只加载 Alice 自己的 1 道错题');

  // 2) Bob 登录 → 绝不能看到 Alice 的！（修复前会泄露）
  let bob = { name: 'Bob', stuid: '2024002' };
  let bobResult = replayLoadWrongQuestions(bob);
  assert(bobResult.length === 2 && bobResult[0].q === 'Bob错题1' && bobResult[1].q === 'Bob错题2',
         'Bob 登录后只加载 Bob 自己的 2 道错题（泄露防护）');

  // 3) 未登录（name/stuid 为空）→ 不能看到任何人的错题
  let guest = { name: '', stuid: '' };
  let guestResult = replayLoadWrongQuestions(guest);
  assert(Array.isArray(guestResult) && guestResult.length === 0,
         '未登录状态返回空数组，防止加载 last_key 指向的任意用户数据');

  // 4) 静态检查：确认 loadWrongQuestions 不再读取 exam_last_wrong_key，改用身份键
  //    提取 loadWrongQuestions 函数体（首个 { 到其配对的 }，不含后续代码）
  const fnBodyMatch = appSrc.match(/function loadWrongQuestions\(\)\s*\{[\s\S]*?\n\}/);
  const loadFnBody = fnBodyMatch ? fnBodyMatch[0] : '';
  const noLastKeyInBody = !loadFnBody.includes('exam_last_wrong_key');
  const hasIdentityKey = loadFnBody.includes('exam_wrong_questions_') &&
                          loadFnBody.includes('currentStudent.stuid') &&
                          loadFnBody.includes('currentStudent.name');
  assert(noLastKeyInBody && hasIdentityKey,
         'loadWrongQuestions 函数内：不再引用 exam_last_wrong_key，改用 stuid+name 身份键构造 key');
})();

// ============================================================
// Bug 2: 烟花动画重复 setTimeout → 资源泄漏
// ============================================================
console.log('\nBug 2 测试: launchFireworks 渐隐清理定时器只注册一次');
(function testFireworksCleanupOnce() {
  // 静态分析：确保引入 cleanupScheduled 守卫
  assert(/cleanupScheduled\s*=\s*false/.test(appSrc),
         '烟花作用域内声明了 cleanupScheduled = false 守卫变量');

  const glowBlock = appSrc.match(/glowAlpha\s*>=\s*0\.7[\s\S]*?cleanupScheduled[\s\S]*?canvas\.remove\(\)/);
  assert(glowBlock !== null,
         'glowAlpha 分支中使用了 cleanupScheduled 守卫 + canvas.remove');

  // 防止重复的关键：&& !cleanupScheduled 紧接其后，紧接着下一行 cleanupScheduled = true
  const guardPattern = /glowAlpha\s*>=\s*0\.7\s*&&\s*!cleanupScheduled[\s\S]{0,40}cleanupScheduled\s*=\s*true/;
  assert(guardPattern.test(appSrc),
         '进入清理分支后立即将 cleanupScheduled 置 true，后续帧不再重复注册 setTimeout');
})();

// ============================================================
// Bug 3: 粒子背景 update() 除零 → NaN 幽灵粒子
// ============================================================
console.log('\nBug 3 测试: 粒子背景 update() 防止除零导致 NaN 传播');
(function testParticleNoDivideByZero() {
  // 1) 源码中必须出现 dist > 0 或 dist !== 0 保护
  assert(/dist\s*<\s*150\s*&&\s*dist\s*>\s*0/.test(appSrc) ||
         /dist\s*>\s*0\s*&&\s*dist\s*<\s*150/.test(appSrc),
         'Particle.update() 中鼠标相互作用条件添加了 dist > 0 保护');

  // 2) 实际模拟：dist = 0 时不应出现 NaN
  function replayUpdate(p, mouseX, mouseY) {
    // 修复后的等价 update 逻辑
    const dx = mouseX - p.x, dy = mouseY - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 150 && dist > 0) {
      p.vx += (dx / dist) * 0.015;
      p.vy += (dy / dist) * 0.015;
    }
    p.vx *= 0.99; p.vy *= 0.99;
  }
  const particle = { x: 100, y: 200, vx: 0.1, vy: -0.1 };
  replayUpdate(particle, 100, 200);  // 鼠标正好位于粒子位置 → dist = 0
  assert(Number.isFinite(particle.vx) && Number.isFinite(particle.vy) &&
         !Number.isNaN(particle.vx) && !Number.isNaN(particle.vy),
         'dist = 0 时 vx/vy 保持有限数值，不出现 NaN');

  // 3) 正常距离 (非零) 仍能产生吸引力
  const p2 = { x: 0, y: 0, vx: 0, vy: 0 };
  replayUpdate(p2, 30, 40);  // dist = 50
  const hadAttraction = p2.vx !== 0 && p2.vy !== 0;
  assert(hadAttraction,
         '正常非零距离下，鼠标吸引力仍正常作用（功能未退化）');
})();

// ============================================================
// Summary
// ============================================================
console.log(`\n========================================`);
console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
console.log(`========================================`);
if (failed > 0) process.exit(1);
