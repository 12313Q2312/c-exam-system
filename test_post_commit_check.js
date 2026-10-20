/* ============================================
   回归测试 — 覆盖近期提交引入/存在的关键缺陷
   运行： node test_post_commit_check.js
   无第三方依赖：内置一个最小 DOM / 计时器桩，直接加载 app.js
   ============================================ */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  PASS: ' + msg);
  else { failures++; console.log('  FAIL: ' + msg); }
}
function assertEq(a, b, msg) { assert(a === b, msg + ` (expected ${b}, got ${a})`); }

// 构造一个隔离的运行环境：最小 DOM + 虚拟时钟/调度器 + localStorage
function createEnv() {
  let clock = 0;
  const events = [];
  let idSeq = 0;

  const gfx = new Proxy({}, {
    get(t, p) { return (p in t) ? t[p] : () => {}; },
    set(t, p, v) { t[p] = v; return true; }
  });

  function makeEl(tag) {
    return {
      tagName: String(tag || 'div').toUpperCase(),
      style: {}, dataset: {}, value: '',
      innerHTML: '', textContent: '', disabled: false, children: [],
      classList: {
        _s: new Set(),
        add(...c) { c.forEach(x => this._s.add(x)); },
        remove(...c) { c.forEach(x => this._s.delete(x)); },
        toggle(c, f) {
          if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }
          else { f ? this._s.add(c) : this._s.delete(c); }
        },
        contains(c) { return this._s.has(c); }
      },
      addEventListener() {}, removeEventListener() {},
      appendChild(c) { this.children.push(c); return c; },
      remove() {}, focus() {},
      getContext() { return gfx; },
      querySelector() { return null; },
      querySelectorAll() { return []; }
    };
  }

  const elCache = new Map();
  const document = {
    getElementById(id) { if (!elCache.has(id)) elCache.set(id, makeEl('div')); return elCache.get(id); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(tag) { return makeEl(tag); },
    addEventListener() {},
    body: makeEl('body')
  };

  const store = new Map();
  const localStorage = {
    getItem(k) { return store.has(String(k)) ? store.get(String(k)) : null; },
    setItem(k, v) { store.set(String(k), String(v)); },
    removeItem(k) { store.delete(String(k)); },
    clear() { store.clear(); }
  };

  const sandbox = {
    console,
    document,
    localStorage,
    performance: { now: () => clock },
    requestAnimationFrame(fn) { idSeq++; events.push({ time: clock + 16, fn }); return idSeq; },
    cancelAnimationFrame() {},
    setTimeout(fn, ms) { idSeq++; events.push({ time: clock + (ms || 0), fn }); return idSeq; },
    clearTimeout() {},
    setInterval() { idSeq++; return idSeq; },
    clearInterval() {},
    confirm() { return true; },
    alert() {},
    innerWidth: 1200,
    innerHeight: 800,
    addEventListener() {}, removeEventListener() {}
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(APP, context, { filename: 'app.js' });

  return {
    sandbox, context, document, localStorage,
    setClock(v) { clock = v; },
    clearEvents() { events.length = 0; },
    pendingCount() { return events.length; },
    runScheduler(maxSteps, maxClock) {
      let steps = 0;
      while (events.length && steps < maxSteps) {
        events.sort((a, b) => a.time - b.time);
        const e = events.shift();
        if (e.time > maxClock) { events.unshift(e); return { terminated: false, steps, clock }; }
        clock = e.time;
        e.fn(clock);
        steps++;
      }
      return { terminated: events.length === 0, steps, clock };
    }
  };
}

// ---------- 用例 1：重复交卷 ----------
function testDoubleSubmit() {
  console.log('\n[1] 重复交卷（数据完整性）');
  const env = createEnv();
  let graded = 0;
  env.context.gradeExam = function () { graded++; };

  env.context.confirmSubmit();
  env.context.confirmSubmit();
  assertEq(graded, 1, 'confirmSubmit 连续调用两次只应判卷一次');

  const env2 = createEnv();
  let graded2 = 0;
  env2.context.gradeExam = function () { graded2++; };
  env2.context.autoSubmit();
  env2.context.autoSubmit();
  assertEq(graded2, 1, 'autoSubmit 连续调用两次只应判卷一次');
}

// ---------- 用例 2：错题本跨考生串号 ----------
function testWrongQuestionIsolation() {
  console.log('\n[2] 错题本跨考生隔离（隐私 / 数据完整性）');
  const env = createEnv();
  // 模拟：考生 A 已完成考试并留下错题 + 旧版全局指针
  env.localStorage.setItem('exam_wrong_questions_1_A', JSON.stringify([{ q: 'A的错题' }]));
  env.localStorage.setItem('exam_last_wrong_key', 'exam_wrong_questions_1_A');

  // 考生 B 在同一台设备登录
  env.document.getElementById('input-name').value = 'B';
  env.document.getElementById('input-stuid').value = '2';
  env.context.confirmLogin();

  if (typeof env.context.getCurrentStudentWrongKey === 'function') {
    assertEq(env.context.getCurrentStudentWrongKey(), 'exam_wrong_questions_2_B',
      '错题存储键必须按当前考生生成');
  } else {
    assert(false, '缺少按当前考生生成错题键的逻辑');
  }
  const qs = env.context.loadWrongQuestions();
  assertEq(qs.length, 0, '考生 B 不应读到考生 A 的错题');
}

// ---------- 用例 3：烟花动画无限循环 ----------
function testFireworksTerminates() {
  console.log('\n[3] 烟花动画无限循环（资源泄漏）');
  const env = createEnv();
  env.clearEvents();   // 丢弃粒子背景在加载时排入的初始帧
  // 使用非零时钟基准，贴近浏览器中 performance.now() 的真实取值
  env.setClock(1000000);

  let rafCount = 0;
  const baseRaf = env.sandbox.requestAnimationFrame;
  env.sandbox.requestAnimationFrame = function (fn) { rafCount++; return baseRaf(fn); };

  env.context.launchFireworks();
  const r = env.runScheduler(500000, 1000000 + 60000);

  assert(r.terminated, '烟花动画结束时必须停止 requestAnimationFrame 循环');
  assert(rafCount < 2000, '烟花动画帧数必须有界 (rafCount=' + rafCount + ')');
}

try {
  testDoubleSubmit();
  testWrongQuestionIsolation();
  testFireworksTerminates();
} catch (e) {
  failures++;
  console.log('\n运行时异常: ' + (e && e.stack ? e.stack : e));
}

console.log('\n' + (failures === 0 ? '全部通过 ✅' : failures + ' 个用例失败 ❌'));
process.exit(failures === 0 ? 0 : 1);
