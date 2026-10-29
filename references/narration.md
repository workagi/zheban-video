# 旁白与词语时序

## 两种输入

已有录音继续用 `narration.clips`；有逐句对齐结果时也可提供 `narration.timeline`。Edge TTS 是可选输入，不替换已有声音，不克隆音色。使用 Edge TTS 时旁白文本会发到微软在线服务；用户授权配音后运行。无需账号或 API Key，服务可用性与配额不由本 Skill 保证。

`build.sh preview/silent/full` 都不会隐式联网生成声音。显式执行 `build.sh "$P" tts` 才合成；`tts --offline` 只读取缓存，缓存缺失即报错。先审定稿再生成，修改分镜不重配音。

## 环境

复用已有 `edge-tts >=7.3`（当前实际验证 7.3.1）。`CKV_TTS_PYTHON` 可指定其 Python，与需要 numpy/Pillow 的 `CKV_PYTHON` 分开。没有现成环境时，在项目内准备：

```bash
python3 -m venv "$P/.venv-tts"
"$P/.venv-tts/bin/python" -m pip install -r "$SK/scripts/requirements-tts.txt"
```

可复用用户已准备的 `$HOME/.local/share/cinematic-knowledge-video/tts-venv`；查找顺序是显式 CKV_TTS_PYTHON、项目/技能 .venv-tts、该独立环境和已有解释器。此目录属于依赖，不是 Skill 安装目录；脚本不会自动创建它。

不要自动升级全局包、修改服务端点或安装 Edge 浏览器。服务若返回 403，先查看 [edge-tts 官方问题记录](https://github.com/rany2/edge-tts/issues/490) 和发布版本，用隔离环境验证；音色列表可用不代表语音合成可用。报错日志不要输出带签名参数的完整服务 URL。

## script.json

```json
{
  "provider": "edge-tts",
  "voice": "zh-CN-YunxiNeural",
  "rate": "+0%",
  "pitch": "-3Hz",
  "leadIn": 0.6,
  "gap": 0.25,
  "tail": 1.0,
  "lines": [
    {"id": "rule", "text": "先合作，再反击。", "pauseAfter": 0.2}
  ]
}
```

`id` 唯一，仅字母/数字/下划线/横线；每句可覆盖 voice/rate/pitch。`pauseBefore/pauseAfter` 非负秒。`at` 可显式规定该句音频文件的全片起点，必须晚于前句音频和停顿结束，不挤压或截断前句。

生成 `assets/narration/<hash>.mp3/.json`、`narration-timeline.json`、逐句 SRT。缓存键包含文本、声音、语速、音高、库版本；音频校验和不匹配会重建。输出时间轴记录实际 WordBoundary，SRT 是逐句字幕，不声称已经处理所有语义断句。每句保留原音色来源和文件时长，音频混合仍走现有轨道。

## 接到 storyboard.json

```json
{
  "narration": {"timeline": "narration-timeline.json", "musicDuck": 0.20},
  "scenes": [{
    "id": "rule",
    "endAnchor": {"line": "rule", "edge": "end", "offset": 1.0},
    "events": [{
      "id": "retaliate",
      "anchor": {"line": "rule", "word": "反击"},
      "duration": 0.4
    }],
    "lines": [{
      "role": "caption", "text": "先合作，再反击",
      "anchor": {"line": "rule"},
      "outAnchor": {"line": "rule", "edge": "end", "offset": 0.25}
    }]
  }]
}
```

时间轴的 clips 与已有 narration.clips 合并，ID 不得重复。`endAnchor` 是场景全片结束点，和 durationSec/bars 互斥；顶层 duration 可省略，按场景累加。固定 60s 任务仍保留 duration:60，旁白超过时应改稿/语速并试听，不自动截断。

anchor 可用于 events、lines、sfx。`line` 指时间轴句 ID，`word` 是原句词语，`occurrence` 是第几次出现（从 0 开始），`edge` 为 start/end，`offset` 为附加秒数。词语不存在、超出场景或只有估算词时码时明确失败；不会回落到句首。clip+offset 旧锚点继续可用。文字也可用 outAnchor 指定消失时间。sfx 仍支持旧拍数 at，新 atSec 是场景内秒。

`scripts/project.py` 是时序解析真源；渲染、音频和检查都调用它。`build/storyboard.resolved.json` 仅供检查，不能手改。script.json 或已生成音频变化后，旧时间轴会拒绝使用。

已有录音的时间轴格式：`{lines:[{id,text,start,end,words:[{text,start,end}],timing:"word-boundary"}]}`，全为全片秒数；可附 clips。必须由真实对齐取得词时码，不能把匀分字符估算标成实测。

## 执行和复核

1. `bash "$SK/scripts/build.sh" "$P" tts`。
2. 核对词语与对应动作；`preview` 查版面和图解登记。
3. `full` 做音画合成和成片动态检查。试听专名、句头尾、停顿与音乐，不靠响度数字代替。
4. 回改画面时可离线重建，源码包带音频和时间轴，接收者无需再次向外发送文本。
