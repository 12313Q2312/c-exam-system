#!/usr/bin/env python3
"""解析两个 PDF 题库并生成结构化 JSON (优化版)"""
import re, json, os

BASE = r'g:\linshicunchuqu\人工智能C语言考试模拟系统'

def parse_ai():
    """人工智能通识课习题集 — 只提取单选题（有 ABCD 选项和明确答案的）"""
    text = open(os.path.join(BASE, 'ai_full.txt'), 'r', encoding='utf-8').read()
    lines = text.split('\n')
    questions = []

    # Strategy: find each question by its number pattern,
    # but track which chapter we're in via section headers
    current_chapter = ''
    i = 0

    while i < len(lines):
        stripped = lines[i].strip()

        # Track chapter
        ch_m = re.search(r'(第 \d+ 章\s*.+)', stripped)
        if ch_m and '部分' not in stripped and '知识点' not in stripped:
            current_chapter = ch_m.group(1).strip()
            i += 1
            continue

        # Must match question start: N. (where N is 1-3 digits, at start of line)
        q_m = re.match(r'^(\d+)\.\s+(.+)', stripped)
        if not q_m:
            i += 1
            continue

        qnum = q_m.group(1)
        # Skip numbers > 200 (likely page numbers or garbled)
        if int(qnum) > 200:
            i += 1
            continue

        q_start = i
        question_body = q_m.group(2)

        # Search forward for options A. B. C. D.
        found_options = []
        opt_start_line = None
        for j in range(i + 1, min(i + 30, len(lines))):
            js = lines[j].strip()
            # Check if we hit another question
            if re.match(r'^\d+\.\s+', js):
                break
            # Check for option
            for ol in ['A', 'B', 'C', 'D']:
                if re.match(rf'^{ol}\.\s+', js):
                    found_options.append(ol)
                    if opt_start_line is None:
                        opt_start_line = j
                    break
            if len(found_options) >= 4:
                break
            # Also break if we see 答案 without enough options (some questions might be malformed)
            if '答案' in js and len(found_options) < 4:
                break

        # Need exactly 4 options
        if len(found_options) < 4:
            i = q_start + 1
            continue

        # Extract options content (between A. and the answer line)
        options = {}
        opt_end_line = None

        for j in range(opt_start_line, min(opt_start_line + 20, len(lines))):
            js = lines[j].strip()
            if '答案：' in js or '【答案' in js:
                opt_end_line = j
                break

        if opt_end_line is None:
            opt_end_line = opt_start_line + 10

        # Now extract each option's content
        opt_lines_segment = lines[opt_start_line:opt_end_line]
        opt_blocks = {'A': [], 'B': [], 'C': [], 'D': []}
        current_opt = None

        for ln in opt_lines_segment:
            s = ln.strip()
            for ol in ['A', 'B', 'C', 'D']:
                m = re.match(rf'^{ol}\.\s*(.+)', s)
                if m:
                    current_opt = ol
                    opt_blocks[ol].append(m.group(1))
                    break
            else:
                # continuation of previous option
                if current_opt and s and not re.match(r'^\d+\.\s', s):
                    opt_blocks[current_opt].append(s)

        for ol in ['A', 'B', 'C', 'D']:
            options[ol] = ''.join(opt_blocks[ol]).strip()
            if options[ol]:
                # Remove trailing answers/annotations that got mixed in
                for bad in ['答案：', '解析：']:
                    idx = options[ol].find(bad)
                    if idx > 0:
                        options[ol] = options[ol][:idx].strip()

        # Validate all options exist and are non-empty
        if not all(ol in options and options[ol] for ol in ['A', 'B', 'C', 'D']):
            i = q_start + 1
            continue

        # Find answer
        answer = None
        explanation = ''
        for j in range(opt_end_line, min(opt_end_line + 15, len(lines))):
            js = lines[j].strip()
            ans_m = re.match(r'答案[：:]\s*(\S+)', js)
            if ans_m:
                ans_raw = ans_m.group(1).strip().rstrip('。，,;；')
                # Make sure answer is a single letter A-D
                if ans_raw and ans_raw[0] in 'ABCD':
                    answer = ans_raw[0]
                    # Collect explanation from following lines
                    exp_lines = []
                    for k in range(j + 1, min(j + 15, len(lines))):
                        eks = lines[k].strip()
                        if re.match(r'^\d+\.\s+', eks) or re.match(r'答案', eks):
                            break
                        if eks and '=== PAGE' not in eks:
                            # Remove leading labels
                            clean = re.sub(r'^解析[：:]\s*', '', eks)
                            exp_lines.append(clean)
                    explanation = ' '.join(exp_lines).strip()
                    # Stop collecting if we hit something that looks like next question
                    if 'PPT' in explanation:
                        # valid explanation
                        pass
                break

        if answer is None:
            i = q_start + 1
            continue

        # Clean up question text (remove duplicate numbers at beginning)
        question_body = re.sub(r'^\d+\.\s*', '', question_body)

        questions.append({
            'id': len(questions) + 1,
            'chapter': current_chapter,
            'question': question_body,
            'options': options,
            'answer': answer,
            'explanation': explanation
        })

        i = opt_end_line + 1  # advance past this question

    print(f'AI 单选题: {len(questions)} 题')
    with open(os.path.join(BASE, 'ai_questions.json'), 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)
    return questions


