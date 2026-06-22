/* ============================================
   考试核心逻辑 — 一题一页 + 翻页动效版
   ============================================ */

// ====== 全局状态 ======
const TOTAL_TIME = 90 * 60; // 90 分钟
const EXAM_CONFIG = {
  ai_danxuan:    { count:20, score:1, label:'AI 单选题',   icon:'🧠', shortLabel:'AI通识' },
  c_danxuan:     { count:15, score:2, label:'C 单选题',    icon:'📝', shortLabel:'C单选'  },
  c_tiankong:    { count:15, score:2, label:'C 填空题',    icon:'✍️', shortLabel:'C填空'  },
  c_prog_read:   { count:5,  score:2, label:'程序阅读题',  icon:'🔍', shortLabel:'阅读'   },
  c_prog_fill:   { count:5,  score:2, label:'程序补全题',  icon:'🔧', shortLabel:'补全'   },
};

let examState = {
  questions: [],       // [{type, globalIdx, data, score}]
  answers: {},         // {globalIdx: answer}
  currentPage: 0,      // 当前题目索引 0~59
  timeLeft: TOTAL_TIME,
  timerInterval: null,
  submitted: false,
  animating: false     // 翻页动画进行中
};

// ====== Fisher-Yates 洗牌 ======
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(arr, n) {
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}

// ====== 切换屏幕 ======
function switchScreen(showId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(showId);
  el.classList.add('active');
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = 'fadeScaleIn 0.4s ease';
}

// ====== 开始考试 ======
function startExam() {
  const qs = [];
  let idx = 0;

  pickRandom(window.AI_QUESTIONS, EXAM_CONFIG.ai_danxuan.count).forEach(q => {
    qs.push({ type:'ai_danxuan', globalIdx:idx++, data:q, score:EXAM_CONFIG.ai_danxuan.score });
  });
  pickRandom(window.C_QUESTIONS.danxuan, EXAM_CONFIG.c_danxuan.count).forEach(q => {
    qs.push({ type:'c_danxuan', globalIdx:idx++, data:q, score:EXAM_CONFIG.c_danxuan.score });
  });
  pickRandom(window.C_QUESTIONS.tiankong, EXAM_CONFIG.c_tiankong.count).forEach(q => {
    qs.push({ type:'c_tiankong', globalIdx:idx++, data:q, score:EXAM_CONFIG.c_tiankong.score });
  });
  pickRandom(window.C_QUESTIONS.program_reading, EXAM_CONFIG.c_prog_read.count).forEach(q => {
    qs.push({ type:'c_prog_read', globalIdx:idx++, data:q, score:EXAM_CONFIG.c_prog_read.score });
  });
  pickRandom(window.C_QUESTIONS.program_fill, EXAM_CONFIG.c_prog_fill.count).forEach(q => {
    qs.push({ type:'c_prog_fill', globalIdx:idx++, data:q, score:EXAM_CONFIG.c_prog_fill.score });
  });

  examState = {
    questions: qs,
    answers: {},
    currentPage: 0,
    timeLeft: TOTAL_TIME,
    timerInterval: null,
    submitted: false,
    animating: false
  };

  qs.forEach(q => {
    if (q.type === 'c_prog_fill') {
      examState.answers[q.globalIdx] = {};
    } else {
      examState.answers[q.globalIdx] = '';
    }
  });

  document.getElementById('progress-total').textContent = qs.length;
  renderPageFooter();
  renderCurrentQuestion();
  switchScreen('exam-screen');
  startTimer();
}

// ====== 渲染底部导航 ======
function renderPageFooter() {
  // 题型快捷跳转
  const typeTabs = document.getElementById('page-type-tabs');
  if (!typeTabs) return;
  const types = ['ai_danxuan', 'c_danxuan', 'c_tiankong', 'c_prog_read', 'c_prog_fill'];
  const startIndices = {};
  types.forEach(t => {
    const first = examState.questions.findIndex(q => q.type === t);
    startIndices[t] = first >= 0 ? first : 0;
  });

  typeTabs.innerHTML = types.map(t => {
    const cfg = EXAM_CONFIG[t];
    const first = startIndices[t];
    return `<button class="type-tab" data-type="${t}" onclick="jumpToType('${t}', ${first})">${cfg.icon} ${cfg.shortLabel}</button>`;
  }).join('');

  // 页码点
  const dotsEl = document.getElementById('page-dots');
  dotsEl.innerHTML = examState.questions.map((q, i) =>
    `<span class="page-dot" data-page="${i}" onclick="jumpToQuestion(${i})" title="第${i+1}题"></span>`
  ).join('');

  updatePageIndicator();
}

