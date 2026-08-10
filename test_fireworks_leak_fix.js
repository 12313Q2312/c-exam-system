#!/usr/bin/env node
/**
 * 回归测试：烟花动画 setTimeout 泄漏修复
 * 验证：fadeoutScheduled 标志位的"声明 → 检查 → 设置"闭环完整存在
 *
 * 触发缺陷旧行为：glowAlpha >= 0.7 时每帧(≈60fps)重复创建 setTimeout，
 *                 导致内存泄漏、UI卡顿、浏览器崩溃。
 * 修复后正确行为：只在满足条件且尚未调度时，创建唯一的 setTimeout。
 */
const fs = require('fs');
const path = require('path');

function runTests() {
  const appJsPath = path.join(__dirname, 'app.js');
  const src = fs.readFileSync(appJsPath, 'utf8');

  let passed = 0;
  let failed = 0;

  function assert(cond, name) {
    if (cond) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.log(`  ✗ ${name}`);
      failed++;
    }
  }

  console.log('\n== 回归测试：烟花动画 setTimeout 资源泄漏修复 ==\n');

  // 1. 标志位声明存在（作用域在 launchFireworks 内部的 phase2Started 附近）
  assert(
    /let\s+fadeoutScheduled\s*=\s*false\s*;?/.test(src)
      && src.indexOf('fadeoutScheduled') > src.indexOf('phase2Started'),
    '声明：fadeoutScheduled 初始化为 false，且位于 launchFireworks 内 phase2Started 附近'
  );

  // 2. 渐隐调度前有 !fadeoutScheduled 门控检查
  assert(
    /glowAlpha\s*>=\s*0\.7\s*&&\s*!fadeoutScheduled/.test(src),
    '检查：glowAlpha 判定与 !fadeoutScheduled 共同构成渐隐准入条件'
  );

  // 3. 准入后立即设置 fadeoutScheduled = true（紧邻 setTimeout 之前）
  //    查找：准入 if 块首行设置标志位
  const guardPattern = /if\s*\(\s*glowAlpha\s*>=\s*0\.7\s*&&\s*!fadeoutScheduled\s*\)\s*\{[^}]*?fadeoutScheduled\s*=\s*true\s*;?/s;
  assert(
    guardPattern.test(src),
    '设置：进入渐隐分支后，首行将 fadeoutScheduled 置 true，确保后续帧不再重复'
  );

  // 4. 准入 if 块内 setTimeout 之后不应再出现无防护的同类调度
  //    即：除了带 !fadeoutScheduled 守卫的 if 之外，不应再有 glowAlpha>=0.7 → setTimeout 的直连
  const glowLines = src.split('\n').filter(l => l.includes('glowAlpha >= 0.7') || l.includes('glowAlpha>=0.7'));
  const guardedCount = glowLines.filter(l => l.includes('!fadeoutScheduled')).length;
  assert(
    glowLines.length === guardedCount && glowLines.length >= 1,
    '完整性：所有 glowAlpha >= 0.7 渐隐判定均带有 !fadeoutScheduled 守卫，无遗漏直连'
  );

  // 5. 旧漏洞模式不存在：无守卫的 if (glowAlpha >= 0.7) 直接 setTimeout
  const oldVulnerablePattern = /if\s*\(\s*glowAlpha\s*>\s*=\s*0\.7\s*\)\s*\{[\s\S]{0,200}setTimeout\s*\(/;
  // 这里只匹配"没带 && !fadeoutScheduled"的旧模式
  const vulnerableMatch = src.match(/if\s*\(\s*glowAlpha\s*>=\s*0\.7\s*([^)])*\)/g);
  const unguardedExists = vulnerableMatch && vulnerableMatch.some(m => !m.includes('fadeoutScheduled'));
  assert(
    !unguardedExists,
    '消除旧漏洞：不再存在无 fadeoutScheduled 守卫的 glowAlpha 渐隐分支'
  );

  console.log(`\n结果：${passed} 通过，${failed} 失败\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
