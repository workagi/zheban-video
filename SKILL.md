---
name: zheban-video
description: 这班让 AI 上的代码视频制作 Skill，用确定性 Canvas 制作知识解说短片，包含可校验的固定镜头、横竖屏、六种视觉语言、专属图解动画、已有旁白或可选 Edge TTS、词语时序、配乐音效、无声预览与 MP4 导出。适用于概念解释、数据故事和有参考片的科普短片；包含技术检查及可重建源码包，支持可选在线配音，不做音色克隆。
---

# 这班让 AI 上 · 知识短片

由「这班让 AI 上」整理，源自作者用 Claude 制作知识短片、再到 Codex 测试不同风格的实践。

交付 MP4、可重建源码包、分镜、事实记录和技术检查报告。技术检查通过只代表文件与版面合格，成片是否达到参考水准必须另外判断。

## 先确定影片要解释什么

沿用用户已确定的主题、画幅、声音和参考标准；缺少且会影响执行时才问。未指定时可用60秒横屏、简体中文和按主题选择的风格，并说明假设。

有参考片时先查看实际片段：记录画幅、主体占比、明暗焦点、视觉如何解释内容、同一幕内的变化、旁白与揭晓的对应关系。区分用户要借鉴的视觉水准与可复用的素材。不要仅从配色或几张静帧推断成片质量，也不要假定知道参考片的源码或技术栈。

先写一条观众的问题，以及片子最后如何用证据回答它。按论证顺序设计故事；反常识只是可选开场，不是每个选题的硬套公式。参考 [writing.md](references/writing.md)。

参考作品的分层光影和节奏实现见 [reference-production.md](references/reference-production.md)。制作使用当前宿主和本地运行器；默认离线查看用户提供的其他模型结果，不自动调用其他模型客户端。

## 内容与视觉分镜

1. 核实人物、年份、数字、原话，记录在项目 `facts.md`，给出来源和适用边界。教学示意注明示意；从参考片读出的数字也要核对原出处。自动检查只验证来源记录格式。
2. 先列观众需要理解的信息点及证据，再定旁白稿或屏幕讲解稿和视觉分镜。每幕写清：观众问题、论断/证据、主体、动作如何帮助理解、注意力变化和声音锚点。格式见 [writing.md](references/writing.md)。
3. 要求跨模型一致时，先读 [stable-production.md](references/stable-production.md)：已有镜头以 `productionMode:"stable"` 填参数，关系与材质由固定实现生成。当前验证范围为暗金横屏的奖章揭晓、上一轮复制和排名比较。内容不适合这三种镜头时，使用明确的 `custom` 模式制作专属动画，先验证最难的一小段；不能为了套模板扭曲内容。
4. 在 custom 模式中，六种预设约束色彩、字体和材质语言，不锁死构图、主体大小、局部镜头或解释方式。专属画面沿用这些视觉语言，必要的项目级调整写入 `styleOverrides` 并说明用途。先读 [styles.md](references/styles.md) 中所选风格的导演规则，再写绘图代码；它约束主体、光源、动作、镜头、声音和失败检查。接口见 [custom-visuals.md](references/custom-visuals.md)。

镜头注册表 `engine/shots.json` 是参数接口的唯一真源，禁止凭名称猜字段或手写 computed。

字段、组件、秒级时码、事件与旁白见 [storyboard-spec.md](references/storyboard-spec.md)。使用 `durationSec` 按讲解安排镜头；`bars` 模式继续可用。音乐对齐关键动作即可，不强迫每个句子或切点服从整数小节。

## 画面和声音

- 没有原片声音授权、配音批准或已有音频时，先用旁白稿和临时时码制作无声动态预览。用户已经明确授权制作有声样片时直接执行，不再重复确认。
- 已有音频通过 `narration.clips` 放置；可选 Edge TTS 逐句生成音频及词级时间轴，使用 `line + word` 锚定动作和字幕。先读 [narration.md](references/narration.md)。文本会发送到微软服务，沿用用户对在线配音的授权；只在显式 `tts` 阶段联网，改画面不自动重配音。保留原声来源信息；参考片混音不能称为纯人声。不做音色克隆。
- 配乐、人声、音效分别合成，旁白出现时配乐降低；试听检查句头句尾、音量、停顿与揭晓，不能仅依赖响度数字。无声版本零音轨。
- 画面由时间与固定种子决定。不要使用 `Math.random`、`Date` 或实时动画时钟。