// ====== 更新页码指示器 ======
function updatePageIndicator() {
  const p = examState.currentPage;
  document.getElementById('progress-current').textContent = p + 1;

  // Type tabs
  document.querySelectorAll('.type-tab').forEach(tab => {
    const targetPage = parseInt(tab.getAttribute('onclick').match(/\d+/)?.[0]) || 0;
    const type = tab.dataset.type;
    const currType = examState.questions[p]?.type;
    tab.classList.toggle('current', type === currType);
  });

  // Page dots
  document.querySelectorAll('.page-dot').forEach((dot, i) => {
    dot.classList.toggle('current', i === p);
    dot.classList.toggle('answered', isQuestionAnswered(i));
  });

  // Arrows
  document.getElementById('btn-prev').disabled = p <= 0;
  document.getElementById('btn-next').disabled = p >= examState.questions.length - 1;
}

// ====== 渲染当前题 ======
function renderCurrentQuestion() {
  const p = examState.currentPage;
  if (p < 0 || p >= examState.questions.length) return;

  const q = examState.questions[p];
  const card = document.getElementById('qcard-current');

  // 恢复答案
  restoreAnswers();

  card.innerHTML = renderQuestionContent(q);
  card.className = 'question-card page-card';

  // 绑定事件
  bindQuestionEvents(q);
}

// ====== 渲染题目内容（不含卡片外层） ======
function renderQuestionContent(q) {
  const cfg = EXAM_CONFIG[q.type];
  const qid = q.globalIdx;
  const qdata = q.data;

  const headerHtml = `<div class="q-header">
    <span class="q-num">${qid + 1}</span>
    <span class="q-type-tag">${cfg.label}</span>
    <span class="q-score">${cfg.score} 分</span>
  </div>`;

  let bodyHtml = '';

  switch (q.type) {
    case 'ai_danxuan':
    case 'c_danxuan': {
      bodyHtml = `<div class="q-body">${escapeHtml(qdata.question)}</div><div class="options">`;
      ['A','B','C','D'].forEach(opt => {
        if (qdata.options && qdata.options[opt]) {
          const saved = examState.answers[qid];
          const checked = saved === opt ? ' checked' : '';
          bodyHtml += `<label class="opt-label">
            <input type="radio" name="q${qid}" value="${opt}"${checked}>
            <span class="opt-letter">${opt}</span>
            <span>${escapeHtml(qdata.options[opt])}</span>
          </label>`;
        }
      });
      bodyHtml += '</div>';
      break;
    }
    case 'c_tiankong': {
      const val = escapeAttr(examState.answers[qid] || '');
      bodyHtml = `<div class="q-body">${escapeHtml(qdata.question)}</div>
        <input type="text" class="fill-input" data-qid="${qid}"
          placeholder="请输入答案..." autocomplete="off" value="${val}">`;
      break;
    }
    case 'c_prog_read': {
      const val = escapeAttr(examState.answers[qid] || '');
      bodyHtml = formatProgramQuestion(qdata.question);
      bodyHtml += `<input type="text" class="read-input" data-qid="${qid}"
        placeholder="请输入程序输出结果..." autocomplete="off" value="${val}">`;
      break;
    }
    case 'c_prog_fill': {
      bodyHtml = formatProgramQuestion(qdata.question, true);
      if (qdata.blanks) {
        qdata.blanks.forEach((b, bi) => {
          const savedAns = examState.answers[qid] || {};
          const val = escapeAttr(savedAns[bi] || '');
          bodyHtml += `<div style="margin-top:12px;">
            <span style="font-size:0.85rem;color:var(--text-dim);">填空 ${bi+1}：</span>
            <input type="text" class="fill-input" data-qid="${qid}" data-blank="${bi}"
              placeholder="请输入代码..." autocomplete="off" value="${val}"
              style="display:inline-block;width:calc(100% - 58px);margin-left:8px;margin-top:0;">
          </div>`;
        });
      }
      break;
    }
  }

  return headerHtml + bodyHtml;
}

