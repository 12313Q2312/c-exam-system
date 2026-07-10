function normalizeAnswer(s) {
  return String(s).replace(/\s+/g, '').toLowerCase();
}

function testProgFillGrading() {
  const cfg = { score: 3 };
  
  const testCases = [
    {
      name: "正常顺序，全部正确",
      question: {
        data: {
          blanks: [
            { position: 1, answer: "a==c", acceptable_answers: ["a==c", "c==a"] },
            { position: 2, answer: "n==1", acceptable_answers: ["n==1", "n", "n!=0"] }
          ]
        }
      },
      userAns: { 0: "a==c", 1: "n==1" },
      expectedScore: 6,
      expectedIsCorrect: true
    },
    {
      name: "正常顺序，部分正确",
      question: {
        data: {
          blanks: [
            { position: 1, answer: "a==c", acceptable_answers: ["a==c", "c==a"] },
            { position: 2, answer: "n==1", acceptable_answers: ["n==1", "n", "n!=0"] }
          ]
        }
      },
      userAns: { 0: "a==c", 1: "wrong" },
      expectedScore: 3,
      expectedIsCorrect: false
    },
    {
      name: "位置不连续（position=2,5）",
      question: {
        data: {
          blanks: [
            { position: 2, answer: "a==c", acceptable_answers: ["a==c"] },
            { position: 5, answer: "n==1", acceptable_answers: ["n==1"] }
          ]
        }
      },
      userAns: { 0: "a==c", 1: "n==1" },
      expectedScore: 6,
      expectedIsCorrect: true
    },
    {
      name: "位置倒序（position=3,1）",
      question: {
        data: {
          blanks: [
            { position: 3, answer: "third", acceptable_answers: ["third"] },
            { position: 1, answer: "first", acceptable_answers: ["first"] }
          ]
        }
      },
      userAns: { 0: "third", 1: "first" },
      expectedScore: 6,
      expectedIsCorrect: true
    },
    {
      name: "空答案",
      question: {
        data: {
          blanks: [
            { position: 1, answer: "a==c", acceptable_answers: ["a==c"] },
            { position: 2, answer: "n==1", acceptable_answers: ["n==1"] }
          ]
        }
      },
      userAns: {},
      expectedScore: 0,
      expectedIsCorrect: false
    }
  ];

  let passed = 0;
  let failed = 0;

  console.log("=== 程序补全题判分逻辑测试 ===\n");

  testCases.forEach(tc => {
    const blanks = tc.question.data.blanks || [];
    const perBlankScore = cfg.score;
    let hasWrongBlank = false;
    let questionScore = 0;
    let questionMaxScore = 0;

    blanks.forEach((b, bi) => {
      const ua = String((tc.userAns && tc.userAns[bi]) || '').trim();
      const acceptable = b.acceptable_answers || [b.answer];
      const blankCorrect = acceptable.some(a => normalizeAnswer(ua) === normalizeAnswer(a));
      if (blankCorrect) {
        questionScore += perBlankScore;
      } else {
        hasWrongBlank = true;
      }
      questionMaxScore += perBlankScore;
    });

    const isCorrect = !hasWrongBlank;

    const status = questionScore === tc.expectedScore && isCorrect === tc.expectedIsCorrect ? "✓ PASS" : "✗ FAIL";
    
    if (status === "✓ PASS") passed++;
    else failed++;

    console.log(`${status} ${tc.name}`);
    if (status === "✗ FAIL") {
      console.log(`  Expected: score=${tc.expectedScore}, isCorrect=${tc.expectedIsCorrect}`);
      console.log(`  Got: score=${questionScore}, isCorrect=${isCorrect}`);
    }
  });

  console.log(`\n=== 结果: ${passed} passed, ${failed} failed ===`);
  return failed === 0;
}

testProgFillGrading();