def parse_c():
    """C语言题库 — 按题型区域提取"""
    text = open(os.path.join(BASE, 'c_full.txt'), 'r', encoding='utf-8').read()
    lines = text.split('\n')

    result = {
        'danxuan': [],
        'tiankong': [],
        'program_reading': [],
        'program_fill': []
    }

    # Find section boundaries
    prog_read_pos = text.find('【程序阅读题】')
    prog_fill_pos = text.find('【完善程序题】')

    if prog_read_pos < 0 or prog_fill_pos < 0:
        print("ERROR: Cannot find section boundaries in C PDF")
        return result

    # --- Part 1: 单选题 (before 程序阅读题, [单选题] markers) ---
    danxuan_section = text[:prog_read_pos]

    # Find all [单选题] positions
    dx_starts = list(re.finditer(r'(\d+)\.\[单选题\]', danxuan_section))
    for idx, m in enumerate(dx_starts):
        start = m.start()
        end = dx_starts[idx + 1].start() if idx + 1 < len(dx_starts) else len(danxuan_section)
        chunk = danxuan_section[start:end]
        clines = chunk.split('\n')

        # Knowledge point from header
        kp_m = re.search(r'知识点：([^)]*)', clines[0] if clines else '')
        kp = kp_m.group(1).strip() if kp_m else ''

        # Question text: lines between header and first option, excluding header
        q_lines = []
        opt_lines = {'A': [], 'B': [], 'C': [], 'D': []}
        in_opts = False
        cur_opt = None

        for ln in clines[1:]:
            s = ln.strip()
            if not s:
                continue
            if '【答案' in s:
                break
            # Option marker
            om = re.match(r'^([A-D])[\.．]\s*(.+)', s)
            if om:
                in_opts = True
                cur_opt = om.group(1)
                opt_lines[cur_opt].append(om.group(2))
            elif in_opts:
                if cur_opt:
                    opt_lines[cur_opt].append(s)
            else:
                # Skip header junk
                if not any(x in s for x in ['(题号：', '(物理题号：', '(知识点：', '(知识块：', '(标签：', '(难度：', '(分值：']):
                    q_lines.append(s)

        q_text = ' '.join(q_lines).strip()
        options = {}
        for ol in ['A', 'B', 'C', 'D']:
            if opt_lines[ol]:
                options[ol] = ' '.join(opt_lines[ol]).strip()

        # Answer
        ans_m = re.search(r'【答案[：:]\s*(\S+)\s*】', chunk)
        answer = ans_m.group(1).strip() if ans_m else ''

        if q_text and answer and len(options) == 4:
            result['danxuan'].append({
                'id': len(result['danxuan']) + 1,
                'knowledge_point': kp,
                'question': q_text,
                'options': options,
                'answer': answer
            })

    # --- Part 2: 填空题 (in main section, [填空题<1空>], between 单选题区 and 程序阅读题区) ---
    # Find the area between last 单选题 and 程序阅读题
    dx_end = dx_starts[-1].end() if dx_starts else 0
    tk_section = danxuan_section[dx_end:]  # after last 单选题

    tk_starts = list(re.finditer(r'(\d+)\.\[填空题<1空>\]', tk_section))
    for idx, m in enumerate(tk_starts):
        start = m.start()
        end = tk_starts[idx + 1].start() if idx + 1 < len(tk_starts) else len(tk_section)
        chunk = tk_section[start:end]
        clines = chunk.split('\n')

        kp_m = re.search(r'知识点：([^)]*)', clines[0] if clines else '')
        kp = kp_m.group(1).strip() if kp_m else ''

        q_lines = []
        for ln in clines[1:]:
            s = ln.strip()
            if not s:
                continue
            if '【答案' in s:
                break
            if not any(x in s for x in ['(题号：', '(物理题号：', '(知识点：', '(知识块：', '(标签：', '(难度：', '(分值：']):
                q_lines.append(s)

        q_text = ' '.join(q_lines).strip()

        # Answers
        answers = []
        for m2 in re.finditer(r'\[第1空答案\d*\][：:]\s*(.+)', chunk):
            val = m2.group(1).strip()
            if val:
                answers.append(val)

        if q_text and answers:
            result['tiankong'].append({
                'id': len(result['tiankong']) + 1,
                'knowledge_point': kp,
                'question': q_text,
                'answer': answers[0],
                'acceptable_answers': list(set(answers))
            })

    # --- Part 3: 程序阅读题 [填空题<1空>] ---
    pr_section = text[prog_read_pos:prog_fill_pos]
    pr_starts = list(re.finditer(r'(\d+)\.\[填空题<1空>\]', pr_section))
    for idx, m in enumerate(pr_starts):
        start = m.start()
        end = pr_starts[idx + 1].start() if idx + 1 < len(pr_starts) else len(pr_section)
        chunk = pr_section[start:end]
        clines = chunk.split('\n')

        kp_m = re.search(r'知识点：([^)]*)', clines[0] if clines else '')
        kp = kp_m.group(1).strip() if kp_m else ''

        q_lines = []
        for ln in clines[1:]:
            s = ln.strip()
            if '【答案' in s:
                break
            if s and not any(x in s for x in ['(题号：', '(物理题号：', '(知识点：', '(知识块：', '(标签：', '(难度：', '(分值：']):
                q_lines.append(ln)  # keep original for code formatting

        q_text = '\n'.join(q_lines).strip()

        answers = []
        for m2 in re.finditer(r'\[第1空答案\d*\][：:]\s*(.+)', chunk):
            val = m2.group(1).strip()
            if val:
                answers.append(val)

        if q_text and answers:
            result['program_reading'].append({
                'id': len(result['program_reading']) + 1,
                'knowledge_point': kp,
                'question': q_text,
                'answer': answers[0],
                'acceptable_answers': list(set(answers))
            })

    # --- Part 4: 完善程序题 [填空题<2空>] ---
    pf_section = text[prog_fill_pos:]
    pf_starts = list(re.finditer(r'(\d+)\.\[填空题<2空>\]', pf_section))
    for idx, m in enumerate(pf_starts):
        start = m.start()
        end = pf_starts[idx + 1].start() if idx + 1 < len(pf_starts) else len(pf_section)
        chunk = pf_section[start:end]
        clines = chunk.split('\n')

        kp_m = re.search(r'知识点：([^)]*)', clines[0] if clines else '')
        kp = kp_m.group(1).strip() if kp_m else ''

        q_lines = []
        for ln in clines[1:]:
            s = ln.strip()
            if '【答案' in s:
                break
            if s and not any(x in s for x in ['(题号：', '(物理题号：', '(知识点：', '(知识块：', '(标签：', '(难度：', '(分值：']):
                q_lines.append(ln)

        q_text = '\n'.join(q_lines).strip()

        blank1 = re.findall(r'\[第1空答案\d*\][：:]\s*(.+)', chunk)
        blank2 = re.findall(r'\[第2空答案\d*\][：:]\s*(.+)', chunk)

        if q_text and blank1 and blank2:
            result['program_fill'].append({
                'id': len(result['program_fill']) + 1,
                'knowledge_point': kp,
                'question': q_text,
                'blanks': [
                    {'position': 1, 'answer': blank1[0].strip(), 'acceptable_answers': [b.strip() for b in blank1 if b.strip()]},
                    {'position': 2, 'answer': blank2[0].strip(), 'acceptable_answers': [b.strip() for b in blank2 if b.strip()]}
                ]
            })

    print(f'C 单选题: {len(result["danxuan"])} 题')
    print(f'C 填空题: {len(result["tiankong"])} 题')
    print(f'C 程序阅读题: {len(result["program_reading"])} 题')
    print(f'C 完善程序题: {len(result["program_fill"])} 题')

    with open(os.path.join(BASE, 'c_questions.json'), 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    return result


if __name__ == '__main__':
    print('=== 解析人工智能通识题库 ===')
    ai_qs = parse_ai()
    print()
    print('=== 解析C语言题库 ===')
    c_qs = parse_c()
    print('\n解析完成！')
