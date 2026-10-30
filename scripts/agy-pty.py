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

退出码：agy 输出 `AGY_ERROR:`（额度用完、接口报错等）时为 1，agy 自己以非零码退出时沿用它的退出码，
撞到硬超时为 124；产出后静默结束（agy -p 的正常收尾）为 0。调用方据此判断这一步是否成功。
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
failed = False
timed_out = False
status = None  # agy 自己退出时的 waitpid 状态
tail = b""     # 上一块的末尾，防止 AGY_ERROR 被切在两块之间
out = sys.stdout.buffer
while True:
    if time.time() - start > HARD:
        timed_out = True
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
        failed = failed or b"AGY_ERROR:" in tail + data
        tail = data[-16:]
        got = True
        last = time.time()
    else:
        wpid, wstatus = os.waitpid(pid, os.WNOHANG)
        if wpid == pid:
            status = wstatus
            break
        if got and time.time() - last > IDLE:
            break

if status is None:
    # pty 读到 EOF 时 agy 多半正在退出：稍等片刻取它的退出状态；还在跑（静默或超时）就杀掉
    deadline = time.time() + (0 if timed_out else 2)
    while True:
        try:
            wpid, wstatus = os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            break
        if wpid == pid:
            status = wstatus
            break
        if time.time() >= deadline:
            break
        time.sleep(0.1)
if status is None:
    try:
        os.kill(pid, signal.SIGKILL)
        os.waitpid(pid, 0)
    except OSError:
        pass

if failed:
    sys.stderr.write("agy 报错（AGY_ERROR），本步未完成\n")
    sys.exit(1)
if timed_out:
    sys.stderr.write(f"agy 超过 {HARD:.0f} 秒未结束，已终止\n")
    sys.exit(124)
if status is not None and os.WIFEXITED(status) and os.WEXITSTATUS(status) != 0:
    sys.exit(os.WEXITSTATUS(status))