// ====== 绑定题目事件 ======
function bindQuestionEvents(q) {
  const card = document.getElementById('qcard-current');
  const qid = q.globalIdx;

  card.querySelectorAll('input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', function() {
      examState.answers[qid] = this.value;
      updatePageIndicator();
    });
  });

  card.querySelectorAll('input[type="text"]').forEach(input => {
    input.addEventListener('input', function() {
      const blankPos = this.dataset.blank;
      if (blankPos !== undefined) {
        if (!examState.answers[qid]) examState.answers[qid] = {};
        examState.answers[qid][blankPos] = this.value;
      } else {
        examState.answers[qid] = this.value;
      }
      updatePageIndicator();
    });
  });
}

// ====== 保存当前答案（翻页前） ======
function saveCurrentAnswers() {
  const card = document.getElementById('qcard-current');
  if (!card) return;

  // Radio
  const checked = card.querySelector('input[type="radio"]:checked');
  if (checked) {
    examState.answers[parseInt(checked.name.replace('q',''))] = checked.value;
  }

  // Text inputs
  card.querySelectorAll('input[type="text"]').forEach(inp => {
    const qid = parseInt(inp.dataset.qid);
    const blankPos = inp.dataset.blank;
    if (blankPos !== undefined) {
      if (!examState.answers[qid]) examState.answers[qid] = {};
      examState.answers[qid][blankPos] = inp.value;
    } else {
      examState.answers[qid] = inp.value;
    }
  });
}

// ====== 翻页：前进 ======
function nextQuestion() {
  if (examState.animating) return;
  if (examState.currentPage >= examState.questions.length - 1) return;

  examState.animating = true;
  saveCurrentAnswers();

  const dir = 1; // forward
  const card = document.getElementById('qcard-current');
  card.classList.add('slide-out-left');

  setTimeout(() => {
    card.classList.remove('slide-out-left');
    examState.currentPage++;
    renderCurrentQuestion();
    updatePageIndicator();

    const newCard = document.getElementById('qcard-current');
    newCard.classList.add('slide-in-right');
    setTimeout(() => {
      newCard.classList.remove('slide-in-right');
      examState.animating = false;
    }, 350);
  }, 280);
}

// ====== 翻页：后退 ======
function prevQuestion() {
  if (examState.animating) return;
  if (examState.currentPage <= 0) return;

  examState.animating = true;
  saveCurrentAnswers();

  const card = document.getElementById('qcard-current');
  card.classList.add('slide-out-right');

  setTimeout(() => {
    card.classList.remove('slide-out-right');
    examState.currentPage--;
    renderCurrentQuestion();
    updatePageIndicator();

    const newCard = document.getElementById('qcard-current');
    newCard.classList.add('slide-in-left');
    setTimeout(() => {
      newCard.classList.remove('slide-in-left');
      examState.animating = false;
    }, 350);
  }, 280);
}

// ====== 跳转到指定题 ======
function jumpToQuestion(targetPage) {
  if (examState.animating) return;
  if (targetPage === examState.currentPage) return;
  if (targetPage < 0 || targetPage >= examState.questions.length) return;

  examState.animating = true;
  saveCurrentAnswers();

  const dir = targetPage > examState.currentPage ? 1 : -1;
  const card = document.getElementById('qcard-current');

  card.classList.add(dir > 0 ? 'slide-out-left' : 'slide-out-right');

  setTimeout(() => {
    card.classList.remove('slide-out-left', 'slide-out-right');
    examState.currentPage = targetPage;
    renderCurrentQuestion();
    updatePageIndicator();

    const newCard = document.getElementById('qcard-current');
    newCard.classList.add(dir > 0 ? 'slide-in-right' : 'slide-in-left');
    setTimeout(() => {
      newCard.classList.remove('slide-in-right', 'slide-in-left');
      examState.animating = false;
    }, 350);
  }, 280);
}

// ====== 跳转到题型首题 ======
function jumpToType(type, page) {
  jumpToQuestion(page);
}

// ====== 恢复答案显示 ======
function restoreAnswers() {
  // 答案已保存在 examState.answers 中
  // renderCurrentQuestion 会读取 answers 并设置 checked/value
}

// ====== 题目是否已答 ======
function isQuestionAnswered(idx) {
  const q = examState.questions[idx];
  if (!q) return false;
  const ans = examState.answers[q.globalIdx];
  if (ans === undefined || ans === null || ans === '') return false;
  if (q.type === 'c_prog_fill') {
    return typeof ans === 'object' && Object.values(ans).some(v => v && String(v).trim());
  }
  return String(ans).trim() !== '';
}

