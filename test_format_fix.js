#!/usr/bin/env node
/**
 * 最小化测试：验证 formatProgramQuestion 修复后的代码/描述拆分逻辑
 *
 * 覆盖的缺陷：
 *   Bug A: 修复前 inCode 一旦为 true 永不重置，导致"描述→代码→代码后描述"
 *          格式的题目中，代码后的描述被错误吞入 codeLines，显示在代码框内。
 *   Bug B: 修复前代码块内的空行被无条件丢弃，代码结构不完整。
 *
 * 运行： node test_format_fix.js
 * 退出码：0=全部通过 1=失败
 */

'use strict';

// ========== 从 app.js 复制的核心拆分逻辑（修复后版本） ==========
// 仅提取到 descLines/codeLines 生成完毕为止，不依赖 DOM API。
function splitProgramQuestionParts(questionText) {
  const lines = questionText.split('\n');
  let descLines = [], codeLines = [], inCode = false;
  let braceDepth = 0;
  let nonCodeStreak = 0;

  function isCodeLike(t) {
    return /^(#include|int\s+main|void\s+main|int\s+\w+\s*\(|void\s+\w+\s*\(|char\s+\w+\s*\(|float\s+\w+\s*\(|double\s+\w+\s*\()/.test(t)
        || /^\{/.test(t) || /^\}/.test(t)
        || /^(int|char|float|double|long|short|void|struct|enum|union|typedef|unsigned|signed|static|const|extern|volatile|auto|register)\s+/.test(t)
        || /^(#\s*\w+)/.test(t)
        || /[;{}]\s*$/.test(t)
        || /^\s*(return|break|continue|goto|if|else|for|while|do|switch|case|default)\b/.test(t)
        || /^\s*\w+\s*\(.*\)\s*;?\s*$/.test(t)
        || /^(\+\+|--|[\w\]]+\s*[+\-*/%&|^<>=!]=?|#\s*\w+)/.test(t);
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (inCode) {
        codeLines.push(line);
        nonCodeStreak = 0;
      }
      continue;
    }

    for (const ch of trimmed) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    }

    const looksLikeCode = isCodeLike(trimmed);

    if (!inCode) {
      if (looksLikeCode) {
        inCode = true;
        nonCodeStreak = 0;
        codeLines.push(line);
      } else {
        descLines.push(trimmed);
      }
    } else {
      if (looksLikeCode || braceDepth > 0) {
        codeLines.push(line);
        nonCodeStreak = 0;
      } else {
        nonCodeStreak++;
        if (nonCodeStreak >= 1) {
          inCode = false;
          descLines.push(trimmed);
        } else {
          codeLines.push(line);
        }
      }
    }
  }

  while (codeLines.length > 0 && codeLines[codeLines.length - 1].trim() === '') {
    codeLines.pop();
  }

  if (codeLines.length === 0) {
    const mc = [], md = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (/[{};]|#include|printf|scanf|int\s|char\s|float\s|double\s/.test(t)) { mc.push(line); }
      else { md.push(t); }
    }
    if (mc.length > 0) { descLines = md; codeLines = mc; }
    else { descLines = lines.map(l => l.trim()).filter(Boolean); }
  }

  return { descLines, codeLines };
}

