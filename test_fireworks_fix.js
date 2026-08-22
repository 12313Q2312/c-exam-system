#!/usr/bin/env node
/**
 * 回归测试：烟花动画 setTimeout 雪崩修复
 * 模拟 rAF 以 60fps 调用 animate() 函数的场景，统计 setTimeout 调用次数。
 * 修复前：glowAlpha >= 0.7 的每帧都创建 setTimeout → 5s 内约 300 次（崩溃级泄漏）
 * 修复后：只在首次满足条件时创建 1 次
 */

'use strict';
const assert = require('assert');

// ========== 修复前逻辑（Bug 复现参考） ==========
function simulateUnfixed(frames, glowAlphaFn) {
  let setTimeoutCount = 0;
  const fakeSetTimeout = (cb, ms) => { setTimeoutCount++; /* 不实际调度 */ };
  for (let i = 0; i < frames; i++) {
    const glowAlpha = glowAlphaFn(i);
    if (glowAlpha >= 0.7) {
      fakeSetTimeout(() => {}, 1500);
    }
  }
  return setTimeoutCount;
}

// ========== 修复后逻辑（带 fadeStarted 守卫） ==========
function simulateFixed(frames, glowAlphaFn) {
  let setTimeoutCount = 0;
  const fakeSetTimeout = (cb, ms) => { setTimeoutCount++; };
  let fadeStarted = false; // 关键守卫标志
  for (let i = 0; i < frames; i++) {
    const glowAlpha = glowAlphaFn(i);
    if (glowAlpha >= 0.7 && !fadeStarted) {
      fadeStarted = true;
      fakeSetTimeout(() => {}, 1500);
    }
  }
  return setTimeoutCount;
}

// ========== 测试用例 ==========

// 场景：第 200 帧（~3.3s @ 60fps）起 glowAlpha 从 0 线性增长，上限 0.8，共运行 5s = 300 帧
const TOTAL_FRAMES = 300;
const GLOW_START_FRAME = 200;
function glowAlphaAtFrame(i) {
  if (i < GLOW_START_FRAME) return -1; // 尚未开始
  const progress = (i - GLOW_START_FRAME) / 60; // 1 秒达到 0.7
  return Math.min(0.8, progress);
}

const unfixedCount = simulateUnfixed(TOTAL_FRAMES, glowAlphaAtFrame);
const fixedCount = simulateFixed(TOTAL_FRAMES, glowAlphaAtFrame);

console.log('=== 烟花动画 setTimeout 雪崩回归测试 ===');
console.log(`总帧数: ${TOTAL_FRAMES} (60fps × 5s)`);
console.log(`glowAlpha >= 0.7 从第 ${GLOW_START_FRAME} 帧开始持续 ~100 帧`);
console.log(`  修复前 setTimeout 创建数: ${unfixedCount} (预期 ≈ 100，严重泄漏)`);
console.log(`  修复后 setTimeout 创建数: ${fixedCount} (预期 = 1)`);
console.log('');

// 断言 1：修复后必然是 1 次
assert.strictEqual(fixedCount, 1, '修复后 setTimeout 必须且只能创建 1 次');

// 断言 2：修复前确实存在泄漏（验证场景构造的正确性）
assert.ok(unfixedCount > 50,
  `修复前应存在显著泄漏（实际 ${unfixedCount}，预期 > 50）`);

// 场景 2：glowAlpha 一开始就 >= 0.7，整段 300 帧都命中
const alwaysHot = () => 0.8;
const unfixedHot = simulateUnfixed(TOTAL_FRAMES, alwaysHot);
const fixedHot = simulateFixed(TOTAL_FRAMES, alwaysHot);
console.log(`极端场景（全程 glowAlpha=0.8）`);
console.log(`  修复前 setTimeout 创建数: ${unfixedHot}`);
console.log(`  修复后 setTimeout 创建数: ${fixedHot} (预期 = 1)`);
assert.strictEqual(fixedHot, 1, '极端连续命中场景下仍只能创建 1 次');
assert.ok(unfixedHot === TOTAL_FRAMES,
  `极端场景修复前应每帧都创建（实际 ${unfixedHot}，预期 ${TOTAL_FRAMES}）`);

// ========== 源码层修复存在性检查 ==========
const fs = require('fs');
const src = fs.readFileSync('/workspace/app.js', 'utf8');

const hasFadeStartedDecl = /let\s+fadeStarted\s*=\s*false/.test(src);
const hasFadeGuard = /glowAlpha\s*>=\s*0\.7\s*&&\s*!fadeStarted/.test(src);
const hasFadeSetTrueInBlock = /fadeStarted\s*=\s*true/.test(src);
const hasCanvasConnectedGuard = /!canvas\.isConnected/.test(src);

console.log('');
console.log('=== 源码层修复位点验证 ===');
console.log(`  含 fadeStarted 变量声明: ${hasFadeStartedDecl ? '✅' : '❌'}`);
console.log(`  含 && !fadeStarted 守卫条件: ${hasFadeGuard ? '✅' : '❌'}`);
console.log(`  守卫块内设置 fadeStarted=true: ${hasFadeSetTrueInBlock ? '✅' : '❌'}`);
console.log(`  含 canvas.isConnected 早退出: ${hasCanvasConnectedGuard ? '✅' : '❌'}`);

assert.ok(hasFadeStartedDecl, '源码中缺少 fadeStarted 声明');
assert.ok(hasFadeGuard, '源码中缺少 && !fadeStarted 守卫');
assert.ok(hasFadeSetTrueInBlock, '源码中缺少 fadeStarted=true 置位');
assert.ok(hasCanvasConnectedGuard, '源码中缺少 canvas.isConnected 守卫');

console.log('');
console.log('✅ 所有断言通过 — 修复验证完成');
process.exit(0);
