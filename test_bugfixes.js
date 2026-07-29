#!/usr/bin/env node
/**
 * 关键 Bug 修复验证测试
 * 运行方式: node test_bugfixes.js
 *
 * 测试覆盖:
 *   Bug #1: saveScoreRecord 在 localStorage 异常时不应抛出 (避免判分崩溃)
 *   Bug #2: confirmSubmit / autoSubmit 必须调用 saveCurrentAnswers 做最终答案同步
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ===== 读取 app.js 源码 =====
const APP_SRC = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
    passed++;
  } catch (err) {
    console.log('  ✗', name);
    console.log('    Error:', err.message);
    failed++;
  }
}

function assertContains(src, substring, msg) {
  if (!src.includes(substring)) {
    throw new Error(msg + ` — 未能在源码中找到: "${substring}"`);
  }
}

console.log('\n== Bug #1: saveScoreRecord 容错性 (防止 localStorage 异常导致判分崩溃) ==');

test('saveScoreRecord 函数体包含 try/catch 包裹', () => {
  // 匹配 saveScoreRecord 内部结构: try { ... localStorage.setItem ... } catch
  const fnMatch = APP_SRC.match(/function\s+saveScoreRecord\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
  assert(fnMatch, '找不到 saveScoreRecord 函数定义');
  const fnBody = fnMatch[0];
  assertContains(fnBody, 'try {', '缺少 try 块');
  assertContains(fnBody, 'localStorage.setItem', '缺少 setItem 调用');
  assertContains(fnBody, 'catch', '缺少 catch 块');
});

test('saveScoreRecord 异常时不向上抛出 (模拟隐私模式/配额超限)', () => {
  // 模拟带 localStorage 抛出异常的执行环境
  const sandbox = {
    localStorage: {
      getItem() { return null; },
      setItem() { throw new Error('QuotaExceededError: 存储已满'); }
    },
    JSON: JSON
  };
  // 从源码中提取 saveScoreRecord 函数并在沙箱中执行
  const extracted =
    'var localStorage = sandbox.localStorage;' +
    'var JSON = sandbox.JSON;' +
    APP_SRC.match(/function\s+getScoreHistory[\s\S]*?\n\}/)[0] + '\n' +
    APP_SRC.match(/function\s+saveScoreRecord[\s\S]*?\n\}\s*\n/)[0] + '\n' +
    'saveScoreRecord({name:"测试",stuid:"001",score:80,time:new Date().toISOString()});';
  // 不抛出即通过
  new Function('sandbox', extracted)(sandbox);
});

console.log('\n== Bug #2: 提交流程必须调用 saveCurrentAnswers 做最终 DOM→内存同步 ==');

test('confirmSubmit 调用序列包含 saveCurrentAnswers', () => {
  // 匹配 confirmSubmit 函数整行
  const m = APP_SRC.match(/function\s+confirmSubmit\s*\([^)]*\)\s*\{[^}]*\}/);
  assert(m, '找不到 confirmSubmit 函数');
  assertContains(m[0], 'saveCurrentAnswers()',
    'confirmSubmit 未调用 saveCurrentAnswers，最后一题答案可能在自动/确认提交时丢失');
});

test('autoSubmit 调用序列包含 saveCurrentAnswers', () => {
  const m = APP_SRC.match(/function\s+autoSubmit\s*\([^)]*\)\s*\{[^}]*\}/);
  assert(m, '找不到 autoSubmit 函数');
  assertContains(m[0], 'saveCurrentAnswers()',
    'autoSubmit 未调用 saveCurrentAnswers，时间耗尽时最后一题最新答案可能未计入判分');
});

test('confirmSubmit / autoSubmit 调用顺序: saveCurrentAnswers → clearInterval → gradeExam', () => {
  // 确保顺序正确：先同步答案，再清计时器，再判分
  const lines = APP_SRC.split('\n');
  for (const line of lines) {
    if (line.includes('function confirmSubmit()') || line.includes('function autoSubmit()')) {
      const saveIdx = line.indexOf('saveCurrentAnswers()');
      const clearIdx = line.indexOf('clearInterval');
      const gradeIdx = line.indexOf('gradeExam()');
      if (saveIdx !== -1 && clearIdx !== -1 && gradeIdx !== -1) {
        assert(saveIdx < clearIdx && clearIdx < gradeIdx,
          '调用顺序错误，应为 saveCurrentAnswers → clearInterval → gradeExam');
      }
    }
  }
});

console.log('\n== 附加: gradeExam 调用 saveScoreRecord 后仍会执行 showResult (崩溃后恢复) ==');

test('gradeExam 中 saveScoreRecord 之后存在 showResult 调用', () => {
  // 我们要确保 gradeExam 的流程中 saveScoreRecord 之后还有 showResult，而 saveScoreRecord 现在已被 try/catch 包裹
  const gradeExamMatch = APP_SRC.match(/function\s+gradeExam\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n/);
  assert(gradeExamMatch, '找不到 gradeExam 函数');
  const fnBody = gradeExamMatch[0];
  const savePos = fnBody.indexOf('saveScoreRecord(');
  const showPos = fnBody.indexOf('showResult()');
  assert(savePos !== -1 && showPos !== -1, 'gradeExam 内部缺少 saveScoreRecord 或 showResult 调用');
  assert(savePos < showPos, 'saveScoreRecord 应在 showResult 之前调用');
});

// ===== 汇总 =====
console.log(`\n========================================`);
console.log(`  通过: ${passed}  失败: ${failed}`);
console.log(`========================================`);
if (failed > 0) {
  console.log('\n存在失败测试，请修复后重新运行。');
  process.exit(1);
} else {
  console.log('\n全部通过 — 修复有效。');
  process.exit(0);
}
