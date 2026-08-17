#!/usr/bin/env node
/**
 * 错题本跨用户数据泄漏 Bug — 回归测试
 *
 * 验证：
 * 1. getCurrentStudentWrongKey() — 基于当前学生身份生成 key
 * 2. loadWrongQuestions() — 登录用户只能加载自己的错题，不能泄漏他人数据
 * 3. clearWrongQuestions() 逻辑 — loadedKey 优先，确保只删自己的数据
 *
 * 触发场景（已修复前）：
 *   学生 Alice (stuid:S001,name:Alice) 考完 → 错题保存
 *   学生 Bob   (stuid:S002,name:Bob)   登录 → 点错题本 → 看到 Alice 数据（隐私泄漏）
 *   Bob 点"清空" → Alice 的数据被永久删除（数据丢失）
 */

'use strict';

// ---- Stub localStorage ----
const store = new Map();
global.localStorage = {
  getItem(k) { return store.has(k) ? store.get(k) : null; },
  setItem(k, v) { store.set(k, String(v)); },
  removeItem(k) { store.delete(k); }
};

// ---- Stub DOM helpers (unused but referenced) ----
global.document = {
  getElementById: () => ({
    textContent: '', innerHTML: '', classList: { contains: () => false, add: () => {}, remove: () => {}, toggle: () => {} },
    focus: () => {}, value: '', disabled: false, dataset: {}, style: {},
    querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {},
    removeEventListener: () => {}, createElement: () => ({ textContent: '', innerHTML: '' })
  }),
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => ({ textContent: '' })
};
global.window = { AI_QUESTIONS: [], C_QUESTIONS: { danxuan:[], tiankong:[], program_reading:[], program_fill:[] } };
global.performance = { now: () => Date.now() };
global.switchScreen = () => {};
global.confirm = () => true;
global.escapeHtml = s => String(s);
global.formatProgramQuestion = s => s;
global.renderWrongPageDots = () => {};
global.renderWrongQuestion = () => {};
global.updateWrongPageIndicator = () => {};

// ---- Copy relevant state and functions from app.js ----
let currentStudent = { name: '', stuid: '' };

let wrongReviewState = {
  questions: [],
  currentPage: 0,
  loadedKey: null
};

function getCurrentStudentWrongKey() {
  if (currentStudent && currentStudent.stuid && currentStudent.name) {
    return 'exam_wrong_questions_' + currentStudent.stuid + '_' + currentStudent.name;
  }
  return null;
}

function saveWrongQuestions(wrongQs) {
  const key = getCurrentStudentWrongKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(wrongQs));
    localStorage.setItem('exam_last_wrong_key', key);
  } catch (e) {}
}

