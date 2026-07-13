function normalizeAnswer(s) { return String(s).replace(/\s+/g, '').toLowerCase(); }

function testProgramFillGrading() {
  const testCases = [
    {
      name: 'Sequential positions (1, 2) - correct answers',
      blanks: [
        { position: 1, answer: 'a==c', acceptable_answers: ['a==c', 'c==a'] },
        { position: 2, answer: 'n==1', acceptable_answers: ['n==1', 'n', 'n!=0'] }
      ],
      userAnswers: { '0': 'a==c', '1': 'n==1' },
      expectedScore: 6,
      expectedMaxScore: 6
    },
    {
      name: 'Sequential positions (1, 2) - first blank wrong',
      blanks: [
        { position: 1, answer: 'a==c', acceptable_answers: ['a==c', 'c==a'] },
        { position: 2, answer: 'n==1', acceptable_answers: ['n==1', 'n', 'n!=0'] }
      ],
      userAnswers: { '0': 'wrong', '1': 'n==1' },
      expectedScore: 3,
      expectedMaxScore: 6
    },
    {
      name: 'Sequential positions (1, 2) - second blank wrong',
      blanks: [
        { position: 1, answer: 'a==c', acceptable_answers: ['a==c', 'c==a'] },
        { position: 2, answer: 'n==1', acceptable_answers: ['n==1', 'n', 'n!=0'] }
      ],
      userAnswers: { '0': 'a==c', '1': 'wrong' },
      expectedScore: 3,
      expectedMaxScore: 6
    },
    {
      name: 'Non-sequential positions (2, 5) - correct answers',
      blanks: [
        { position: 2, answer: 'i<10', acceptable_answers: ['i<10', 'i<=9'] },
        { position: 5, answer: 'j%6==0', acceptable_answers: ['j%6==0', '!(j%6)'] }
      ],
      userAnswers: { '0': 'i<10', '1': 'j%6==0' },
      expectedScore: 6,
      expectedMaxScore: 6
    },
    {
      name: 'Non-sequential positions (2, 5) - first blank wrong',
      blanks: [
        { position: 2, answer: 'i<10', acceptable_answers: ['i<10', 'i<=9'] },
        { position: 5, answer: 'j%6==0', acceptable_answers: ['j%6==0', '!(j%6)'] }
      ],
      userAnswers: { '0': 'wrong', '1': 'j%6==0' },
      expectedScore: 3,
      expectedMaxScore: 6
    },
    {
      name: 'Non-sequential positions (2, 5) - second blank wrong',
      blanks: [
        { position: 2, answer: 'i<10', acceptable_answers: ['i<10', 'i<=9'] },
        { position: 5, answer: 'j%6==0', acceptable_answers: ['j%6==0', '!(j%6)'] }
      ],
      userAnswers: { '0': 'i<10', '1': 'wrong' },
      expectedScore: 3,
      expectedMaxScore: 6
    },
    {
      name: 'Single blank with position 3',
      blanks: [
        { position: 3, answer: 'k/10', acceptable_answers: ['k/10', 'k=k/10'] }
      ],
      userAnswers: { '0': 'k/10' },
      expectedScore: 3,
      expectedMaxScore: 3
    },
    {
      name: 'Acceptable answers - case insensitivity',
      blanks: [
        { position: 1, answer: 'a==c', acceptable_answers: ['a==c', 'c==a'] }
      ],
      userAnswers: { '0': 'A==C' },
      expectedScore: 3,
      expectedMaxScore: 3
    },
    {
      name: 'Acceptable answers - whitespace tolerance',
      blanks: [
        { position: 1, answer: 'i<10', acceptable_answers: ['i<10', 'i<=9'] }
      ],
      userAnswers: { '0': 'i < 10' },
      expectedScore: 3,
      expectedMaxScore: 3
    }
  ];

  let passed = 0;
  let failed = 0;

  testCases.forEach(tc => {
    let questionScore = 0;
    let questionMaxScore = 0;
    const perBlankScore = 3;

    tc.blanks.forEach((b, bi) => {
      const ua = String((tc.userAnswers && tc.userAnswers[bi]) || '').trim();
      const acceptable = b.acceptable_answers || [b.answer];
      const blankCorrect = acceptable.some(a => normalizeAnswer(ua) === normalizeAnswer(a));
      if (blankCorrect) {
        questionScore += perBlankScore;
      }
      questionMaxScore += perBlankScore;
    });

    if (questionScore === tc.expectedScore && questionMaxScore === tc.expectedMaxScore) {
      console.log(`✓ PASS: ${tc.name}`);
      passed++;
    } else {
      console.log(`✗ FAIL: ${tc.name}`);
      console.log(`  Expected: ${tc.expectedScore}/${tc.expectedMaxScore}, Got: ${questionScore}/${questionMaxScore}`);
      failed++;
    }
  });

  console.log('\n====================');
  console.log(`Total: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  return failed === 0;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeAnswer, testProgramFillGrading };
} else {
  const success = testProgramFillGrading();
  if (typeof window !== 'undefined') {
    window.testGradingSuccess = success;
  }
}