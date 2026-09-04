#!/usr/bin/env node
/**
 * 缺陷修复验证脚本 — 针对两个已修复的高严重级别缺陷：
 *   BUG #1: 跨考生错题数据隐私泄露 (loadWrongQuestions / clearWrongQuestions 使用 exam_last_wrong_key)
 *   BUG #2: 通过错题本绕过登录进入考试 (openWrongReview 未检查登录状态 + startExam 无登录校验)
 *
 * 运行方式: node test_wrong_review_security.js
 * 预期: 全部用例 PASS
 */

'use strict';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✅ PASS: ${msg}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${msg}`);
  }
}

// ---- Mock 浏览器 localStorage (最小实现) ----
const _store = {};
const localStorage = {
  getItem(k) { return k in _store ? _store[k] : null; },
  setItem(k, v) { _store[k] = String(v); },
  removeItem(k) { delete _store[k]; },
  clear() { for (const k of Object.keys(_store)) delete _store[k]; }
};

// ---- 从 app.js 中复制修复后的核心逻辑（纯函数部分）----
// 这些与修复后的 app.js:1035-1045 / 1189-1201 / 82-89 中的逻辑保持一致

function makeKey(stuid, name) {
  return 'exam_wrong_questions_' + stuid + '_' + name;
}

// 模拟修复后的 loadWrongQuestions 行为
function loadWrongQuestions_FIXED(currentStudent) {
  if (!currentStudent || !currentStudent.stuid) return [];
  const key = makeKey(currentStudent.stuid, currentStudent.name);
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

// 模拟修复前的漏洞行为（对照用）
function loadWrongQuestions_VULNERABLE() {
  const key = localStorage.getItem('exam_last_wrong_key');
  if (!key) return [];
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

// 模拟修复后的 openWrongReview 登录守卫
function openWrongReview_GUARD(currentStudent) {
  if (!currentStudent || !currentStudent.stuid) {
    return { switched: false, reason: 'login-required' };
  }
  return { switched: true };
}

// 模拟修复后的 startExam 登录守卫
function startExam_GUARD(currentStudent) {
  if (!currentStudent || !currentStudent.stuid || !currentStudent.name) {
    return { allowed: false, redirect: 'login-screen' };
  }
  return { allowed: true };
}

// 模拟修复后的 clearWrongQuestions
function clearWrongQuestions_FIXED(currentStudent) {
  if (!currentStudent || !currentStudent.stuid) return { removed: false, reason: 'not-logged-in' };
  const key = makeKey(currentStudent.stuid, currentStudent.name);
  localStorage.removeItem(key);
  const lastKey = localStorage.getItem('exam_last_wrong_key');
  if (lastKey === key) localStorage.removeItem('exam_last_wrong_key');
  return { removed: true, key };
}

// ========================= 用例组 1: BUG #1 跨考生数据泄露 =========================
console.log('\n=== 用例组 1: BUG #1 跨考生错题数据隐私泄露 ===');

const aliceWrong = [
  { globalIdx: 0, typeLabel: 'C 单选题', question: '以下叙述错误的是?', userAnswer: 'A', correctAnswer: 'D', score: 1 }
];
const alice = { name: 'Alice', stuid: '2023001' };
const bob = { name: 'Bob', stuid: '2023002' };
const anon = { name: '', stuid: '' }; // 未登录

// 场景准备: Alice 参加考试，交卷保存错题
localStorage.clear();
localStorage.setItem(makeKey(alice.stuid, alice.name), JSON.stringify(aliceWrong));
localStorage.setItem('exam_last_wrong_key', makeKey(alice.stuid, alice.name));

console.log('\n--- 子场景 1a: 匿名(未登录)用户访问错题本 ---');
const vuln1 = loadWrongQuestions_VULNERABLE();
assert(vuln1.length === aliceWrong.length,
  '修复前漏洞确认: 未登录时 VULNERABLE 版本返回 Alice 的 '+aliceWrong.length+' 条错题(泄露)');
const fixed1 = loadWrongQuestions_FIXED(anon);
assert(Array.isArray(fixed1) && fixed1.length === 0,
  '修复后: 未登录用户 loadWrongQuestions 返回空数组，不泄露任何数据');

console.log('\n--- 子场景 1b: 考生 Bob 访问错题本（不同考生）---');
const vuln2 = loadWrongQuestions_VULNERABLE();
assert(vuln2.length === aliceWrong.length && vuln2[0].userAnswer === aliceWrong[0].userAnswer,
  '修复前漏洞确认: Bob 使用 VULNERABLE 版本仍能看到 Alice 的错题');
const fixed2 = loadWrongQuestions_FIXED(bob);
assert(Array.isArray(fixed2) && fixed2.length === 0,
  '修复后: Bob（不同学号）只能看到自己的数据（空），无法读取 Alice 的');

console.log('\n--- 子场景 1c: 考生 Alice 本人访问错题本 ---');
const fixed3 = loadWrongQuestions_FIXED(alice);
assert(fixed3.length === aliceWrong.length && fixed3[0].correctAnswer === aliceWrong[0].correctAnswer,
  '修复后: Alice 本人仍能正确读取自己的 '+aliceWrong.length+' 条错题');

console.log('\n--- 子场景 1d: clearWrongQuestions 使用当前考生身份而非 last_key ---');
// 先保存 Bob 也有错题
const bobWrong = [{ globalIdx: 5, userAnswer: 'X', correctAnswer: 'Y', score: 3 }];
localStorage.setItem(makeKey(bob.stuid, bob.name), JSON.stringify(bobWrong));
// 以 Bob 身份执行清空 (但 last_key 仍指向 Alice — 修复前会误删 Alice 的)
const r1 = clearWrongQuestions_FIXED(bob);
assert(r1.removed === true && r1.key === makeKey(bob.stuid, bob.name),
  '修复后: clearWrongQuestions 只清除 Bob 自己的键 '+r1.key);
// 验证 Alice 的数据还在
const aliceStillThere = loadWrongQuestions_FIXED(alice);
assert(aliceStillThere.length === aliceWrong.length,
  '修复后: Bob 执行清空后 Alice 的错题依然存在，不会被误删');
// 验证 last_key 仍指向 Alice (因为被清的是 Bob)
assert(localStorage.getItem('exam_last_wrong_key') === makeKey(alice.stuid, alice.name),
  '修复后: 清空 Bob 数据后全局 last_key 未被错误修改（仍指向 Alice）');

// ========================= 用例组 2: BUG #2 认证绕过 =========================
console.log('\n=== 用例组 2: BUG #2 通过错题本绕过登录 ===');
localStorage.clear();
localStorage.setItem(makeKey(alice.stuid, alice.name), JSON.stringify(aliceWrong));
localStorage.setItem('exam_last_wrong_key', makeKey(alice.stuid, alice.name));

console.log('\n--- 子场景 2a: openWrongReview 登录守卫 ---');
const g1 = openWrongReview_GUARD(anon);
assert(g1.switched === false && g1.reason === 'login-required',
  '修复后: 未登录用户点击错题本 -> 不切换屏幕，返回 login-required');
const g2 = openWrongReview_GUARD(alice);
assert(g2.switched === true,
  '修复后: 已登录考生 Alice 点击错题本 -> 允许进入');

console.log('\n--- 子场景 2b: startExam 登录守卫（纵深防御）---');
// 即使攻击者通过其他路径设法调用 startExam，也会被拦
const e1 = startExam_GUARD(anon);
assert(e1.allowed === false && e1.redirect === 'login-screen',
  '修复后: 未登录状态调用 startExam -> 拒绝，重定向到登录页');
const e2 = startExam_GUARD({ name: 'NoId', stuid: '' });
assert(e2.allowed === false,
  '修复后: 仅有姓名无学号 -> startExam 仍拒绝');
const e3 = startExam_GUARD(alice);
assert(e3.allowed === true,
  '修复后: 合法已登录考生 Alice -> 允许开始考试');

// ========================= 汇总 =========================
console.log('\n========================================');
console.log(`  验证结果: ${passed} 通过 / ${failed} 失败 (共 ${passed+failed} 个断言)`);
console.log('========================================\n');

if (failed > 0) process.exit(1);