// ========== 测试框架（极简断言） ==========
let passCount = 0, failCount = 0;
function assert(cond, msg) {
  if (cond) {
    passCount++;
    console.log(`  ✓ ${msg}`);
  } else {
    failCount++;
    console.error(`  ✗ ${msg}`);
  }
}
function assertEq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passCount++;
    console.log(`  ✓ ${msg}`);
  } else {
    failCount++;
    console.error(`  ✗ ${msg}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}
function suite(name, fn) { console.log(`\n▸ ${name}`); fn(); }

// ========== 测试用例 ==========

suite('Bug A 修复验证：代码后的描述文字正确进入 descLines', () => {
  // 程序阅读题的标准格式：描述 → 代码 → 代码后的问题描述
  const input =
`阅读下列程序，回答问题：
#include <stdio.h>
int main()
{
    int a = 1, b = 2;
    printf("%d", a + b);
    return 0;
}
请写出程序的输出结果：`;

  const { descLines, codeLines } = splitProgramQuestionParts(input);

  assert(descLines.length >= 2, `descLines 至少包含前后两段描述，实际长度=${descLines.length}`);
  assertEq(descLines[0], '阅读下列程序，回答问题：', '第一段描述（代码前）正确进入 descLines');
  assertEq(descLines[descLines.length - 1], '请写出程序的输出结果：', '代码后的描述（Bug点）正确回到 descLines，未被吞入 codeLines');

  const codeText = codeLines.join('\n');
  assert(!codeLines.some(l => l.includes('请写出程序的输出结果')),
    'codeLines 中不应包含"请写出程序的输出结果："等问题描述文字');
  assert(codeLines.some(l => l.includes('#include <stdio.h>')), 'codeLines 包含 #include 行');
  assert(codeLines.some(l => l.includes('int main()')), 'codeLines 包含 main 函数声明');
  assert(codeLines.some(l => l.includes('return 0;')), 'codeLines 包含 return 语句');
});

suite('Bug A 修复验证：代码后有多行描述时全部正确分离', () => {
  const input =
`已知如下程序：
#include <stdio.h>
int f(int n) { if (n <= 1) return 1; return n * f(n - 1); }
int main() { printf("%d", f(5)); return 0; }
(1) 该函数实现了什么数学功能？
(2) main 中 printf 输出的值是多少？`;

  const { descLines, codeLines } = splitProgramQuestionParts(input);

  assert(descLines.length >= 3, `应包含代码前1段 + 代码后2段描述，实际=${descLines.length}`);
  assert(descLines.some(l => l.includes('该函数实现了什么数学功能')),
    '代码后的第1个问题正确进入 descLines');
  assert(descLines.some(l => l.includes('printf 输出的值是多少')),
    '代码后的第2个问题正确进入 descLines');
  assertEq(codeLines.length, 3, 'codeLines 应包含3行代码 (#include / f函数 / main函数)');
});

suite('Bug B 修复验证：代码块内部的空行被保留', () => {
  const input =
`阅读：
#include <stdio.h>

int main()
{
    int x;

    scanf("%d", &x);
    printf("%d", x * 2);
    return 0;
}`;

  const { codeLines } = splitProgramQuestionParts(input);

  // 统计空行数
  const blankInside = codeLines.filter(l => l === '').length;
  assert(blankInside >= 2,
    `代码块内的空行应保留（int main 前1行 + scanf 前1行），实际空行数=${blankInside}`);
});

suite('边界用例：纯描述（无代码）', () => {
  const input = `这是一道普通的填空题
请填写"hello"后面的单词`;
  const { descLines, codeLines } = splitProgramQuestionParts(input);
  assertEq(codeLines.length, 0, '纯描述无代码时 codeLines 为空');
  assertEq(descLines.length, 2, '纯描述正确全部进入 descLines');
});

suite('边界用例：纯代码（无前后描述）', () => {
  const input =
`int main() {
    printf("hi");
    return 0;
}`;
  const { descLines, codeLines } = splitProgramQuestionParts(input);
  assert(codeLines.length >= 3, '纯代码时 codeLines 包含主体');
  // descLines 允许为空或极少
});

suite('边界用例：单函数 + 一行后置描述（最简单触发Bug A的场景）', () => {
  const input =
`void test() { int x = 1; }
以上函数中变量 x 的类型是什么？`;
  const { descLines, codeLines } = splitProgramQuestionParts(input);
  assert(descLines.some(l => l.includes('变量 x 的类型')),
    '单函数代码后的一行描述正确进入 descLines');
  assert(!codeLines.some(l => l.includes('变量 x 的类型')),
    'codeLines 不含后置描述');
});

// ========== 汇总 ==========
console.log(`\n${'═'.repeat(50)}`);
console.log(`结果：${passCount} 通过，${failCount} 失败`);
console.log(`${'═'.repeat(50)}`);
process.exit(failCount > 0 ? 1 : 0);
