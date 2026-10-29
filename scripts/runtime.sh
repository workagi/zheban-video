#!/usr/bin/env bash
# Reuse existing runtimes; never install anything.
CKV_RUNTIME_ROOT="${CKV_RUNTIME_ROOT:-$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies}"
CKV_NODE="${CKV_NODE:-$(command -v node || true)}"
if [ -z "$CKV_NODE" ]; then CKV_NODE="$CKV_RUNTIME_ROOT/node/bin/node"; fi
if ! "$CKV_NODE" -e 'if (+process.versions.node.split(".")[0] < 18) process.exit(1)' 2>/dev/null; then
  echo '❌ 需要 Node >= 18；可用 CKV_NODE 指定已有解释器。' >&2; return 1
fi
if ! "$CKV_NODE" -e 'require("playwright")' 2>/dev/null; then
  for ckv_modules in "${HERE:-.}/../node_modules" "$PWD/node_modules" "$CKV_RUNTIME_ROOT/node/node_modules" /vercel/sandbox/node_modules; do
    if [ -f "$ckv_modules/playwright/package.json" ]; then
      export NODE_PATH="$ckv_modules${NODE_PATH:+:$NODE_PATH}"; break
    fi
  done
fi
if [ -n "${CKV_PYTHON:-}" ]; then
  "$CKV_PYTHON" -B -c 'import numpy, PIL' 2>/dev/null || { echo '❌ CKV_PYTHON 缺少 numpy/Pillow。' >&2; return 1; }
else
  for ckv_python in "$(command -v python3 || true)" "$CKV_RUNTIME_ROOT/python/bin/python3"; do
    if [ -n "$ckv_python" ] && "$ckv_python" -B -c 'import numpy, PIL' 2>/dev/null; then CKV_PYTHON="$ckv_python"; break; fi
  done
  [ -n "${CKV_PYTHON:-}" ] || { echo '❌ 需要 Python + numpy/Pillow；可用 CKV_PYTHON 指定已有环境。' >&2; return 1; }
fi
export CKV_NODE CKV_PYTHON
