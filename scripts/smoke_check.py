#!/usr/bin/env python3
"""最小冒烟检查：页面能加载，抽题数量和时长与版本约定一致。

不安装第三方包。先在仓库根目录启动静态服务，再执行：

    python3 scripts/smoke_check.py --url http://127.0.0.1:8765/

约定：90 分钟对应 60 题，120 分钟对应 65 题。
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ("index.html", "style.css", "app.js", "ai_data.js", "c_data.js")
EXPECTED = {90: 60, 120: 65}
POOLS = (
    ("ai_danxuan", "AI_QUESTIONS", None),
    ("c_danxuan", "C_QUESTIONS", "danxuan"),
    ("c_tiankong", "C_QUESTIONS", "tiankong"),
    ("c_prog_read", "C_QUESTIONS", "program_reading"),
    ("c_prog_fill", "C_QUESTIONS", "program_fill"),
)

results = []


def check(name, ok, detail):
    results.append((name, bool(ok), detail))
    print(("PASS" if ok else "FAIL") + "  " + name + "  " + detail)


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "c-exam-smoke"})
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.status, response.read()


def load_assets(base_url):
    loaded = {}
    if base_url:
        base = base_url if base_url.endswith("/") else base_url + "/"
        for name in ASSETS:
            try:
                status, body = fetch(base + name)
            except Exception as exc:
                check("加载 " + name, False, str(exc))
                return None
            text = body.decode("utf-8", errors="replace")
            check("加载 " + name, status == 200 and len(text) > 50, "HTTP %s，%d 字节" % (status, len(text)))
            loaded[name] = text
        return loaded

    for name in ASSETS:
        path = ROOT / name
        if not path.is_file():
            check("读取 " + name, False, "文件不存在")
            return None
        text = path.read_text(encoding="utf-8")
        check("读取 " + name, len(text) > 50, "%d 字节" % len(text))
        loaded[name] = text
    return loaded


def parse_config(app_js):
    time_match = re.search(r"const TOTAL_TIME = (\d+) \* 60", app_js)
    block = re.search(r"const EXAM_CONFIG = \{([\s\S]*?)\n\};", app_js)
    if not time_match or not block:
        return None, {}
    counts = dict(re.findall(r"(\w+)\s*:\s*\{[^}]*?\bcount:\s*(\d+)", block.group(1)))
    return int(time_match.group(1)), {key: int(value) for key, value in counts.items()}


def parse_bank(ai_js, c_js):
    ai_raw = ai_js.split("=", 1)[1].strip().rstrip(";")
    c_raw = c_js.split("=", 1)[1].strip().rstrip(";")
    return json.loads(ai_raw), json.loads(c_raw)


def syntax_check(assets):
    node = "node"
    for name in ("app.js", "ai_data.js", "c_data.js"):
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as handle:
            handle.write(assets[name])
            path = handle.name
        try:
            completed = subprocess.run([node, "--check", path], capture_output=True, text=True)
        except FileNotFoundError:
            check("语法检查 " + name, False, "未执行：找不到 node")
            return
        detail = (completed.stderr or completed.stdout or "语法通过").strip().splitlines()
        check("语法检查 " + name, completed.returncode == 0, detail[-1][:180] if detail else "语法通过")


def main():
    parser = argparse.ArgumentParser(description="检查考试页能加载，并且题量与时长匹配")
    parser.add_argument("--url", help="已启动的站点根地址，例如 http://127.0.0.1:8765/")
    args = parser.parse_args()
    if not args.url:
        print("未提供 --url，改为读取工作区文件。页面加载检查需要先启动服务并传入 --url。")

    assets = load_assets(args.url)
    if not assets:
        summarize()
        return 1

    page = assets["index.html"]
    for marker in ("login-screen", "exam-screen", "result-screen", "app.js", "ai_data.js", "c_data.js"):
        check("页面包含 " + marker, marker in page, "找到" if marker in page else "缺失")

    minutes, counts = parse_config(assets["app.js"])
    if minutes is None or not counts:
        check("读出考试配置", False, "app.js 里没有 TOTAL_TIME 或 EXAM_CONFIG")
        summarize()
        return 1

    total = sum(counts.values())
    expected = EXPECTED.get(minutes)
    check(
        "题量与时长匹配",
        expected is not None and total == expected,
        "%d 分钟，配置合计 %d 题，约定 %s" % (minutes, total, expected if expected is not None else "未知时长"),
    )
    check("五类题目都有题量", len(counts) == 5 and all(value > 0 for value in counts.values()), str(counts))

    try:
        ai_questions, c_questions = parse_bank(assets["ai_data.js"], assets["c_data.js"])
    except Exception as exc:
        check("题库可以解析", False, str(exc))
        summarize()
        return 1
    check("题库可以解析", True, "AI %d 题" % len(ai_questions))

    banks = {"AI_QUESTIONS": ai_questions, "C_QUESTIONS": c_questions}
    for config_key, bank_name, field in POOLS:
        bank = banks[bank_name]
        pool = bank if field is None else bank.get(field, [])
        need = counts.get(config_key, 0)
        check(
            config_key + " 题库够抽",
            isinstance(pool, list) and len(pool) >= need,
            "需要 %d，题库 %d" % (need, len(pool) if isinstance(pool, list) else -1),
        )

    syntax_check(assets)
    return summarize()


def summarize():
    failed = [item for item in results if not item[1]]
    print("SUMMARY total=%d pass=%d fail=%d" % (len(results), len(results) - len(failed), len(failed)))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
