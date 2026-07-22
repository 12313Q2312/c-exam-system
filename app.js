/* ============================================
   考试核心逻辑 — 一题一页 + 翻页动效版
   含登录验证 & 成绩排行榜 & 烟花彩蛋
   ============================================ */

// ====== 全局状态 ======
const TOTAL_TIME = 120 * 60; // 120 分钟 (2 小时)
const EXAM_CONFIG = {
  ai_danxuan:    { count:20, score:1, label:'AI 单选题',   icon:'🧠', shortLabel:'AI选择'  },
  c_danxuan:     { count:20, score:1, label:'C 单选题',    icon:'📝', shortLabel:'C单选'   },
  c_tiankong:    { count:15, score:1, label:'C 填空题',    icon:'✍️', shortLabel:'C填空'   },
  c_prog_read:   { count:5,  score:3, label:'程序阅读题',  icon:'🔍', shortLabel:'阅读'    },
  c_prog_fill:   { count:5,  score:3, label:'程序补全题',  icon:'🔧', shortLabel:'补全', perBlank:true },
};

// 当前考生信息
let currentStudent = { name: '', stuid: '' };

let examState = {
  questions: [],       // [{type, globalIdx, data, score}]
  answers: {},         // {globalIdx: answer}
  currentPage: 0,      // 当前题目索引 0~60
  timeLeft: TOTAL_TIME,
  timerInterval: null,
  submitted: false,
  animating: false
};

// ====== 本地存储 — 成绩记录 ======
function getScoreHistory() {
  try {
    const raw = localStorage.getItem('exam_score_history');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveScoreRecord(record) {
  const history = getScoreHistory();
  history.push(record);
  localStorage.setItem('exam_score_history', JSON.stringify(history));
}

// ====== 登录验证 ======
function confirmLogin() {
  const nameInput = document.getElementById('input-name');
  const stuidInput = document.getElementById('input-stuid');
  const errorEl = document.getElementById('login-error');

  const name = nameInput.value.trim();
  const stuid = stuidInput.value.trim();

  if (!name) { errorEl.textContent = '请输入姓名'; nameInput.focus(); return; }
  if (!stuid) { errorEl.textContent = '请输入学号'; stuidInput.focus(); return; }

  errorEl.textContent = '';
  currentStudent = { name, stuid };
  switchScreen('home-screen');
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && document.getElementById('login-screen').classList.contains('active')) {
    e.preventDefault(); confirmLogin();
  }
});

// ====== Fisher-Yates 洗牌 ======
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pickRandom(arr, n) { return shuffle(arr).slice(0, Math.min(n, arr.length)); }

// ====== 切换屏幕 ======
function switchScreen(showId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(showId);
  el.classList.add('active');
  el.style.animation = 'none'; el.offsetHeight;
  el.style.animation = 'fadeScaleIn 0.4s ease';
}

