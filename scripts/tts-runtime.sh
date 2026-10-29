# Optional runtime, independent from numpy/Pillow Python. Never installs packages.
ckv_tts_check='import edge_tts;from importlib.metadata import version;assert tuple(map(int,version("edge-tts").split(".")[:2])) >= (7,3)'
if [ -n "${CKV_TTS_PYTHON:-}" ]; then
  "$CKV_TTS_PYTHON" -B -c "$ckv_tts_check" 2>/dev/null || { echo 'CKV_TTS_PYTHON needs edge-tts >= 7.3 (older versions have a known 403 issue)' >&2; return 1; }
else
  ckv_tts_bin="$(command -v edge-tts || true)"
  for ckv_tts_python in "${P:-.}/.venv-tts/bin/python" "${HERE:-.}/../.venv-tts/bin/python" "$HOME/.local/share/cinematic-knowledge-video/tts-venv/bin/python" "${CKV_PYTHON:-}" "${ckv_tts_bin%/*}/python3" "$(command -v python3.13 || true)" "$(command -v python3 || true)" "$(command -v python3.12 || true)"; do
    if [ -n "$ckv_tts_python" ] && "$ckv_tts_python" -B -c "$ckv_tts_check" 2>/dev/null; then CKV_TTS_PYTHON="$ckv_tts_python"; break; fi
  done
  [ -n "${CKV_TTS_PYTHON:-}" ] || { echo 'edge-tts >= 7.3 missing. Use CKV_TTS_PYTHON or a project .venv-tts; see references/narration.md.' >&2; return 1; }
fi
export CKV_TTS_PYTHON