// ====== 格式化程序题 ======
function formatProgramQuestion(questionText, isFill) {
  const lines = questionText.split('\n');
  let descLines = [];
  let codeLines = [];
  let inCode = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(#include|int\s+main|void\s+main|int\s+\w+\s*\(|void\s+\w+\s*\(|char\s+\w+\s*\()/.test(trimmed)
        || /^\{/.test(trimmed) || /^\}/.test(trimmed)
        || /^(int|char|float|double|long|void|struct)\s+/.test(trimmed)
        || /^\s*\{/.test(trimmed)) {
      inCode = true;
    }
    if (inCode) { codeLines.push(line); }
    else { descLines.push(trimmed); }
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

  let html = '';
  if (descLines.length > 0) {
    html += `<div class="q-body">${escapeHtml(descLines.join('\n'))}</div>`;
  }
  if (codeLines.length > 0) {
    html += `<div class="code-block"><pre>${highlightCode(codeLines.join('\n'), isFill)}</pre></div>`;
  }
  return html;
}

function highlightCode(code, markBlanks) {
  let escaped = escapeHtml(code);
  if (markBlanks) {
    escaped = escaped.replace(/_{2,}|__________/g, '<span class="blank">______</span>');
  }
  escaped = escaped.replace(/\b(int|char|float|double|long|short|void|struct|enum|union|typedef|sizeof|return|if|else|switch|case|break|default|for|while|do|continue|goto|const|static|extern|volatile|unsigned|signed|auto|register)\b/g, '<span class="kw">$1</span>');
  escaped = escaped.replace(/^(#\s*\w+.*)$/gm, '<span class="pp">$1</span>');
  escaped = escaped.replace(/(&quot;.*?&quot;)/g, '<span class="str">$1</span>');
  escaped = escaped.replace(/\b(\d+\.?\d*[fFlL]?)\b/g, '<span class="num">$1</span>');
  escaped = escaped.replace(/(\/\/.*$)/gm, '<span class="cm">$1</span>');
  escaped = escaped.replace(/\b(printf|scanf|main|malloc|free|strlen|strcpy|strcmp|gets|puts|getchar|putchar)\b/g, '<span class="fn">$1</span>');
  return escaped;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escapeAttr(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ====== 倒计时 ======
function startTimer() {
  updateTimerDisplay();
  examState.timerInterval = setInterval(() => {
    examState.timeLeft--;
    updateTimerDisplay();
    if (examState.timeLeft <= 0) {
      clearInterval(examState.timerInterval);
      autoSubmit();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const t = examState.timeLeft;
  const mins = Math.floor(t / 60);
  const secs = t % 60;
  document.getElementById('timer-text').textContent =
    `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

  const circle = document.getElementById('timer-circle');
  const circumference = 150.8;
  const progress = t / TOTAL_TIME;
  circle.style.strokeDasharray = circumference;
  circle.style.strokeDashoffset = circumference * (1 - progress);

  if (t <= 300) {
    circle.style.stroke = 'var(--red)';
    document.getElementById('timer-text').style.color = 'var(--red)';
  } else if (t <= 600) {
    circle.style.stroke = 'var(--amber)';
    document.getElementById('timer-text').style.color = 'var(--amber)';
  }
}

// ====== 交卷 ======
function submitExam() {
  saveCurrentAnswers();
  const totalQs = examState.questions.length;
  let answeredCount = 0;
  examState.questions.forEach(q => {
    const ans = examState.answers[q.globalIdx];
    if (q.type === 'c_prog_fill') {
      if (ans && typeof ans === 'object' && Object.values(ans).some(v => v && String(v).trim())) answeredCount++;
    } else {
      if (ans && String(ans).trim()) answeredCount++;
    }
  });

  document.getElementById('confirm-info').textContent =
    `你已完成 ${answeredCount}/${totalQs} 题，确认提交吗？未作答的题目将计 0 分。`;
  document.getElementById('confirm-modal').classList.add('show');
}

function closeModal() {
  document.getElementById('confirm-modal').classList.remove('show');
}

function confirmSubmit() {
  closeModal();
  clearInterval(examState.timerInterval);
  examState.submitted = true;
  gradeExam();
}

function autoSubmit() {
  clearInterval(examState.timerInterval);
  examState.submitted = true;
  gradeExam();
}

// ====== 判卷 ======
function gradeExam() {
  const types = ['ai_danxuan', 'c_danxuan', 'c_tiankong', 'c_prog_read', 'c_prog_fill'];
  const typeScores = {};
  const typeMax = {};
  const wrongQs = [];
  let totalScore = 0;
  let totalMax = 0;

  types.forEach(t => { typeScores[t] = 0; typeMax[t] = 0; });

  examState.questions.forEach(q => {
    const cfg = EXAM_CONFIG[q.type];
    typeMax[q.type] += cfg.score;

    const userAns = examState.answers[q.globalIdx];
    let isCorrect = false;
    let userDisplay = '';
    let correctDisplay = '';

    switch (q.type) {
      case 'ai_danxuan':
      case 'c_danxuan': {
        const ua = String(userAns || '').trim().toUpperCase();
        const ca = String(q.data.answer || '').trim().toUpperCase();
        userDisplay = ua || '未作答';
        correctDisplay = ca + (q.data.options && q.data.options[ca] ? ` (${q.data.options[ca]})` : '');
        isCorrect = ua === ca;
        break;
      }
      case 'c_tiankong':
      case 'c_prog_read': {
        const ua = String(userAns || '').trim();
        const acceptable = q.data.acceptable_answers || [q.data.answer];
        userDisplay = ua || '未作答';
        correctDisplay = acceptable.join(' 或 ');
        isCorrect = acceptable.some(a => normalizeAnswer(ua) === normalizeAnswer(a));
        break;
      }
      case 'c_prog_fill': {
        const blanks = q.data.blanks || [];
        let allCorrect = true;
        userDisplay = [];
        correctDisplay = [];
        blanks.forEach(b => {
          const ua = String((userAns && userAns[b.position - 1]) || '').trim();
          const acceptable = b.acceptable_answers || [b.answer];
          userDisplay.push(`空${b.position}: ${ua || '未作答'}`);
          correctDisplay.push(`空${b.position}: ${acceptable.join(' 或 ')}`);
          if (!acceptable.some(a => normalizeAnswer(ua) === normalizeAnswer(a))) allCorrect = false;
        });
        userDisplay = userDisplay.join('; ');
        correctDisplay = correctDisplay.join('; ');
        isCorrect = allCorrect;
        break;
      }
    }

    if (isCorrect) {
      typeScores[q.type] += cfg.score;
      totalScore += cfg.score;
    } else {
      wrongQs.push({
        type: q.type, typeLabel: cfg.label, globalIdx: q.globalIdx,
        question: q.data.question, options: q.data.options || null,
        userAnswer: userDisplay, correctAnswer: correctDisplay,
        explanation: q.data.explanation || null, score: cfg.score
      });
    }
    totalMax += cfg.score;
  });

  examState.typeScores = typeScores;
  examState.typeMax = typeMax;
  examState.totalScore = totalScore;
  examState.totalMax = totalMax;
  examState.wrongQs = wrongQs;
  examState.graded = true;

  showResult();
}

function normalizeAnswer(s) {
  return String(s).replace(/\s+/g, '').toLowerCase();
}

// ====== 显示成绩 ======
function showResult() {
  switchScreen('result-screen');

  const score = examState.totalScore;
  const percentage = examState.totalMax > 0 ? score / examState.totalMax : 0;

  let grade = '', gradeColor = '';
  if (percentage >= 0.9) { grade = '🏆 优秀'; gradeColor = 'var(--cyan)'; }
  else if (percentage >= 0.8) { grade = '👍 良好'; gradeColor = 'var(--green)'; }
  else if (percentage >= 0.7) { grade = '📖 中等'; gradeColor = 'var(--amber)'; }
  else if (percentage >= 0.6) { grade = '📚 及格'; gradeColor = 'var(--amber)'; }
  else { grade = '💪 继续努力'; gradeColor = 'var(--red)'; }
  document.getElementById('score-grade').textContent = grade;
  document.getElementById('score-grade').style.color = gradeColor;

  const circle = document.getElementById('score-circle');
  const circumference = 597;
  circle.style.strokeDasharray = circumference;
  circle.style.strokeDashoffset = circumference;
  if (percentage >= 0.9) circle.style.stroke = 'var(--cyan)';
  else if (percentage >= 0.7) circle.style.stroke = 'var(--green)';
  else if (percentage >= 0.6) circle.style.stroke = 'var(--amber)';
  else circle.style.stroke = 'var(--red)';

  setTimeout(() => {
    circle.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)';
    circle.style.strokeDashoffset = circumference * (1 - percentage);
  }, 100);

  animateNumber('score-number', 0, score, 1500);

  const types = ['ai_danxuan', 'c_danxuan', 'c_tiankong', 'c_prog_read', 'c_prog_fill'];
  document.getElementById('result-details').innerHTML = types.map(t => {
    const cfg = EXAM_CONFIG[t];
    const earned = examState.typeScores[t] || 0;
    const maxScore = examState.typeMax[t] || 0;
    const pct = maxScore > 0 ? earned / maxScore : 0;
    return `<div class="detail-item">
      <span class="detail-icon">${cfg.icon}</span>
      <div class="detail-info">
        <strong>${cfg.label}</strong>
        <div class="detail-bar"><div class="detail-bar-fill" data-fill="${pct*100}" style="width:0;background:${pct>=0.6?'var(--cyan)':'var(--red)'}"></div></div>
      </div>
      <span class="detail-score">${earned} / ${maxScore}</span>
    </div>`;
  }).join('');

  setTimeout(() => {
    document.querySelectorAll('.detail-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.fill + '%';
    });
  }, 300);

  let wrongHtml = '';
  if (examState.wrongQs.length === 0) {
    wrongHtml = `<div style="text-align:center;padding:40px;color:var(--green);font-size:1.2rem;">🎉 全部正确，太厉害了！</div>`;
  } else {
    wrongHtml = `<h3>📋 错题回顾 (${examState.wrongQs.length} 题)</h3>`;
    examState.wrongQs.forEach(w => {
      const qText = String(w.question).substring(0, 200) + (String(w.question).length > 200 ? '...' : '');
      wrongHtml += `<details class="wrong-card">
        <summary>第 ${w.globalIdx + 1} 题 · ${w.typeLabel} · 扣 ${w.score} 分</summary>
        <div class="wrong-body">
          <div style="margin-bottom:8px;"><strong>题目：</strong>${escapeHtml(qText)}</div>
          <div class="your-answer">❌ 你的答案：${escapeHtml(w.userAnswer)}</div>
          <div class="correct-answer">✅ 正确答案：${escapeHtml(w.correctAnswer)}</div>
          ${w.explanation ? `<div class="explanation">💡 ${escapeHtml(w.explanation)}</div>` : ''}
        </div>
      </details>`;
    });
  }
  document.getElementById('wrong-questions').innerHTML = wrongHtml;
}

function animateNumber(elementId, from, to, duration) {
  const el = document.getElementById(elementId);
  const start = performance.now();
  function update(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function restartExam() {
  clearInterval(examState.timerInterval);
  examState = { questions:[], answers:{}, currentPage:0, timeLeft:TOTAL_TIME, timerInterval:null, submitted:false, animating:false, graded:false };
  switchScreen('home-screen');
}

// ====== 键盘快捷键 ======
document.addEventListener('keydown', function(e) {
  if (!document.getElementById('exam-screen').classList.contains('active')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
    e.preventDefault();
    nextQuestion();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault();
    prevQuestion();
  }
});

// ====== 触屏滑动 ======
(function initSwipe() {
  let touchStartX = 0, touchStartY = 0;
  document.addEventListener('touchstart', function(e) {
    if (!document.getElementById('exam-screen').classList.contains('active')) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive:true });

  document.addEventListener('touchend', function(e) {
    if (!document.getElementById('exam-screen').classList.contains('active')) return;
    const dx = (e.changedTouches[0]?.clientX || touchStartX) - touchStartX;
    const dy = (e.changedTouches[0]?.clientY || touchStartY) - touchStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < -30) nextQuestion();
      else if (dx > 30) prevQuestion();
    }
  });
})();

// ====== Canvas 粒子背景 ======
(function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  const maxParticles = 60;
  let mouseX = -1000, mouseY = -1000;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.vx = (Math.random() - 0.5) * 0.4;
      this.vy = (Math.random() - 0.5) * 0.4;
      this.size = Math.random() * 2 + 0.5;
      this.opacity = Math.random() * 0.4 + 0.1;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      const dx = mouseX - this.x;
      const dy = mouseY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 150) {
        this.vx += (dx / dist) * 0.015;
        this.vy += (dy / dist) * 0.015;
      }
      this.vx *= 0.99;
      this.vy *= 0.99;
      if (this.x < 0) this.x = canvas.width;
      if (this.x > canvas.width) this.x = 0;
      if (this.y < 0) this.y = canvas.height;
      if (this.y > canvas.height) this.y = 0;
    }
    draw(ctx) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,229,255,${this.opacity})`;
      ctx.fill();
    }
  }

  for (let i = 0; i < maxParticles; i++) particles.push(new Particle());

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(ctx); });
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0,229,255,${0.06 * (1 - dist/120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(animate);
  }
  animate();
})();
