#!/usr/bin/env node
/**
 * 提交后检查 — 定向回归测试
 * 测试 1：gradeExam 双重调用（自动交卷与确认提交竞态）应当只执行一次判卷。
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

// 构造最小 DOM/LocalStorage 沙箱，足以让 app.js 初始化且 gradeExam 可运行
function makeDom() {
  const store = new Map();
  const attrs = new WeakMap();
  let lastHtmlByEl = new WeakMap();
  function makeEl(tag, id) {
    const el = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      id: id || '',
      className: '',
      classList: {
        _s: new Set(),
        add(...xs) { xs.forEach(x => this._s.add(x)); el.className = [...this._s].join(' '); },
        remove(...xs) { xs.forEach(x => this._s.delete(x)); el.className = [...this._s].join(' '); },
        contains(x) { return this._s.has(x); },
        toggle(x, on) {
          if (on === undefined) on = !this._s.has(x);
          on ? this._s.add(x) : this._s.delete(x);
          el.className = [...this._s].join(' ');
          return on;
        },
      },
      style: {},
      dataset: {},
      textContent: '',
      innerHTML: '',
      disabled: false,
      children: [],
      parentNode: null,
      width: 1024,
      height: 768,
      _listeners: {},
      addEventListener(evt, fn, opts) { (this._listeners[evt] = this._listeners[evt] || []).push(fn); },
      removeEventListener() {},
      dispatchEvent() {},
      querySelectorAll() { return []; },
      querySelector() { return null; },
      getAttribute(name) { return (attrs.get(this) || {})[name] || null; },
      setAttribute(name, val) { const m = attrs.get(this) || {}; m[name] = val; attrs.set(this, m); },
      offsetHeight: 800,
      focus() {},
      remove() {
        if (el.parentNode) {
          el.parentNode.children = el.parentNode.children.filter(c => c !== el);
          el.parentNode = null;
        }
      },
      appendChild(child) {
        if (child.parentNode) child.parentNode.remove();
        child.parentNode = el;
        el.children.push(child);
        return child;
      },
      getContext() {
        // 最小 2D 上下文桩：足够粒子/烟花初始化无报错
        return {
          clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, fillText() {},
          moveTo() {}, lineTo() {}, save() {}, restore() {},
        };
      },
    };
    return el;
  }
  const byId = {};
  function ensure(tag, id) {
    if (byId[id]) return byId[id];
    const e = makeEl(tag, id);
    byId[id] = e;
    return e;
  }
  // 创建 gradeExam / submitExam / 成绩显示所需元素
  ['confirm-modal','login-error','progress-total','progress-current','page-type-tabs','page-dots',
   'btn-prev','btn-next','qcard-current','timer-text','timer-circle','confirm-info',
   'score-unit','score-grade','score-circle','score-number','result-details',
   'wrong-questions','exam-screen','home-screen','login-screen','wrong-review-screen',
   'result-screen','wrong-qcard-current','wrong-progress-total','wrong-count-label',
   'wrong-page-dots','wrong-btn-prev','wrong-btn-next','wrong-progress-current',
   'leaderboard-body','leaderboard-empty','leaderboard-modal','particleCanvas',
   'input-name','input-stuid'
  ].forEach(id => ensure('div', id));

  const document = {
    getElementById(id) { return byId[id] || null; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    createElement(tag) { return makeEl(tag); },
    body: makeEl('body'),
    addEventListener() {},
  };

  const localStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    _store: store,
  };

  const window = {
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1024,
    innerHeight: 768,
  };
  return { document, localStorage, window, byId };
}

// 把 app.js 里的关键全局（currentStudent/examState/gradeExam）暴露给测试：
// 在 app.js 源码末尾追加一段后再执行。
function exposeRuntimeSource(src) {
  return src + '\n;' + [
    'window.__examState = () => examState;',
    'window.__getCurrentStudent = () => currentStudent;',
    'window.__gradeExam = gradeExam;',
    'window.__autoSubmit = autoSubmit;',
    'window.__confirmSubmit = confirmSubmit;',
    'window.__startExam = startExam;',
  ].join('\n');
}

// 1) 读取题目数据（c_data.js / ai_data.js / app.js）后模拟运行，构造一个
//    最小可判卷 examState，再两次调用 gradeExam()，验证历史记录仅追加 1 条。
function loadAndRun() {
  const { document, localStorage, window, byId } = makeDom();
  const ctx = {
    document, localStorage, window,
    performance: { now: () => Date.now() },
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame(fn) { const t = setTimeout(() => fn(Date.now()), 16); return t; },
    cancelAnimationFrame(id) { clearTimeout(id); },
    navigator: { userAgent: 'node' },
    Math, JSON, Object, Array, String, Number, Date, RegExp, parseInt, parseFloat,
    Error, TypeError, RangeError,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  // 加载两份题库 (c_data.js 与 ai_data.js 的内容)
  const cJson = JSON.parse(fs.readFileSync('/workspace/c_questions.json', 'utf8'));
  const aiJson = JSON.parse(fs.readFileSync('/workspace/ai_questions.json', 'utf8'));
  // 模拟 c_data.js / ai_data.js 做的事：挂到 window
  ctx.window.C_QUESTIONS = cJson;
  ctx.window.AI_QUESTIONS = aiJson;

  const appSrc = fs.readFileSync('/workspace/app.js', 'utf8');
  vm.runInContext(exposeRuntimeSource(appSrc), ctx, { filename: 'app.js' });

  // 构造一次"完成的" examState：1 道单选 + 1 道程序补全（均答对），避免空数组报错。
  // 通过闭包替换直接写入 ctx.window 暴露的 setter 路径；此处直接在上下文里赋值：
  ctx.currentStudent = { name: '测试考生', stuid: '99999' };
  // 先让 ctx 里的 currentStudent 指向的是 app.js 内部同名 let；不行，因为 app.js 里
  // 是 `let currentStudent`（词法作用域在 vm script 内部）。我们用 window.__set 替代：
  // 为简单起见，重新在 vm 中执行一段对内部变量赋值的脚本。
  const q1 = {
    type: 'c_danxuan', globalIdx: 0,
    data: ctx.window.C_QUESTIONS.danxuan[0],
    score: 1,
  };
  const pf = ctx.window.C_QUESTIONS.program_fill[0];
  const q2 = {
    type: 'c_prog_fill', globalIdx: 1,
    data: pf,
    score: 3,
  };
  ctx.__test_Q1 = q1;
  ctx.__test_Q2 = q2;
  ctx.__test_PF_A = pf.blanks[0].acceptable_answers[0];
  ctx.__test_PF_B = pf.blanks[1].acceptable_answers[0];
  // 抑制烟花：避免 setTimeout/requestAnimationFrame 使 Node 进程无法退出
  // （launchFireworks 是成绩页的彩蛋，与本次竞态缺陷无直接关联）
  vm.runInContext(`
    if (typeof launchFireworks === 'function') { launchFireworks = function() {}; }
  `, ctx);
  vm.runInContext(`
    currentStudent = { name: '测试考生', stuid: '99999' };
    examState = {
      questions: [__test_Q1, __test_Q2],
      answers: {
        0: __test_Q1.data.answer,
        1: { 0: __test_PF_A, 1: __test_PF_B },
      },
      currentPage: 0,
      timeLeft: 1,
      timerInterval: null,
      submitted: false,
      animating: false,
    };
  `, ctx);

  const before = JSON.parse(localStorage.getItem('exam_score_history') || '[]').length;
  try {
    // 竞态模拟：同一 tick 内调用两次 gradeExam
    ctx.window.__gradeExam();
    ctx.window.__gradeExam();
  } catch (e) {
    console.error('gradeExam 抛错:', e);
    process.exit(1);
  }
  const after = JSON.parse(localStorage.getItem('exam_score_history') || '[]');
  const added = after.length - before;

  const state = ctx.window.__examState();
  console.log(`历史记录追加条目数: ${added} (期望: 1)`);
  assert.strictEqual(added, 1, '重复调用 gradeExam 必须仅写入 1 条成绩记录（幂等守卫失败）');

  const wrongKeyCount = [...localStorage._store.keys()].filter(k => k.startsWith('exam_wrong_questions_')).length;
  console.log(`错题 key 数量: ${wrongKeyCount}`);

  // 总成绩计算应正确（c_danxuan 全对得 1 分，program_fill 两空全对得 6 分）
  console.log('totalScore=', state.totalScore, 'totalMax=', state.totalMax, 'graded=', state.graded);
  assert.strictEqual(state.totalScore, 1 + 6, `总得分应为 7，实际为 ${state.totalScore}`);
  assert.strictEqual(state.totalMax,   1 + 6, `总满分应为 7，实际为 ${state.totalMax}`);
  assert.strictEqual(state.graded, true, 'examState.graded 应为 true');

  // 第二阶段：模拟 autoSubmit 与 confirmSubmit 并发（两条路径都会设置 submitted 并调用 gradeExam）
  localStorage._store.delete('exam_score_history');
  vm.runInContext(`
    examState = {
      questions: [__test_Q1, __test_Q2],
      answers: { 0: __test_Q1.data.answer, 1: { 0: __test_PF_A, 1: __test_PF_B } },
      currentPage: 0, timeLeft: 0, timerInterval: null,
      submitted: false, animating: false,
    };
  `, ctx);
  const before2 = JSON.parse(localStorage.getItem('exam_score_history') || '[]').length;
  ctx.window.__autoSubmit();
  ctx.window.__confirmSubmit();
  const after2 = JSON.parse(localStorage.getItem('exam_score_history') || '[]').length;
  const added2 = after2 - before2;
  console.log(`[autoSubmit + confirmSubmit 竞态] 历史追加条目数: ${added2} (期望: 1)`);
  assert.strictEqual(added2, 1, 'autoSubmit 与 confirmSubmit 竞态必须只执行 1 次 gradeExam');

  console.log('\u2705 所有定向测试通过');
}

loadAndRun();
