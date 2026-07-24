// 回归测试：自动交卷(autoSubmit) 与 手动确认交卷(confirmSubmit) 重叠时，
// gradeExam 不应被重复执行，避免在本地排行榜中写入重复成绩记录。
//
// 触发场景（修复前）：
//   1) 考生点击“交卷”打开确认弹窗；
//   2) 计时器归零触发 autoSubmit() → gradeExam() 写入成绩记录 #1，并切到成绩页
//      （确认弹窗 z-index:1000 仍悬浮可见）；
//   3) 考生点击“确认交卷” → confirmSubmit() → gradeExam() 再次执行 → 写入成绩记录 #2（重复）。
//
// 运行：node test/double-submit.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const APP_JS = process.env.APP_JS
  ? path.resolve(process.env.APP_JS)
  : path.join(__dirname, '..', 'app.js');
const src = fs.readFileSync(APP_JS, 'utf8');

// 一个可被任意属性读写的最小 DOM 元素桩。
function makeElement() {
  const ctx2d = {
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    beginPath() {}, closePath() {}, arc() {}, rect() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {}, save() {}, restore() {}, translate() {}, scale() {},
    measureText: () => ({ width: 0 })
  };
  return {
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    dataset: {},
    textContent: '', innerHTML: '', value: '', disabled: false,
    querySelectorAll: () => [], querySelector: () => null,
    addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {},
    focus() {}, setAttribute() {}, getContext: () => ctx2d,
    offsetHeight: 1, offsetWidth: 1, width: 100, height: 100
  };
}

function buildEnv() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); }
  };
  const elCache = {};
  const getById = (id) => (elCache[id] || (elCache[id] = makeElement()));

  const document = {
    getElementById: getById,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => makeElement(),
    addEventListener() {},
    body: { appendChild() {} }
  };
  const window = {
    AI_QUESTIONS: [],
    C_QUESTIONS: { danxuan: [], tiankong: [], program_reading: [], program_fill: [] },
    innerWidth: 800, innerHeight: 600,
    addEventListener() {}
  };
  const sandbox = {
    document, window, localStorage,
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => {}, // 不递归，避免动画循环卡住测试
    cancelAnimationFrame: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1, // 忽略成绩页动画回调（成绩记录在同步阶段已写入）
    clearTimeout: () => {},
    confirm: () => true,
    console
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return {
    sandbox,
    setInput(id, val) { getById(id).value = val; }
  };
}

function historyOf(sb) {
  const raw = sb.localStorage.getItem('exam_score_history');
  return raw ? JSON.parse(raw) : [];
}

function loginAs(env, name, stuid) {
  env.setInput('input-name', name);
  env.setInput('input-stuid', stuid);
  env.sandbox.confirmLogin();
}

// 1) 重叠路径：autoSubmit 后再 confirmSubmit，只应写入一条成绩记录
function test_doubleSubmitWritesSingleRecord() {
  const env = buildEnv();
  const sb = env.sandbox;
  loginAs(env, '张三', '20240001');
  sb.startExam();

  sb.autoSubmit();
  assert.strictEqual(historyOf(sb).length, 1, 'autoSubmit 应写入一条成绩记录');

  // 模拟确认弹窗仍可见时考生点击“确认交卷”
  sb.confirmSubmit();
  assert.strictEqual(historyOf(sb).length, 1, 'confirmSubmit 不应再次写入成绩记录（修复前会变为 2）');

  // submitted 守卫应阻止再次判卷
  assert.strictEqual(sb.examState ? sb.examState.submitted : true, true);
}

// 2) 正常手动交卷路径仍写入一条记录（避免守卫误伤正常流程）
function test_manualSubmitWritesSingleRecord() {
  const env = buildEnv();
  const sb = env.sandbox;
  loginAs(env, '李四', '20240002');
  sb.startExam();

  sb.confirmSubmit();
  assert.strictEqual(historyOf(sb).length, 1, '正常手动交卷应写入一条成绩记录');
}

// 3) 先手动交卷，再触发 autoSubmit，同样只写一条
function test_manualThenAutoWritesSingleRecord() {
  const env = buildEnv();
  const sb = env.sandbox;
  loginAs(env, '王五', '20240003');
  sb.startExam();

  sb.confirmSubmit();
  assert.strictEqual(historyOf(sb).length, 1);
  sb.autoSubmit();
  assert.strictEqual(historyOf(sb).length, 1, '手动交卷后 autoSubmit 不应再次写入成绩记录');
}

const tests = [
  test_doubleSubmitWritesSingleRecord,
  test_manualSubmitWritesSingleRecord,
  test_manualThenAutoWritesSingleRecord
];

let failed = 0;
for (const t of tests) {
  try {
    t();
    console.log('PASS:', t.name);
  } catch (e) {
    failed++;
    console.error('FAIL:', t.name);
    console.error('   ', e.message);
  }
}

if (failed > 0) {
  console.error(`\n${failed}/${tests.length} 个测试失败。`);
  process.exit(1);
} else {
  console.log(`\n全部 ${tests.length} 个测试通过。`);
}