function loadWrongQuestions() {
  const ownKey = getCurrentStudentWrongKey();
  let key;
  if (ownKey) {
    key = ownKey;
  } else {
    key = localStorage.getItem('exam_last_wrong_key');
  }
  if (!key) { wrongReviewState.loadedKey = null; return []; }
  wrongReviewState.loadedKey = key;
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function openWrongReview() {
  const wrongQs = loadWrongQuestions();
  const loadedKey = wrongReviewState.loadedKey;
  if (!wrongQs || wrongQs.length === 0) {
    wrongReviewState = { questions: [], currentPage: 0, loadedKey: loadedKey };
    return { loaded: 0, loadedKey };
  }
  wrongReviewState = {
    questions: wrongQs,
    currentPage: 0,
    loadedKey: loadedKey
  };
  return { loaded: wrongQs.length, loadedKey };
}

function clearWrongQuestions() {
  if (wrongReviewState.questions.length === 0) return { deletedKey: null };
  let key = wrongReviewState.loadedKey;
  if (!key) {
    const ownKey = getCurrentStudentWrongKey();
    if (ownKey) key = ownKey;
    else key = localStorage.getItem('exam_last_wrong_key');
  }
  if (key) localStorage.removeItem(key);
  const deletedKey = key;
  wrongReviewState = { questions: [], currentPage: 0, loadedKey: null };
  return { deletedKey };
}

// ---- Test runner ----
let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ PASS: ${msg}`); }
  else { failed++; console.log(`  ✗ FAIL: ${msg}`); }
}

console.log('=== Bug #1: 跨用户错题数据泄漏回归测试 ===\n');

// --- Setup: 预置 Alice 的错题数据 ---
store.clear();
const aliceKey = 'exam_wrong_questions_S001_Alice';
const bobKey   = 'exam_wrong_questions_S002_Bob';
const aliceWrong = [
  { type: 'c_danxuan', typeLabel: 'C单选', globalIdx: 0, question: 'Alice错题1',
    userAnswer: 'A', correctAnswer: 'B', score: 1 }
];
localStorage.setItem(aliceKey, JSON.stringify(aliceWrong));
localStorage.setItem('exam_last_wrong_key', aliceKey); // last_key 指向 Alice
console.log(`[预置] Alice 错题已保存, exam_last_wrong_key = ${aliceKey}`);
assert(localStorage.getItem(aliceKey) !== null, 'Alice数据在localStorage中存在');
console.log('');

// --- Test 1: Alice 登录后能加载自己的错题 ---
console.log('[Test 1] Alice 登录 → 加载自己的错题');
currentStudent = { name: 'Alice', stuid: 'S001' };
let result = openWrongReview();
assert(result.loaded === 1, `Alice加载到1条错题 (实际:${result.loaded})`);
assert(result.loadedKey === aliceKey, `loadedKey=Alice的key (实际:${result.loadedKey})`);
assert(JSON.stringify(wrongReviewState.questions) === JSON.stringify(aliceWrong),
  '加载的错题内容与Alice的一致');
console.log('');

// --- Test 2: Bob 登录 → 绝不能看到 Alice 的错题（这就是泄漏修复点）---
console.log('[Test 2] Bob 登录 → 必须加载不到 Alice 的错题');
currentStudent = { name: 'Bob', stuid: 'S002' };
result = openWrongReview();
assert(result.loaded === 0, `Bob加载到0条错题 (实际:${result.loaded}) — 无泄漏`);
assert(result.loadedKey === bobKey, `loadedKey指向Bob自己的key (实际:${result.loadedKey})`);
assert(localStorage.getItem(aliceKey) !== null, 'Alice的数据未被删除');
console.log('');

// --- Test 3: Bob 点击"清空" → 不能删掉 Alice 数据（数据丢失修复点）---
console.log('[Test 3] Alice 数据仍存在 → Bob执行清空 → Alice数据必须保留');

// 先让 Alice 错题被重新"加载"（模拟Alice自己打开错题本）
currentStudent = { name: 'Alice', stuid: 'S001' };
openWrongReview();
assert(wrongReviewState.questions.length === 1, 'Alice自己打开错题本看到1条');

// 现在 Bob 登录（注意：last_key 仍是 Alice 的）
currentStudent = { name: 'Bob', stuid: 'S002' };
// 如果在 Bob 会话里调用 clearWrongQuestions，因为 wrongReviewState.questions.length === 0
// 它会直接 return —— 那要构造 Bob 清空时误删的情况：模拟 loadedKey 还保留旧值的极端情况
// 直接测试 clearWrongQuestions 的 key 选择逻辑: 如果 loadedKey 和 当前身份 都可用,
// 必须优先 loadedKey（确保只删"当前显示的"内容）
// 更关键：当 Bob 无 loadedKey 时，fallback 必须选 getCurrentStudentWrongKey()（Bob的key）
wrongReviewState = { questions: [{question:'x'}], currentPage: 0, loadedKey: null }; // 无loadedKey但有questions
let del = clearWrongQuestions();
assert(del.deletedKey === bobKey,
  `无loadedKey时删除使用Bob的key=${bobKey} (实际:${del.deletedKey})`);
assert(localStorage.getItem(aliceKey) !== null, 'Alice数据安然无恙');
console.log('');

// --- Test 4: 未登录（登录屏）场景 → 仍可使用 last_key（兼容单用户）---
console.log('[Test 4] 未登录状态 → 使用exam_last_wrong_key（兼容行为）');
currentStudent = { name: '', stuid: '' };
localStorage.setItem('exam_last_wrong_key', aliceKey);
result = openWrongReview();
assert(result.loaded === 1, `未登录时通过last_key加载到1条 (实际:${result.loaded})`);
assert(result.loadedKey === aliceKey, `未登录loadedKey=aliceKey (实际:${result.loadedKey})`);
console.log('');

// --- Test 5: loadedKey 贯穿 clearWrongQuestions ---
console.log('[Test 5] 当loadedKey存在时，clearWrongQuestions必须只删loadedKey对应的数据');
currentStudent = { name: 'Alice', stuid: 'S001' };
openWrongReview();
assert(wrongReviewState.loadedKey === aliceKey, 'Alice的loadedKey正确');
// 即使 currentStudent 被改了（极端竞争场景），loadedKey 优先确保删的是"用户看到的那份"
currentStudent = { name: 'Bob', stuid: 'S002' }; // 中途"换"身份
del = clearWrongQuestions();
assert(del.deletedKey === aliceKey,
  `clearWrongQuestions使用loadedKey=aliceKey (实际:${del.deletedKey}) — 保证删的是打开时的那份`);
assert(localStorage.getItem(aliceKey) === null, 'Alice的数据已被自己清空');
console.log('');

// --- Summary ---
console.log('----------------------------------------');
console.log(`结果: ${passed} 通过 / ${failed} 失败 / 共 ${passed+failed} 用例`);
if (failed > 0) {
  console.log('\n存在失败用例，修复可能不完整！');
  process.exit(1);
} else {
  console.log('\n所有回归测试通过 ✅');
  process.exit(0);
}