// ====== 开始考试 ======
function startExam() {
  const qs = [];
  let idx = 0;

  const shuffledAI = shuffle(window.AI_QUESTIONS);

  // AI 选择题：全部20道
  shuffledAI.slice(0, EXAM_CONFIG.ai_danxuan.count).forEach(q => {
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
    questions: qs, answers: {}, currentPage: 0,
    timeLeft: TOTAL_TIME, timerInterval: null,
    submitted: false, animating: false
  };

  qs.forEach(q => {
    if (q.type === 'c_prog_fill') { examState.answers[q.globalIdx] = {}; }
    else { examState.answers[q.globalIdx] = ''; }
  });

  document.getElementById('progress-total').textContent = qs.length;
  renderPageFooter();
  renderCurrentQuestion();
  switchScreen('exam-screen');
  startTimer();
}

// ====== 渲染底部导航 ======
function renderPageFooter() {
  const typeTabs = document.getElementById('page-type-tabs');
  if (!typeTabs) return;
  const types = ['ai_danxuan', 'c_danxuan', 'c_tiankong', 'c_prog_read', 'c_prog_fill'];
  const startIndices = {};
  types.forEach(t => { const first = examState.questions.findIndex(q => q.type === t); startIndices[t] = first >= 0 ? first : 0; });

  typeTabs.innerHTML = types.map(t => {
    const cfg = EXAM_CONFIG[t];
    const first = startIndices[t];
    return `<button class="type-tab" data-type="${t}" onclick="jumpToType('${t}', ${first})">${cfg.icon} ${cfg.shortLabel}</button>`;
  }).join('');

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

  document.querySelectorAll('.type-tab').forEach(tab => {
    const type = tab.dataset.type;
    const currType = examState.questions[p]?.type;
    tab.classList.toggle('current', type === currType);
  });

  document.querySelectorAll('.page-dot').forEach((dot, i) => {
    dot.classList.toggle('current', i === p);
    dot.classList.toggle('answered', isQuestionAnswered(i));
  });

  document.getElementById('btn-prev').disabled = p <= 0;
  document.getElementById('btn-next').disabled = p >= examState.questions.length - 1;
}

// ====== 渲染当前题 ======
function renderCurrentQuestion() {
  const p = examState.currentPage;
  if (p < 0 || p >= examState.questions.length) return;
  const q = examState.questions[p];
  const card = document.getElementById('qcard-current');
  card.innerHTML = renderQuestionContent(q);
  card.className = 'question-card page-card';
  bindQuestionEvents(q);
}

// ====== 渲染题目内容 ======
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
            <span class="opt-letter">${opt}</span><span>${escapeHtml(qdata.options[opt])}</span>
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
          bodyHtml += `<div class="fill-block">
            <span class="fill-block-label">填空 ${bi+1}</span>
            <textarea class="code-fill-input" data-qid="${qid}" data-blank="${bi}"
              placeholder="请输入代码片段..." autocomplete="off" rows="2">${val}</textarea>
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

  card.querySelectorAll('input[type="text"], textarea').forEach(input => {
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

// ====== 保存当前答案 ======
function saveCurrentAnswers() {
  const card = document.getElementById('qcard-current');
  if (!card) return;
  const checked = card.querySelector('input[type="radio"]:checked');
  if (checked) { examState.answers[parseInt(checked.name.replace('q',''))] = checked.value; }
  card.querySelectorAll('input[type="text"], textarea').forEach(inp => {
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

// ====== 翻页动画 ======
function nextQuestion() {
  if (examState.animating) return;
  if (examState.currentPage >= examState.questions.length - 1) return;
  examState.animating = true; saveCurrentAnswers();
  const card = document.getElementById('qcard-current');
  card.classList.add('slide-out-left');
  setTimeout(() => {
    card.classList.remove('slide-out-left');
    examState.currentPage++;
    renderCurrentQuestion(); updatePageIndicator();
    const newCard = document.getElementById('qcard-current');
    newCard.classList.add('slide-in-right');
    setTimeout(() => { newCard.classList.remove('slide-in-right'); examState.animating = false; }, 350);
  }, 280);
}

function prevQuestion() {
  if (examState.animating) return;
  if (examState.currentPage <= 0) return;
  examState.animating = true; saveCurrentAnswers();
  const card = document.getElementById('qcard-current');
  card.classList.add('slide-out-right');
  setTimeout(() => {
    card.classList.remove('slide-out-right');
    examState.currentPage--;
    renderCurrentQuestion(); updatePageIndicator();
    const newCard = document.getElementById('qcard-current');
    newCard.classList.add('slide-in-left');
    setTimeout(() => { newCard.classList.remove('slide-in-left'); examState.animating = false; }, 350);
  }, 280);
}

function jumpToQuestion(targetPage) {
  if (examState.animating) return;
  if (targetPage === examState.currentPage) return;
  if (targetPage < 0 || targetPage >= examState.questions.length) return;
  examState.animating = true; saveCurrentAnswers();
  const dir = targetPage > examState.currentPage ? 1 : -1;
  const card = document.getElementById('qcard-current');
  card.classList.add(dir > 0 ? 'slide-out-left' : 'slide-out-right');
  setTimeout(() => {
    card.classList.remove('slide-out-left', 'slide-out-right');
    examState.currentPage = targetPage;
    renderCurrentQuestion(); updatePageIndicator();
    const newCard = document.getElementById('qcard-current');
    newCard.classList.add(dir > 0 ? 'slide-in-right' : 'slide-in-left');
    setTimeout(() => { newCard.classList.remove('slide-in-right', 'slide-in-left'); examState.animating = false; }, 350);
  }, 280);
}

function jumpToType(type, page) { jumpToQuestion(page); }

// ====== 辅助函数 ======
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

function formatProgramQuestion(questionText, isFill) {
  const lines = questionText.split('\n');
  let descLines = [], codeLines = [], inCode = false;

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
    // 带行号的代码块
    const numbered = codeLines.map((l, i) =>
      `<span class="code-line"><span class="line-num">${i + 1}</span>${highlightCodeLine(l, isFill)}</span>`
    ).join('\n');
    html += `<div class="code-block"><pre>${numbered}</pre></div>`;
  }
  return html;
}

function highlightCodeLine(line, markBlanks) {
  let escaped = escapeHtml(line);
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

function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str) { return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ====== 倒计时 ======
function startTimer() {
  updateTimerDisplay();
  examState.timerInterval = setInterval(() => {
    examState.timeLeft--;
    updateTimerDisplay();
    if (examState.timeLeft <= 0) { clearInterval(examState.timerInterval); autoSubmit(); }
  }, 1000);
}

function updateTimerDisplay() {
  const t = examState.timeLeft;
  const mins = Math.floor(t / 60);
  const secs = t % 60;
  document.getElementById('timer-text').textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

  const circle = document.getElementById('timer-circle');
  const circumference = 150.8;
  const progress = t / TOTAL_TIME;
  circle.style.strokeDasharray = circumference;
  circle.style.strokeDashoffset = circumference * (1 - progress);

  if (t <= 600) {
    circle.style.stroke = 'var(--red)';
    document.getElementById('timer-text').style.color = 'var(--red)';
  } else if (t <= 1200) {
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

function closeModal() { document.getElementById('confirm-modal').classList.remove('show'); }
function confirmSubmit() { closeModal(); clearInterval(examState.timerInterval); examState.submitted = true; gradeExam(); }
function autoSubmit() { clearInterval(examState.timerInterval); examState.submitted = true; gradeExam(); }

// ====== 判卷 ======
function gradeExam() {
  const types = ['ai_danxuan', 'c_danxuan', 'c_tiankong', 'c_prog_read', 'c_prog_fill'];
  const typeScores = {};
  const typeMax = {};
  const wrongQs = [];
  let totalScore = 0;
  types.forEach(t => { typeScores[t] = 0; typeMax[t] = 0; });

  examState.questions.forEach(q => {
    const cfg = EXAM_CONFIG[q.type];
    const userAns = examState.answers[q.globalIdx];
    let questionScore = 0;        // 本题实际得分
    let questionMaxScore = 0;     // 本题满分
    let isCorrect = false;
    let userDisplay = '';
    let correctDisplay = '';

    switch (q.type) {
      case 'ai_danxuan':
      case 'c_danxuan': {
        questionMaxScore = cfg.score;
        const ua = String(userAns || '').trim().toUpperCase();
        const ca = String(q.data.answer || '').trim().toUpperCase();
        userDisplay = ua || '未作答';
        correctDisplay = ca + (q.data.options && q.data.options[ca] ? ` (${q.data.options[ca]})` : '');
        isCorrect = ua === ca;
        if (isCorrect) questionScore = cfg.score;
        break;
      }
      case 'c_tiankong':
      case 'c_prog_read': {
        questionMaxScore = cfg.score;
        const ua = String(userAns || '').trim();
        const acceptable = q.data.acceptable_answers || [q.data.answer];
        userDisplay = ua || '未作答';
        correctDisplay = acceptable.join(' 或 ');
        isCorrect = acceptable.some(a => normalizeAnswer(ua) === normalizeAnswer(a));
        if (isCorrect) questionScore = cfg.score;
        break;
      }
      case 'c_prog_fill': {
        // 逐空计分：每空3分，独立评分
        const blanks = q.data.blanks || [];
        const perBlankScore = cfg.score; // 每空3分
        let hasWrongBlank = false;
        userDisplay = []; correctDisplay = [];
        blanks.forEach(b => {
          const ua = String((userAns && userAns[b.position - 1]) || '').trim();
          const acceptable = b.acceptable_answers || [b.answer];
          userDisplay.push(`空${b.position}: ${ua || '未作答'}`);
          correctDisplay.push(`空${b.position}: ${acceptable.join(' 或 ')}`);
          const blankCorrect = acceptable.some(a => normalizeAnswer(ua) === normalizeAnswer(a));
          if (blankCorrect) {
            questionScore += perBlankScore;
          } else {
            hasWrongBlank = true;
          }
          questionMaxScore += perBlankScore;
        });
        userDisplay = userDisplay.join('; ');
        correctDisplay = correctDisplay.join('; ');
        isCorrect = !hasWrongBlank; // 全对才标记为正确
        break;
      }
    }

    typeMax[q.type] += questionMaxScore;
    totalScore += questionScore;
    typeScores[q.type] += questionScore;

    if (!isCorrect) {
      wrongQs.push({
        type: q.type, typeLabel: cfg.label, globalIdx: q.globalIdx,
        question: q.data.question, options: q.data.options || null,
        userAnswer: userDisplay, correctAnswer: correctDisplay,
        explanation: q.data.explanation || null, score: questionMaxScore - questionScore
      });
    }
  });

  examState.typeScores = typeScores;
  examState.typeMax = typeMax;
  examState.totalScore = totalScore;
  examState.totalMax = Object.values(typeMax).reduce((a, b) => a + b, 0);
  examState.wrongQs = wrongQs;
  // 保存错题到本地存储
  saveWrongQuestions(wrongQs);
  examState.graded = true;

  // 保存成绩
  saveScoreRecord({
    name: currentStudent.name,
    stuid: currentStudent.stuid,
    score: totalScore,
    time: new Date().toISOString()
  });

  showResult();
}

function normalizeAnswer(s) { return String(s).replace(/\s+/g, '').toLowerCase(); }

// ====== 显示成绩 ======
function showResult() {
  switchScreen('result-screen');

  const score = examState.totalScore;
  const totalMax = examState.totalMax || 100;
  const percentage = totalMax > 0 ? score / totalMax : 0;

  // 动态更新总分显示
  const scoreUnitEl = document.getElementById('score-unit');
  if (scoreUnitEl) scoreUnitEl.textContent = `/ ${totalMax}`;

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
    document.querySelectorAll('.detail-bar-fill').forEach(bar => { bar.style.width = bar.dataset.fill + '%'; });
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

  // 彩蛋：超过90%分放烟花
  if (percentage >= 0.9) {
    setTimeout(() => launchFireworks(), 800);
  }
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
  // 清理烟花canvas
  const fc = document.getElementById('fireworks-canvas');
  if (fc) fc.remove();
  switchScreen('home-screen');
}

// ====== 烟花彩蛋 (Canvas) ======
function launchFireworks() {
  // 创建烟花canvas
  const existing = document.getElementById('fireworks-canvas');
  if (existing) existing.remove();

  const canvas = document.createElement('canvas');
  canvas.id = 'fireworks-canvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2000;pointer-events:none;';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const LETTERS = ['G', 'O', 'O', 'D'];

  // 定义GOOD的目标位置
  function getGoodPositions() {
    const positions = [];
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const cellW = 90, cellH = 120;
    const totalW = 4 * cellW;
    const startX = cx - totalW / 2;
    const startY = cy - cellH / 2;

    // G 字母路径 (简化)
    const letterPaths = {
      'G': [
        [0.3,0.1],[0.5,0.1],[0.7,0.1],[0.8,0.15],[0.8,0.3],[0.7,0.5],[0.5,0.5],[0.3,0.5],
        [0.2,0.5],[0.15,0.4],[0.15,0.3],[0.15,0.7],[0.2,0.8],[0.3,0.9],[0.5,0.9],
        [0.7,0.9],[0.8,0.85],[0.8,0.7],[0.6,0.65],[0.5,0.65]
      ],
      'O': [
        [0.25,0.15],[0.5,0.1],[0.75,0.15],[0.85,0.35],[0.85,0.65],
        [0.75,0.85],[0.5,0.9],[0.25,0.85],[0.15,0.65],[0.15,0.35]
      ],
      'D': [
        [0.15,0.1],[0.15,0.3],[0.15,0.5],[0.15,0.7],[0.15,0.9],
        [0.3,0.9],[0.5,0.85],[0.7,0.75],[0.75,0.6],[0.75,0.4],
        [0.7,0.25],[0.5,0.15],[0.3,0.1]
      ]
    };

    LETTERS.forEach((letter, li) => {
      const lx = startX + li * cellW;
      const ly = startY;
      const path = letterPaths[letter] || [];
      path.forEach(([px, py]) => {
        for (let j = 0; j < 3; j++) {
          positions.push({
            x: lx + px * cellW + (Math.random() - 0.5) * 8,
            y: ly + py * cellH + (Math.random() - 0.5) * 8
          });
        }
      });
    });

    return positions;
  }

  const goodTargets = getGoodPositions();

  // 第一阶段：放烟花（随机粒子）
  for (let i = 0; i < 300; i++) {
    const burstX = Math.random() * canvas.width;
    const burstY = Math.random() * canvas.height * 0.6;
    const burstTime = Math.random() * 2000; // 0-2秒内爆炸
    const targetAngle = Math.random() * Math.PI * 2;
    const targetSpeed = 2 + Math.random() * 5;
    const life = 1.5 + Math.random() * 2.5;
    const hue = Math.random() * 60 + 20; // 暖色系

    particles.push({
      x: burstX, y: burstY,
      vx: Math.cos(targetAngle) * targetSpeed,
      vy: Math.sin(targetAngle) * targetSpeed,
      life, maxLife: life,
      burstTime,
      born: performance.now(),
      phase: 'burst',
      hue,
      size: 2 + Math.random() * 3,
      target: null,
      targetReached: false,
      convergeStart: 0
    });
  }

  // 第二阶段标记
  let phase2Started = false;
  const PHASE1_DURATION = 3500; // 3.5秒烟花

  function animate(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const elapsed = now - particles[0]?.born || 0;

    // 进入第二阶段：汇聚成GOOD
    if (elapsed > PHASE1_DURATION && !phase2Started) {
      phase2Started = true;

      // 重置所有粒子，分配目标
      particles.forEach((p, i) => {
        if (i < goodTargets.length) {
          p.target = goodTargets[i];
          p.phase = 'converge';
          p.convergeStart = now;
          p.convergeDuration = 2000 + Math.random() * 500;
          p.startX = p.x;
          p.startY = p.y;
          p.life = 3;
          p.maxLife = 3;
          p.hue = 200 + Math.random() * 40; // 蓝色/青色系
          p.size = 2.5 + Math.random() * 2;
        } else {
          // 多余粒子渐隐
          p.life = 0;
        }
      });
    }

    let aliveCount = 0;
    particles.forEach(p => {
      const age = (now - p.born) / 1000;

      if (p.phase === 'burst') {
        if (age * 1000 < p.burstTime) {
          // 还没炸，上升中
          p.x = p.x + Math.cos(age * 3) * 0.3;
          p.y -= 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,200,0.8)`;
          ctx.fill();
          aliveCount++;
        } else if ((age * 1000 - p.burstTime) / 1000 < p.maxLife) {
          // 炸开后飘散
          const burstAge = (age * 1000 - p.burstTime) / 1000;
          p.x += p.vx * 0.6;
          p.y += p.vy * 0.6;
          p.vy += 0.05;
          const alpha = Math.max(0, 1 - burstAge / p.maxLife);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - burstAge / p.maxLife), 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${p.hue},100%,60%,${alpha})`;
          ctx.fill();
          aliveCount++;
        }
      } else if (p.phase === 'converge' && p.target) {
        const cAge = (now - p.convergeStart) / 1000;
        const progress = Math.min(1, cAge / (p.convergeDuration / 1000));

        // easeInOutCubic
        const eased = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        p.x = p.startX + (p.target.x - p.startX) * eased;
        p.y = p.startY + (p.target.y - p.startY) * eased;

        const alpha = progress < 0.9 ? 0.9 : 0.9 * (1 - (progress - 0.9) / 0.1);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue},100%,65%,${Math.max(0, alpha)})`;
        ctx.fill();
        aliveCount++;
      }
    });

    // 汇聚完成后显示"GOOD"光晕
    if (phase2Started && aliveCount < 30) {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      ctx.save();
      ctx.font = 'bold 160px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 光晕
      const glowAlpha = Math.min(0.8, (now - (particles[0]?.born || now) - PHASE1_DURATION - 1500) / 1000);
      if (glowAlpha > 0) {
        ctx.shadowColor = 'rgba(0,229,255,0.8)';
        ctx.shadowBlur = 40;
        ctx.fillStyle = `rgba(0,229,255,${glowAlpha})`;
        ctx.fillText('GOOD', cx, cy);
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(255,255,255,${glowAlpha})`;
        ctx.fillText('GOOD', cx, cy);
      }
      ctx.restore();

      // 渐隐canvas
      if (glowAlpha >= 0.7) {
        setTimeout(() => {
          canvas.style.transition = 'opacity 2s';
          canvas.style.opacity = '0';
          setTimeout(() => canvas.remove(), 2000);
        }, 1500);
      }
    }

    if (aliveCount > 0 || !phase2Started) {
      requestAnimationFrame(animate);
    } else {
      canvas.remove();
    }
  }

  requestAnimationFrame(animate);
}

// ====== 排行榜 ======
function showLeaderboard() {
  const history = getScoreHistory();
  const tbody = document.getElementById('leaderboard-body');
  const emptyEl = document.getElementById('leaderboard-empty');

  if (history.length === 0) {
    tbody.innerHTML = '';
    emptyEl.style.display = 'block';
  } else {
    emptyEl.style.display = 'none';
    const sorted = [...history].sort((a, b) => b.score - a.score);

    tbody.innerHTML = sorted.map((r, i) => {
      const rank = i + 1;
      let rankHtml = `<span class="rank-badge">${rank}</span>`;
      if (rank === 1) rankHtml = `<span class="rank-badge rank-1">🥇</span>`;
      else if (rank === 2) rankHtml = `<span class="rank-badge rank-2">🥈</span>`;
      else if (rank === 3) rankHtml = `<span class="rank-badge rank-3">🥉</span>`;

      const timeStr = new Date(r.time).toLocaleString('zh-CN', {
        month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'
      });

      const isCurrent = r.name === currentStudent.name && r.stuid === currentStudent.stuid && r.score === examState.totalScore;
      const rowClass = isCurrent ? ' class="current-student"' : '';

      return `<tr${rowClass}>
        <td>${rankHtml}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.stuid)}</td>
        <td><strong>${r.score}</strong></td>
        <td>${timeStr}</td>
      </tr>`;
    }).join('');
  }

  document.getElementById('leaderboard-modal').classList.add('show');
}

function closeLeaderboard() {
  document.getElementById('leaderboard-modal').classList.remove('show');
}

// ====== 键盘快捷键 ======
document.addEventListener('keydown', function(e) {
  if (!document.getElementById('exam-screen').classList.contains('active')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); nextQuestion(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); prevQuestion(); }
});

// ====== 触屏滑动 ======
(function initSwipe() {
  let touchStartX = 0, touchStartY = 0;
  document.addEventListener('touchstart', function(e) {
    if (!document.getElementById('exam-screen').classList.contains('active')) return;
    touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY;
  }, { passive:true });
  document.addEventListener('touchend', function(e) {
    if (!document.getElementById('exam-screen').classList.contains('active')) return;
    const dx = (e.changedTouches[0]?.clientX || touchStartX) - touchStartX;
    const dy = (e.changedTouches[0]?.clientY || touchStartY) - touchStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < -30) nextQuestion(); else if (dx > 30) prevQuestion();
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

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
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
      this.x += this.vx; this.y += this.vy;
      const dx = mouseX - this.x, dy = mouseY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 150) { this.vx += (dx / dist) * 0.015; this.vy += (dy / dist) * 0.015; }
      this.vx *= 0.99; this.vy *= 0.99;
      if (this.x < 0) this.x = canvas.width; if (this.x > canvas.width) this.x = 0;
      if (this.y < 0) this.y = canvas.height; if (this.y > canvas.height) this.y = 0;
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

// ====== 错题本 (Wrong Question Review) ======
let wrongReviewState = {
  questions: [],
  currentPage: 0
};

// 保存错题到本地存储
function saveWrongQuestions(wrongQs) {
  if (!currentStudent || !currentStudent.stuid) return;
  const key = 'exam_wrong_questions_' + currentStudent.stuid + '_' + currentStudent.name;
  try {
    localStorage.setItem(key, JSON.stringify(wrongQs));
    localStorage.setItem('exam_last_wrong_key', key);
  } catch (e) {}
}

// 加载错题
function loadWrongQuestions() {
  const key = localStorage.getItem('exam_last_wrong_key');
  if (!key) return [];
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

// 打开错题本
function openWrongReview() {
  const wrongQs = loadWrongQuestions();
  if (!wrongQs || wrongQs.length === 0) {
    wrongReviewState = { questions: [], currentPage: 0 };
    const card = document.getElementById('wrong-qcard-current');
    card.innerHTML = '<div class="wrong-empty"><div class="wrong-empty-icon">📖</div><div>暂无错题记录，先做一套题吧！</div></div>';
    document.getElementById('wrong-progress-total').textContent = '0';
    document.getElementById('wrong-count-label').textContent = '共 0 道错题';
    document.getElementById('wrong-page-dots').innerHTML = '';
    document.getElementById('wrong-btn-prev').disabled = true;
    document.getElementById('wrong-btn-next').disabled = true;
    document.getElementById('wrong-progress-current').textContent = '0';
    switchScreen('wrong-review-screen');
    return;
  }

  wrongReviewState = {
    questions: wrongQs,
    currentPage: 0
  };

  document.getElementById('wrong-progress-total').textContent = wrongQs.length;
  document.getElementById('wrong-count-label').textContent = '共 ' + wrongQs.length + ' 道错题';
  renderWrongPageDots();
  renderWrongQuestion();
  switchScreen('wrong-review-screen');
}

// 关闭错题本
function closeWrongReview() {
  wrongReviewState = { questions: [], currentPage: 0 };
  switchScreen('home-screen');
}

// 渲染错题内容
function renderWrongQuestion() {
  const p = wrongReviewState.currentPage;
  const qs = wrongReviewState.questions;
  if (qs.length === 0) return;
  const w = qs[p];
  const card = document.getElementById('wrong-qcard-current');

  let html = '<div class="q-header">' +
    '<span class="q-num">' + (p + 1) + '</span>' +
    '<span class="q-type-tag">' + escapeHtml(w.typeLabel) + '</span>' +
    '<span class="q-score" style="color:var(--red);">扣 ' + w.score + ' 分</span>' +
  '</div>';

  // 选择题（有 options）
  if (w.options) {
    html += '<div class="q-body">' + escapeHtml(w.question) + '</div><div class="options">';
    const userLetter = /^[ABCD]$/.test(String(w.userAnswer || '')) ? String(w.userAnswer) : '';
    const correctLetter = String(w.correctAnswer || '').charAt(0);
    ['A','B','C','D'].forEach(function(opt) {
      if (w.options[opt]) {
        var isUserAnswer = userLetter === opt;
        var isCorrectAnswer = correctLetter === opt;
        var extraClass = ' review-opt';
        if (isUserAnswer) extraClass += ' wrong-option';
        if (isCorrectAnswer) extraClass += ' correct-option';

        var markHtml = '';
        if (isUserAnswer) markHtml = '<span class="opt-mark">❌ 你的答案</span>';
        if (isCorrectAnswer) markHtml = '<span class="opt-mark">✅ 正确答案</span>';

        html += '<div class="opt-label' + extraClass + '">' +
          '<span class="opt-letter">' + opt + '</span>' +
          '<span>' + escapeHtml(w.options[opt]) + '</span>' +
          markHtml +
        '</div>';
      }
    });
    html += '</div>';
  } else {
    // 非选择题（填空、程序阅读、程序补全）
    var isProgFill = w.type === 'c_prog_fill';
    html += '<div class="q-body">' + formatProgramQuestion(w.question, isProgFill) + '</div>';
    html += '<div class="wrong-answer-section">' +
      '<div class="your-answer">❌ 你的答案：' + escapeHtml(w.userAnswer) + '</div>' +
      '<div class="correct-answer">✅ 正确答案：' + escapeHtml(w.correctAnswer) + '</div>' +
    '</div>';
  }

  // 解析
  if (w.explanation && w.explanation.trim()) {
    html += '<div class="wrong-explanation">💡 解析：' + escapeHtml(w.explanation) + '</div>';
  }

  card.innerHTML = html;
  updateWrongPageIndicator();
}

// 错题页码点
function renderWrongPageDots() {
  var dotsEl = document.getElementById('wrong-page-dots');
  var qs = wrongReviewState.questions;
  dotsEl.innerHTML = qs.map(function(q, i) {
    return '<span class="page-dot" data-page="' + i + '" onclick="jumpToWrongQuestion(' + i + ')" title="第' + (i+1) + '题"></span>';
  }).join('');
  updateWrongPageIndicator();
}

// 更新错题指示器
function updateWrongPageIndicator() {
  var p = wrongReviewState.currentPage;
  document.getElementById('wrong-progress-current').textContent = p + 1;

  var dots = document.querySelectorAll('#wrong-page-dots .page-dot');
  for (var i = 0; i < dots.length; i++) {
    dots[i].classList.toggle('current', i === p);
  }

  document.getElementById('wrong-btn-prev').disabled = p <= 0;
  document.getElementById('wrong-btn-next').disabled = p >= wrongReviewState.questions.length - 1;
}

// 错题导航
function nextWrongQuestion() {
  if (wrongReviewState.currentPage >= wrongReviewState.questions.length - 1) return;
  if (wrongReviewState.questions.length === 0) return;
  wrongReviewState.currentPage++;
  renderWrongQuestion();
  updateWrongPageIndicator();
}

function prevWrongQuestion() {
  if (wrongReviewState.currentPage <= 0) return;
  if (wrongReviewState.questions.length === 0) return;
  wrongReviewState.currentPage--;
  renderWrongQuestion();
  updateWrongPageIndicator();
}

function jumpToWrongQuestion(targetPage) {
  if (targetPage < 0 || targetPage >= wrongReviewState.questions.length) return;
  if (wrongReviewState.questions.length === 0) return;
  wrongReviewState.currentPage = targetPage;
  renderWrongQuestion();
  updateWrongPageIndicator();
}

// 清空错题本
function clearWrongQuestions() {
  if (wrongReviewState.questions.length === 0) return;
  if (!confirm('确定要清空错题本吗？此操作不可恢复。')) return;
  var key = localStorage.getItem('exam_last_wrong_key');
  if (key) localStorage.removeItem(key);
  wrongReviewState = { questions: [], currentPage: 0 };
  closeWrongReview();
}

// 错题键盘快捷键
document.addEventListener('keydown', function(e) {
  if (!document.getElementById('wrong-review-screen').classList.contains('active')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); nextWrongQuestion(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); prevWrongQuestion(); }
});

// 错题触屏滑动
(function initWrongSwipe() {
  var touchStartX = 0, touchStartY = 0;
  document.addEventListener('touchstart', function(e) {
    if (!document.getElementById('wrong-review-screen').classList.contains('active')) return;
    touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY;
  }, { passive:true });
  document.addEventListener('touchend', function(e) {
    if (!document.getElementById('wrong-review-screen').classList.contains('active')) return;
    var dx = (e.changedTouches[0]?.clientX || touchStartX) - touchStartX;
    var dy = (e.changedTouches[0]?.clientY || touchStartY) - touchStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < -30) nextWrongQuestion(); else if (dx > 30) prevWrongQuestion();
    }
  });
})();
