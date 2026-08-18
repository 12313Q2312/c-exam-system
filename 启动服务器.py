#!/usr/bin/env python3
"""考试系统服务器启动脚本 — 无乱码版"""
import os, socket, subprocess, sys

def get_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        s.close()

def main():
    ip = get_ip()
    port = 8765
    print()
    print("  ============================================")
    print("     🧠 AI & C语言 考试模拟系统")
    print("  ============================================")
    print()
    print("     服务已启动！")
    print()
    print(f"     >>> http://{ip}:{port}")
    print()
    print(f"     本机访问: http://localhost:{port}")
    print()
    print("     按 Ctrl+C 停止服务")
    print("  ============================================")
    print()

    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    os.system(f'netsh advfirewall firewall add rule name="AI_C_Exam_Server" dir=in action=allow protocol=TCP localport={port} >nul 2>nul')
    subprocess.run([sys.executable, '-m', 'http.server', str(port), '--bind', '0.0.0.0'])

if __name__ == '__main__':
    main()
