/**
 * 关键缺陷验证测试
 * 运行: node test_bugfixes.js
 */

// ======= 测试 1: expandAcceptableAnswers 管道符拆分 =======
console.log('=== 测试 1: expandAcceptableAnswers 管道符拆分 ===');

function normalizeAnswer(s) { return String(s).replace(/\s+/g, '').toLowerCase(); }

function expandAcceptableAnswers(arr) {
  const result = [];
  for (const a of arr) {
    const parts = String(a).split('|').map(s => s.trim()).filter(Boolean);
    for (const p of parts) result.push(p);
  }
  return result;
}

const testCases1 = [
  {
    name: '单选项数组（无管道）',
    input: ['int', 'long', 'short'],
    expected: ['int', 'long', 'short'],
  },
  {
    name: '答案中含 | 分隔的多选项',
    input: ['a[n]|a[i]'],
    expected: ['a[n]', 'a[i]'],
  },
  {
    name: '数组中混合普通项和管道项',
    input: ['589 211 0|5892110|589', '5892110', '589 211 0', '589'],
    expected: ['589 211 0', '5892110', '589', '5892110', '589 211 0', '589'],
  },
  {
    name: '程序补全题常见 s[i]|*(s+i)',
    input: ['s[i]|*(s+i)'],
    expected: ['s[i]', '*(s+i)'],
  },
  {
    name: '带转义引号的 s[j]=0|s[j]="\\0"',
    input: ["s[j]=0|s[j]='\\0'"],
    expected: ["s[j]=0", "s[j]='\\0'"],
  },
];

let passed1 = 0;
for (const tc of testCases1) {
  const result = expandAcceptableAnswers(tc.input);
  const ok = JSON.stringify(result) === JSON.stringify(tc.expected);
  // 也验证判分逻辑
  const sampleUserAnswer = tc.expected[0] || '';
  const isCorrect = result.some(a => normalizeAnswer(sampleUserAnswer) === normalizeAnswer(a));
  console.log(
    (ok && isCorrect ? 'PASS' : 'FAIL') + ': ' + tc.name +
    '\n       输入: ' + JSON.stringify(tc.input).slice(0, 80) +
    '\n       输出: ' + JSON.stringify(result).slice(0, 100) +
    (ok ? '' : '\n       期望: ' + JSON.stringify(tc.expected))
  );
  if (ok && isCorrect) passed1++;
}
console.log('测试 1 通过: ' + passed1 + '/' + testCases1.length + '\n');


// ======= 测试 2: 判分模拟（确保修复后答案能正确匹配） =======
console.log('=== 测试 2: 答案匹配正确性（模拟判分）===');

function mockGradeOneBlank(userAnswer, acceptableArr) {
  const ua = String(userAnswer || '').trim();
  const acceptable = expandAcceptableAnswers(acceptableArr);
  return acceptable.some(a => normalizeAnswer(ua) === normalizeAnswer(a));
}

const testCases2 = [
  {
    name: '用户答 a[n]，题目接受 a[n]|a[i]',
    user: 'a[n]',
    acceptable: ['a[n]|a[i]'],
    shouldPass: true,
  },
  {
    name: '用户答 a[i]，题目接受 a[n]|a[i]',
    user: 'a[i]',
    acceptable: ['a[n]|a[i]'],
    shouldPass: true,
  },
  {
    name: '用户答 a[x]，题目接受 a[n]|a[i]（应错）',
    user: 'a[x]',
    acceptable: ['a[n]|a[i]'],
    shouldPass: false,
  },
  {
    name: '用户答 s[i]（含空格），题目接受 s[i]|*(s+i)',
    user: ' s [ i ] ',
    acceptable: ['s[i]|*(s+i)'],
    shouldPass: true,
  },
  {
    name: '用户答 *(s+i)，题目接受 s[i]|*(s+i)',
    user: '*(s+i)',
    acceptable: ['s[i]|*(s+i)'],
    shouldPass: true,
  },
  {
    name: '用户答 5892110XYZ（完全错误），题目接受 589 211 0|5892110|589',
    user: '5892110XYZ',
    acceptable: ['589 211 0|5892110|589'],
    shouldPass: false,
  },
  {
    name: '用户答 5892110，题目接受 589 211 0|5892110|589',
    user: '5892110',
    acceptable: ['589 211 0|5892110|589'],
    shouldPass: true,
  },
  {
    name: '无空格/大小写敏感性：589 2 1 1 0 vs 5892110',
    user: '589 2 1 1 0',
    acceptable: ['5892110'],
    shouldPass: true, // normalizeAnswer 去空格
  },
];

let passed2 = 0;
for (const tc of testCases2) {
  const result = mockGradeOneBlank(tc.user, tc.acceptable);
  const ok = result === tc.shouldPass;
  console.log(
    (ok ? 'PASS' : 'FAIL') + ': ' + tc.name +
    '\n       用户答案: "' + tc.user + '"  接受: ' + JSON.stringify(tc.acceptable).slice(0, 60) +
    '\n       结果: ' + result + '  期望: ' + tc.shouldPass
  );
  if (ok) passed2++;
}
console.log('测试 2 通过: ' + passed2 + '/' + testCases2.length + '\n');


// ======= 测试 3: 烟花 fadeOutStarted 单例标志检查 =======
console.log('=== 测试 3: 烟花渐隐只触发一次标志位检查 ===');

// 模拟原逻辑和修复后逻辑
function simulateFadeoutBuggy(runFrames = 200, threshold = 100) {
  // 模拟动画帧循环，每次 glowAlpha >= 0.7 就启动定时器
  let timersStarted = 0;
  let glowAlpha = 0;
  for (let frame = 0; frame < runFrames; frame++) {
    glowAlpha = Math.min(0.8, glowAlpha + 0.01); // 递增模拟
    if (glowAlpha >= 0.7) {
      timersStarted++; // 每帧都 "启动" 一个定时器
    }
  }
  return timersStarted;
}

function simulateFadeoutFixed(runFrames = 200, threshold = 100) {
  let timersStarted = 0;
  let glowAlpha = 0;
  let fadeOutStarted = false; // 关键标志位
  for (let frame = 0; frame < runFrames; frame++) {
    glowAlpha = Math.min(0.8, glowAlpha + 0.01);
    if (glowAlpha >= 0.7 && !fadeOutStarted) { // 条件: glowAlpha 达标 + 标志位未设
      fadeOutStarted = true;                      // 设置标志位
      timersStarted++;
    }
  }
  return timersStarted;
}

const buggyTimers = simulateFadeoutBuggy();
const fixedTimers = simulateFadeoutFixed();
console.log('有缺陷时启动定时器次数: ' + buggyTimers + ' (预期 = 几十到几百)');
console.log('修复后启动定时器次数: ' + fixedTimers + ' (预期 = 1)');
const test3Ok = fixedTimers === 1 && buggyTimers > 1;
console.log((test3Ok ? 'PASS' : 'FAIL') + ': fadeOutStarted 标志位确保仅触发一次\n');

// ======= 汇总 =======
console.log('========================================');
const totalPassed = passed1 + passed2 + (test3Ok ? 1 : 0);
const total = testCases1.length + testCases2.length + 1;
console.log('总通过率: ' + totalPassed + '/' + total +
  ' (' + Math.round(totalPassed / total * 100) + '%)');
process.exit(totalPassed === total ? 0 : 1);
