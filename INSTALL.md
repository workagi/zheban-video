# 安装与跨模型使用

本技能是标准 Agent Skills 格式（`SKILL.md` + 脚本 + 参考文件），Codex、Claude Code 和其他支持 Skills 的 Agent 都可以直接使用。

## 推荐安装方式

把仓库链接 `https://github.com/workagi/zheban-video` 发给支持本地 Skills 的 Agent，让它安装 `zheban-video`，并按该环境的安装规则核对入口。安装时保留整个 Skill 目录，包括 `SKILL.md`、`engine/`、`scripts/`、`references/` 和 `examples/`；只保存一份 `SKILL.md` 无法完成视频制作。

有 Node.js 22.20+ 的环境，也可使用通用 [Skills CLI](https://github.com/vercel-labs/skills)：

```bash
npx skills add workagi/zheban-video --skill zheban-video -g
```

该命令会交互选择目标 Agent；`-g` 表示跨项目使用，去掉则安装到当前项目。推荐选择链接方式，使多个 Agent 共享同一份源码。安装器支持的 Agent 与选项以其 [官方说明](https://github.com/vercel-labs/skills/blob/main/docs/commands.md) 为准。

安装后确认 Agent 能识别 `zheban-video`；必要时新开对话。使用时点名 Skill，并说明主题、时长、画幅、风格和声音要求。

## 已有共享安装器的环境

如果机器已经配置 `shared-skill-install`，优先沿用该环境的共享安装流程：

```bash
shared-skill-install workagi/zheban-video . zheban-video
```

此工具不是本仓库提供的通用命令。按所在环境的规则检查各 Agent 入口是否指回同一真源；遇到同名真实目录或文件时停止并处理冲突，不覆盖，也不制造第二份副本。没有这个安装器的机器使用上面的推荐方式。

## 安装与运行

安装 Skill 会让 Agent 发现制作方法与工具；视频渲染还需要下面的运行依赖。首次使用先检查已有环境，再补齐实际缺少的依赖。仅有网页聊天、无法执行本地脚本的入口，需要另配执行环境。

## 依赖（一次性）
```bash
npm i playwright && npx playwright install chromium   # 仅在已有环境均不可用且用户同意安装时执行
# Python 3.9+：pip install numpy pillow
# ffmpeg（含 libx264、loudnorm）
# 字体：Noto Serif CJK SC + Noto Sans SC（或 Noto Sans CJK SC）
bash scripts/doctor.sh <项目>     # 实际启动浏览器、加载字体后才报告通过
```
playwright 装在别处时，设置 `NODE_PATH=<含 playwright 的 node_modules>`；`build.sh` 会自动尝试常见位置。

## 稳定性的边界
引擎能固定颜色、版式和动效；选题、事实、叙事和组件搭配仍由执行模型决定。来源检查只检查记录，不核实网页内容。自动质检不能代替目检。

## 已有运行环境与项目字体
`CKV_NODE`、`CKV_PYTHON`、`NODE_PATH`、`CHROMIUM` 可显式指定已有环境。脚本也会尝试复用已有的 Codex bundled runtime（可用 `CKV_RUNTIME_ROOT` 指定），不自动安装或修改系统配置。

运行 `bash scripts/doctor.sh <项目>`：会实际启动浏览器并加载该项目的字体；不传项目则检查默认宋体与黑体两类预设。失败会保留具体错误，未通过不能称为可运行。

可以把字体放入项目 `assets/fonts/`，在 `storyboard.fontFiles` 中写 `[{"family":"Noto Sans SC","path":"assets/fonts/NotoSansSC-VF.ttf","weight":"100 900"}]`。使用官方字体并随源码保留许可证。这只加载到渲染页，不安装系统字体。

## 快速试跑

先把 `examples/prisoners-dilemma` 复制到一个新的项目目录。若系统没有示例要求的字体，从 [Noto 官方仓库](https://github.com/notofonts/noto-cjk/tree/main/Serif/Variable/TTF/Subset) 准备 `NotoSerifSC-VF.ttf` 及其许可证，放到该项目 `assets/fonts/`，再在 `storyboard.json` 顶层添加：

```json
"fontFiles": [
  {"family":"Noto Serif CJK SC","path":"assets/fonts/NotoSerifSC-VF.ttf","weight":"100 900"}
]
```

确认 JSON 中的逗号和其他字段正确后执行：

```bash
bash scripts/doctor.sh <项目目录>
bash scripts/build.sh <项目目录> preview
# 查看关键帧和检查报告后，再生成全片
bash scripts/build.sh <项目目录> full
```

无头浏览器不存在时，可用 `CHROMIUM` 指向本机已有 Chrome 可执行文件。示例不自带旁白；`full` 仅合成已配置的声音，在线配音按下节单独准备。

## 可选 Edge TTS

需要 edge-tts >=7.3，当前实测 7.3.1；7.2.8 能查询音色但实测合成返回403。用项目或技能目录下独立 `.venv-tts`，或 CKV_TTS_PYTHON 指定已有环境，不改全局 Python。固定依赖见 scripts/requirements-tts.txt；配置与授权边界见 references/narration.md。普通渲染不需要联网；重新生成声音才需要。
