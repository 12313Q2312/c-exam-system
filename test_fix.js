function normalizeAnswer(s) { return String(s).replace(/\s+/g, '').toLowerCase(); }

function testProgFillScoring() {
  console.log('=== 测试程序补全题判分修复 ===\n');
  
  const testCases = [
    {
      name: '测试1：正常索引匹配',
      blanks: [
        { position: 1, answer: 'k++', acceptable_answers: ['k++', '++k'] },
        { position: 2, answer: 'x/=2', acceptable_answers: ['x/=2', 'x=x/2'] }
      ],
      userAns: { 0: 'k++', 1: 'x=x/2' },
      expectedScore: 6,
      expectedMax: 6
    },
    {
      name: '测试2：| 分隔格式支持',
      blanks: [
        { position: 1, answer: 'a[i]|*(s+i)', acceptable_answers: ['a[i]|*(s+i)'] },
        { position: 2, answer: 's[j]=0|s[j]=\'\0\'', acceptable_answers: ['s[j]=0|s[j]=\'\0\''] }
      ],
      userAns: { 0: '*(s+i)', 1: 's[j]=0' },
      expectedScore: 6,
      expectedMax: 6
    },
    {
      name: '测试3：部分正确',
      blanks: [
        { position: 1, answer: 'k++', acceptable_answers: ['k++'] },
        { position: 2, answer: 'x/=2', acceptable_answers: ['x/=2'] }
      ],
      userAns: { 0: 'k++', 1: 'wrong' },
      expectedScore: 3,
      expectedMax: 6
    },
    {
      name: '测试4：position 不连续时索引仍正确',
      blanks: [
        { position: 1, answer: 'a', acceptable_answers: ['a'] },
        { position: 3, answer: 'c', acceptable_answers: ['c'] },
        { position: 5, answer: 'e', acceptable_answers: ['e'] }
      ],
      userAns: { 0: 'a', 1: 'c', 2: 'e' },
      expectedScore: 9,
      expectedMax: 9
    }
  ];

  let passed = 0;
  testCases.forEach(tc => {
    let questionScore = 0;
    let questionMaxScore = 0;
    const perBlankScore = 3;
    
    tc.blanks.forEach((b, bi) => {
      const ua = String((tc.userAns && tc.userAns[bi]) || '').trim();
      let acceptable = [];
      if (b.acceptable_answers) {
        const raw = Array.isArray(b.acceptable_answers) ? b.acceptable_answers : [b.acceptable_answers];
        raw.forEach(a => {
          const parts = String(a).split('|');
          acceptable.push(...parts);
        });
      } else if (b.answer) {
        acceptable = [b.answer];
      }
      const blankCorrect = acceptable.length > 0 && acceptable.some(a => normalizeAnswer(ua) === normalizeAnswer(a));
      if (blankCorrect) {
        questionScore += perBlankScore;
      }
      questionMaxScore += perBlankScore;
    });

    const isPass = questionScore === tc.expectedScore && questionMaxScore === tc.expectedMax;
    console.log(tc.name + ': ' + (isPass ? '✓ 通过' : '✗ 失败'));
    if (!isPass) {
      console.log('  期望得分: ' + tc.expectedScore + ', 实际得分: ' + questionScore);
      console.log('  期望满分: ' + tc.expectedMax + ', 实际满分: ' + questionMaxScore);
    }
    if (isPass) passed++;
  });

  console.log('\n' + passed + '/' + testCases.length + ' 测试通过');
  return passed === testCases.length;
}

function testNormalizeAnswer() {
  console.log('\n=== 测试答案归一化 ===\n');
  
  const tests = [
    { input: 'k++', expected: 'k++' },
    { input: ' k++ ', expected: 'k++' },
    { input: 'K++', expected: 'k++' },
    { input: '  K ++  ', expected: 'k++' },
    { input: 'x/=2', expected: 'x/=2' },
    { input: 'X /= 2', expected: 'x/=2' }
  ];
  
  let passed = 0;
  tests.forEach(t => {
    const result = normalizeAnswer(t.input);
    const isPass = result === t.expected;
    console.log(`normalizeAnswer("${t.input}") = "${result}" ${isPass ? '✓' : '✗'}`);
    if (isPass) passed++;
  });
  
  console.log(passed + '/' + tests.length + ' 测试通过');
  return passed === tests.length;
}

const allPassed = testProgFillScoring() && testNormalizeAnswer();
console.log('\n' + (allPassed ? '🎉 所有测试通过！' : '❌ 存在测试失败'));