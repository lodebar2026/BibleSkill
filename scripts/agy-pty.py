#!/usr/bin/env python3
"""在伪终端（pty）里运行 agy --print，捕获并实时透传其输出。

agy 是 agentic CLI：stdout 是管道时它静默且不返回，只有挂在 TTY 上才会输出；
而 agy -p 在 pty 里产出答案后又不会自动退出（像交互模式）。本脚本用 pty 兜住：
分配 pty 运行 agy，实时把输出写到本进程 stdout（调用方既能即时看到、又能收集解析），
子进程退出或「产出后静默 IDLE 秒」即结束并杀掉残留进程。

环境变量：
  AGY_MODEL        传给 agy --model 的模型名（须为 `agy models` 列出的名称）
  AGY_PROMPT_FILE  prompt 文本文件路径（用文件避免超长参数/转义问题）
  AGY_IDLE         产出后静默多少秒判定结束（默认 6）
  AGY_HARD         单次硬超时秒数（默认 240）
  AGY_ARGS         追加给 agy 的参数（空格分隔），如 "--mode auto"

"""

import os
import pty
import select
import signal
import sys
import time

model = os.environ.get("AGY_MODEL", "")
prompt = open(os.environ["AGY_PROMPT_FILE"], encoding="utf-8").read()
extra = os.environ.get("AGY_ARGS", "").split()
args = ["agy"] + (["--model", model] if model else []) + extra + ["-p", prompt]

IDLE = float(os.environ.get("AGY_IDLE", "6"))
HARD = float(os.environ.get("AGY_HARD", "240"))

pid, master = pty.fork()
if pid == 0:
    os.execvp("agy", args)
    os._exit(127)

start = last = time.time()
got = False
out = sys.stdout.buffer
while True:
    if time.time() - start > HARD:
        break
    r, _, _ = select.select([master], [], [], 1.0)
    if r:
        try:
            data = os.read(master, 4096)
        except OSError:
            break
        if not data:
            break
        out.write(data)        # 实时透传，调用方即时可见
        out.flush()
        got = True
        last = time.time()
    else:
        wpid, _ = os.waitpid(pid, os.WNOHANG)
        if wpid == pid:
            break
        if got and time.time() - last > IDLE:
            break

try:
    os.kill(pid, signal.SIGKILL)
except OSError:
    pass