## 执行

项目包含 `storyboard.json`、`facts.md`、`storyboard.md`、按需的 `custom.js` 和 `assets/`。环境脚本复用已有运行库，项目字体用 `fontFiles` 加载，不自动全局安装。

```bash
SK=<技能目录>; P=<项目目录>
bash "$SK/scripts/doctor.sh" "$P"
bash "$SK/scripts/build.sh" "$P" tts     # 可选，已授权 Edge TTS 时显式生成
bash "$SK/scripts/build.sh" "$P" preview
bash "$SK/scripts/build.sh" "$P" lock    # 画面/素材确定后记录环境；后续变化会报不一致
bash "$SK/scripts/build.sh" "$P" silent  # 无声动态预览
bash "$SK/scripts/build.sh" "$P" full    # 已有/已生成旁白、配乐、音效合成
bash "$SK/scripts/build.sh" "$P" scan    # 只复查已有 MP4 的动态
```

有参考水准而制作路径未验证时，优先做一个能检验关键难点的短片段，再扩成全片。不要用另一个更长的低完成度样片代替验证。

## 两部分验收

技术检查：运行现有版面与成片检查，FAIL必须修复，不为过关放宽阈值。检查包括字体、读速、遮挡、来源记录、编码、全片解码和音频指标。

逐句图解检查：按 [visual-coverage.md](references/visual-coverage.md) 记录信息点、证据和渲染时图解登记。custom 模式的覆盖率提示缺口；stable 模式缺少逐句解释/留白理由、已声明图解登记覆盖不足50%、信息点漏关联或缺少证据说明会阻止导出。覆盖率不证明图解正确。成片动态检查筛查闪帧、跳变和长静止，输出切点连续帧；必要停顿可以保留并说明理由。

创作检查：观看动态片段与声音，并对照参考。解释镜头是否能让观众看到比较、因果或变化？动作和强调是否服务讲解？结果是否回应开头的问题？主体、材质与明暗能否达到本次目标？静帧和自动报告不能代替这些判断。见 [qa.md](references/qa.md)。

修改后复查实际受影响的片段。交付时说明实际通过的检查、使用的临时素材、未完成部分，以及是否达到参考仍待用户判断。不要宣称换模型后水平不变。

## 参考入口

- [reference-production.md](references/reference-production.md)：参考源码中的分层光影、金属体积、字幕保护及事件节奏。
- [stable-production.md](references/stable-production.md)：跨模型制作边界、固定镜头接口、环境锁和扩充流程。
- [narration.md](references/narration.md)：可选 Edge TTS、缓存、词语锚点、已有录音。
- [visual-coverage.md](references/visual-coverage.md)：逐句图解、资料镜头与跨主题最小验证。
- [writing.md](references/writing.md)：叙事、旁白和视觉论证分镜。
- [storyboard-spec.md](references/storyboard-spec.md)：字段、时码、组件与声音。
- [custom-visuals.md](references/custom-visuals.md)：专属动画接口及验证过的样片。
- [styles.md](references/styles.md)：六种视觉语言。
- [qa.md](references/qa.md)：技术检查与动态观感对照。
- `examples/stable-shots/`：三种固定镜头的12秒可运行分镜与配音稿；素材准备见 assets.md。
- `examples/prisoners-dilemma/`：原始模板示例，不代表电影感质量上限。
- `examples/voice-anchors/`：词语驱动反射光线的可运行分镜；字体/配音准备见 assets.md。
- `examples/visual-argument-pilot/`：专属视觉论证样例；复现所需字体/音频不随Skill分发时按其素材说明准备。
- `INSTALL.md`：环境说明；安装入口服从用户的共享安装规则。
