#!/usr/bin/env node
/**
 * 修复验证测试 — 使用 Node vm 沙箱模拟浏览器环境（localStorage, currentStudent, examState）
 * 覆盖 Bug 1（错题本跨学生泄露）和 Bug 2（考试草稿刷新丢失）
 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

// ========== Mock 浏览器环境 ==========
function makeMockBrowser() {
  const store = new Map();
  const localStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); }
  };
  const sandbox = {
    localStorage,
    console,
    Date,
    JSON,
    Math,
    // 考试配置（与 app.js 一致的最小子集）
    EXAM_CONFIG: {
      ai_danxuan:  { count:20, score:1 },
      c_danxuan:   { count:20, score:1 },
      c_tiankong:  { count:15, score:1 },
      c_prog_read: { count:5,  score:3 },
      c_prog_fill: { count:5,  score:3 },
    },
    TOTAL_TIME: 120 * 60,
    window: {
      AI_QUESTIONS: [{ id:1, question:'q', options:{A:'a',B:'b',C:'c',D:'d'}, answer:'A' }],
      C_QUESTIONS: { danxuan:[], tiankong:[], program_reading:[], program_fill:[] },
      addEventListener: () => {},
      innerWidth: 1024, innerHeight: 768,
    },
    AI_QUESTIONS: [{ id:1, question:'q', options:{A:'a',B:'b',C:'c',D:'d'}, answer:'A' }],
    C_QUESTIONS: { danxuan:[], tiankong:[], program_reading:[], program_fill:[] },
    currentStudent: { name:'', stuid:'' },
    examState: { questions:[], answers:{}, currentPage:0, timeLeft:0, timerInterval:null, submitted:false, animating:false },
    wrongReviewState: { questions:[], currentPage:0 },
    setTimeout, clearTimeout,
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
    cancelAnimationFrame: clearTimeout,
    // setInterval 仅占位（测试不使用真实计时器）
    setInterval: () => 1, clearInterval: () => {},
    // 文档/DOM 不相关函数提供空实现，避免 vm 执行崩溃
    document: {
      getElementById(id) {
        // 粒子 Canvas mock
        if (id === 'particleCanvas') {
          return {
            getContext: () => ({
              clearRect: () => {},
              beginPath: () => {},
              arc: () => {},
              fill: () => {},
              fillStyle: '',
              moveTo: () => {},
              lineTo: () => {},
              stroke: () => {},
              strokeStyle: '',
              lineWidth: 0,
            }),
            width: 1024, height: 768, style: {},
            addEventListener: () => {},
          };
        }
        return {
          classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
          textContent: '', style: {}, offsetHeight: 0,
          querySelector: () => null,
          querySelectorAll: () => [],
          innerHTML: '', value: '', dataset: {},
          focus: () => {}, disabled: false,
          addEventListener: () => {},
          remove: () => {},
        };
      },
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: (tag) => {
        const el = {
          textContent: '', innerHTML: '', style: { cssText: '' },
          classList: { add: () => {}, remove: () => {} },
          dataset: {}, id: '', width: 0, height: 0,
          getContext: () => null,
          appendChild: () => {},
          addEventListener: () => {},
          remove: () => {},
        };
        if (tag === 'canvas') {
          el.getContext = () => ({
            clearRect: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {},
            fillStyle: '', moveTo: () => {}, lineTo: () => {}, stroke: () => {},
            strokeStyle: '', lineWidth: 0, save: () => {}, restore: () => {},
            font: '', textAlign: '', textBaseline: '', shadowColor: '', shadowBlur: 0,
            fillText: () => {},
          });
        }
        return el;
      },
      body: { appendChild: () => {} },
    },
    confirm: () => true,
    performance: { now: () => Date.now() },
  };
  sandbox.global = sandbox;
  return { sandbox, store };
}

// 从 app.js 中提取关键函数代码（跳过依赖真实 DOM 的代码块）
function extractAppCode(raw) {
  // 我们只需要下面这些函数体：
  // getScoreHistory, saveScoreRecord, getDraftKey, saveExamDraft, _flushExamDraft, loadExamDraft, clearExamDraft
  // saveWrongQuestions, loadWrongQuestions, clearWrongQuestions, buildFreshQuestions, startExam 中的 draft 检测部分
  // 为简单起见，直接把整个 app.js 放到 vm 里（因为 DOM 我们 mock 了，不会报错，只是 DOM 相关函数返回空值）
  return raw;
}

const appCode = fs.readFileSync(__dirname + '/app.js', 'utf8');

let passed = 0, failed = 0;
function runTest(name, fn) {
  try {
    fn();
    console.log('  PASS  ' + name);
    passed++;
  } catch (e) {
    console.log('  FAIL  ' + name + '\n        ' + (e.stack || e.message));
    failed++;
  }
}

// 脚本作用域赋值助手（app.js 中 let/const 声明的变量无法通过 sandbox.prop = 直接访问）
function setVar(ctx, sandbox, name, value) {
  sandbox.__val = value;
  vm.runInContext(name + ' = __val;', ctx);
  delete sandbox.__val;
}
function getVar(ctx, sandbox, name) {
  return vm.runInContext(name + ';', ctx);
}
function callFn(ctx, sandbox, fnName, ...args) {
  sandbox.__args = args;
  const result = vm.runInContext(`${fnName}(...__args);`, ctx);
  delete sandbox.__args;
  return result;
}

// ========== Bug 1：错题本跨学生数据泄露测试 ==========
console.log('\n== Bug 1：错题本跨学生数据泄露测试 ==');
{
  const { sandbox } = makeMockBrowser();
  const ctx = sandbox;
  vm.createContext(ctx);
  vm.runInContext(extractAppCode(appCode), ctx);

  runTest('学生A保存错题后，本人可正常读回', () => {
    setVar(ctx, sandbox, 'currentStudent', { name: '张三', stuid: '001' });
    const wrongQs = [{ globalIdx: 0, question: 'q1', userAnswer: 'A错误', correctAnswer: 'B' }];
    callFn(ctx, sandbox, 'saveWrongQuestions', wrongQs);
    const loaded = callFn(ctx, sandbox, 'loadWrongQuestions');
    assert.strictEqual(loaded.length, 1);
    assert.strictEqual(loaded[0].question, 'q1');
  });

  runTest('学生B登录后看不到学生A的错题（核心修复验证）', () => {
    // 延续上面的状态：学生A已保存错题
    setVar(ctx, sandbox, 'currentStudent', { name: '李四', stuid: '002' });
    const loaded = callFn(ctx, sandbox, 'loadWrongQuestions');
    // 学生B应该是自己的 key，返回空数组而不是学生A的错题
    assert.strictEqual(Array.isArray(loaded) ? loaded.length : -1, 0,
      `学生B不应看到学生A的错题，但拿到了 ${JSON.stringify(loaded)}`);
  });

  runTest('学生B的清空操作不会删除学生A的数据（破坏性修复验证）', () => {
    // 先让学生B产生一些错题
    setVar(ctx, sandbox, 'currentStudent', { name: '李四', stuid: '002' });
    setVar(ctx, sandbox, 'wrongReviewState', { questions: [{ q: 'b1' }] });
    callFn(ctx, sandbox, 'saveWrongQuestions', [{ question: 'bq1' }]);
    // 学生B执行清空
    callFn(ctx, sandbox, 'clearWrongQuestions');
    // 学生B确认自己没数据
    const bLoaded = callFn(ctx, sandbox, 'loadWrongQuestions');
    assert.strictEqual(bLoaded.length, 0,
      `学生B清空后自己的错题应为空，实际 ${JSON.stringify(bLoaded)}`);
    // 关键：学生A的数据应完好无损
    setVar(ctx, sandbox, 'currentStudent', { name: '张三', stuid: '001' });
    const remaining = callFn(ctx, sandbox, 'loadWrongQuestions');
    assert.strictEqual(remaining.length, 1, '学生B清空不应影响学生A的错题');
    assert.strictEqual(remaining[0].question, 'q1');
  });

  runTest('未登录状态 fall back 到 exam_last_wrong_key（兼容旧数据）', () => {
    setVar(ctx, sandbox, 'currentStudent', { name: '', stuid: '' });
    // 手动模拟旧数据：写入 last_wrong_key 和对应值
    sandbox.localStorage.setItem('exam_last_wrong_key', 'exam_wrong_questions_legacy');
    sandbox.localStorage.setItem('exam_wrong_questions_legacy', JSON.stringify([{ legacy: true }]));
    const loaded = callFn(ctx, sandbox, 'loadWrongQuestions');
    assert.strictEqual(loaded.length, 1);
    assert.strictEqual(loaded[0].legacy, true);
  });
}

// ========== Bug 2：考试草稿刷新丢失测试 ==========
console.log('\n== Bug 2：考试草稿刷新丢失测试 ==');
{
  const { sandbox } = makeMockBrowser();
  const ctx = sandbox;
  vm.createContext(ctx);
  vm.runInContext(extractAppCode(appCode), ctx);

  runTest('学生身份 key 正确生成', () => {
    setVar(ctx, sandbox, 'currentStudent', { name: '考生1', stuid: '20240001' });
    const k = callFn(ctx, sandbox, 'getDraftKey');
    assert.strictEqual(k, 'exam_draft_20240001_考生1');
  });

  runTest('未登录时不产生草稿 key', () => {
    setVar(ctx, sandbox, 'currentStudent', { name: '', stuid: '' });
    assert.strictEqual(callFn(ctx, sandbox, 'getDraftKey'), null);
    setVar(ctx, sandbox, 'currentStudent', null);
    assert.strictEqual(callFn(ctx, sandbox, 'getDraftKey'), null);
  });

  runTest('作答后 saveExamDraft 落盘，loadExamDraft 可完整恢复', () => {
    setVar(ctx, sandbox, 'currentStudent', { name: '考生1', stuid: '20240001' });
    // 构造一套 3 题的假试卷和答案
    setVar(ctx, sandbox, 'examState', {
      questions: [
        { globalIdx: 0, type: 'ai_danxuan', data: {}, score: 1 },
        { globalIdx: 1, type: 'c_tiankong',  data: {}, score: 1 },
        { globalIdx: 2, type: 'c_prog_fill', data: {}, score: 3 },
      ],
      answers: { 0: 'A', 1: '指针', 2: { '0': 'int', '1': 'malloc' } },
      currentPage: 1,
      timeLeft: 6800,
      submitted: false,
      graded: false,
      animating: false,
    });
    // 强制 flush（绕过节流定时器）
    callFn(ctx, sandbox, '_flushExamDraft');
    const recovered = callFn(ctx, sandbox, 'loadExamDraft');
    assert.ok(recovered, '草稿应存在');
    assert.strictEqual(recovered.questions.length, 3);
    assert.strictEqual(recovered.currentPage, 1);
    assert.strictEqual(recovered.timeLeft, 6800);
    assert.strictEqual(recovered.answers[0], 'A');
    assert.strictEqual(recovered.answers[1], '指针');
    assert.deepStrictEqual(recovered.answers[2], { '0': 'int', '1': 'malloc' });
    assert.ok(recovered.savedAt > Date.now() - 5000, 'savedAt 时间戳应接近当前');
  });

  runTest('草稿 48 小时过期自动清除', () => {
    setVar(ctx, sandbox, 'currentStudent', { name: '考生1', stuid: '20240001' });
    const key = callFn(ctx, sandbox, 'getDraftKey');
    const oldDraft = {
      questions: [{ globalIdx: 0 }],
      answers: { 0: 'x' },
      currentPage: 0,
      timeLeft: 100,
      savedAt: Date.now() - 49 * 3600 * 1000, // 49 小时前
    };
    sandbox.localStorage.setItem(key, JSON.stringify(oldDraft));
    const result = callFn(ctx, sandbox, 'loadExamDraft');
    assert.strictEqual(result, null, '过期 49 小时的草稿应被丢弃');
    assert.strictEqual(sandbox.localStorage.getItem(key), null, '过期草稿记录应被移除');
  });

  runTest('学生B不能读取学生A的草稿（隐私隔离）', () => {
    // 先让学生A有草稿
    setVar(ctx, sandbox, 'currentStudent', { name: '考生A', stuid: 'A001' });
    setVar(ctx, sandbox, 'examState', {
      questions: [{ globalIdx: 0, type: 'ai_danxuan', score:1 }],
      answers: { 0: '秘密答案_A' },
      currentPage: 0, timeLeft: 100, submitted: false, graded: false, animating: false,
    });
    callFn(ctx, sandbox, '_flushExamDraft');
    // 切到学生B
    setVar(ctx, sandbox, 'currentStudent', { name: '考生B', stuid: 'B002' });
    const bDraft = callFn(ctx, sandbox, 'loadExamDraft');
    assert.strictEqual(bDraft, null, '学生B不应拿到学生A的草稿');
  });

  runTest('submitted/graded 状态下不再保存草稿', () => {
    setVar(ctx, sandbox, 'currentStudent', { name: '考生C', stuid: 'C003' });
    setVar(ctx, sandbox, 'examState', {
      questions: [{ globalIdx: 0 }], answers: { 0: 'ans' },
      currentPage: 0, timeLeft: 100,
      submitted: true, graded: false, animating: false,
    });
    callFn(ctx, sandbox, '_flushExamDraft');
    assert.strictEqual(callFn(ctx, sandbox, 'loadExamDraft'), null, '已提交状态不应存草稿');
  });

  runTest('clearExamDraft 彻底清除草稿及节流定时器', () => {
    setVar(ctx, sandbox, 'currentStudent', { name: '考生D', stuid: 'D004' });
    setVar(ctx, sandbox, 'examState', {
      questions: [{ globalIdx: 0 }], answers: { 0: 'x' },
      currentPage: 0, timeLeft: 100, submitted: false, graded: false, animating: false,
    });
    callFn(ctx, sandbox, '_flushExamDraft');
    assert.ok(callFn(ctx, sandbox, 'loadExamDraft'), '保存后应存在');
    callFn(ctx, sandbox, 'clearExamDraft');
    assert.strictEqual(callFn(ctx, sandbox, 'loadExamDraft'), null, '清除后应为 null');
  });

  runTest('节流定时器 saveExamDraft 不会立即重复触发', () => {
    setVar(ctx, sandbox, 'currentStudent', { name: '考生E', stuid: 'E005' });
    setVar(ctx, sandbox, 'examState', {
      questions: [{ globalIdx: 0 }], answers: { 0: 'v1' },
      currentPage: 0, timeLeft: 100, submitted: false, graded: false, animating: false,
    });
    const key = callFn(ctx, sandbox, 'getDraftKey');
    sandbox.localStorage.removeItem(key);
    callFn(ctx, sandbox, 'saveExamDraft');        // 安排一次 2s 后执行
    assert.strictEqual(sandbox.localStorage.getItem(key), null, '节流期内未落盘');
    // 修改答案后立即再调用 saveExamDraft（仍处于节流期，应合并）
    vm.runInContext(`examState.answers[0] = 'v2';`, ctx);
    callFn(ctx, sandbox, 'saveExamDraft');
  });
}

// ========== 汇总 ==========
console.log('\n========================================');
console.log(`测试结果：${passed} 通过，${failed} 失败`);
console.log('========================================');
process.exit(failed > 0 ? 1 : 0);
