# storyboard.json 规范

目录：1 顶层字段 · 2 场景字段 · 3 文字行 · 4 布局 · 5 组件参数 · 6 音效 · 7 时间换算

## 1 顶层字段
| 字段 | 必填 | 说明 |
|---|---|---|
| title | ✓ | 片名（也用于输出文件名，可用 slug 覆盖） |
| format | ✓ | `landscape`（1920×1080）或 `portrait`（1080×1920） |
| style | ✓ | 6 个预设之一，见 styles.md。不要临时发明风格 |
| fps / duration | ✓ | 默认 30 / 60。duration 若填写，必须等于场景秒数总和；旁白驱动可省略后自动计算 |
| seed | ✓ | 任意字符串；改它会改变所有随机布景，但同一 seed 永远同一画面 |
| hook | ✓ | 顶部常驻钩子标题，≤ 16 字，问句或反常识陈述 |
| seal |  | ink-wash 的印章单字（默认「思」） |
| music | ✓ | 见 §7。`{mode:"synth"|"file"|"none", bpm, beatsPerBar, file, offset, startBar, palette, root, scale, prog, fadeOut, gain}` |
| turnMax |  | 转折最大间隔秒数，默认 15 |
| progress |  | 顶部进度线，默认 true |
| autoSfx |  | 默认 true：每次切场自动 whoosh、每个 turn 场景自动 impact（已有同类音效则不重复） |
| sfxGain |  | 音效总增益，默认 0.55 |
| fontFiles |  | 可选：项目本地字体 `[{family:"Noto Sans SC",path:"assets/fonts/font.ttf",weight:"100 900"}]`；静态字体用对应 weight。文件随 assets 打包 |
| images |  | `{ "key": "assets/x.jpg" }`，供 image 组件使用 |
| styleOverrides |  | 只改个别 token（如 `{c:{accent:"#e0b050"}}`）。尽量不用 |

## 2 场景字段（scenes[]）
| 字段 | 说明 |
|---|---|
| id | 英文短 id（质检报告、facts.md 用它对应） |
| bars | 旧模式小节数（整数）；durationSec 或 endAnchor 支持旁白驱动切点 |
| layout | `center` `top` `bottom` `left` `right`，见 §4 |
| energy | 0–1，驱动合成配乐的配器密度（0.3 有贝斯，0.5 有琶音，0.6 有鼓，0.75 鼓更密） |
| turn | 字符串（钩子/你猜？/转折/悬念/揭晓/落点）。标记注意力回拉点，质检检查间隔 |
| ending | 最后一个场景设 true |
| visual | `{ type: 组件名, ...参数 }`，见 §5 |
| lines | 文字行，见 §3 |
| sfx | `[{ at: 拍, type, gain?, pan? }]`，见 §6 |
| camera | `push`（默认，缓慢推近）`pull` `pan` `still` |
| transition | 覆盖风格默认转场：`cut fade flash ink glitch slide block warp` |
| textBed | 文字背后的柔光衬底；center 布局默认开 |
| textV | 文字组在文字区的垂直位置 0–1，默认 0.5 |

## 3 文字行（lines[]）
`{ role, text, at, out, src?, anim?, color?, size? }`
- **role**：`kicker`（小眉题：年份·机构）`title`（大标题）`quote`（结尾金句）`sub`（副标题）`caption`（底部字幕）`note`（出处脚注）
- **at / out**：相对场景开头的**拍数**。默认 at=0.5（首个场景默认 0），out=场景末尾。首场景 at=0 的行在第 0 帧就完全可见
- 同一 role 在同一场景只能有一行同时出现；要换句就用 out/at 接力（如两句 caption）
- `[[词]]` 用强调色；`\n` 强制换行（标题按语义断行，不要让引擎乱断）
- **src**：含数字/史实的行写 facts.md 中的条目 id；也可以在 facts.md 的「用在场景」列写场景 id
- 字号由引擎按角色固定，`size` 只是倍率（0.8–1.2），尽量不用

每屏文字量上限：kicker 14 字 · title 每行 ≤ 12 字、最多 2 行 · sub ≤ 18 字 · caption ≤ 22 字 · quote 每行 ≤ 10 字。

## 4 布局
| layout | 横屏 | 竖屏 | 适合 |
|---|---|---|---|
| center | 文字居中，组件绕开文字作背景 | 同 | 钩子、金句、结尾（组件用 rings/network/question/quote/none） |
| top | 上 40% 文字，下 57% 组件 | 上 36% / 下 61% | 矩阵、对比、人物 |
| bottom | 上组件，下文字 | 同 | 点阵、图表 |
| left / right | 文字左（右），组件在另一侧 | 自动变 top / bottom | 数字、代码、时间轴 |
caption 永远在底部字幕带，note 在字幕带下方。内置布局为组件预留区域；组件标签、镜头变换或自定义图形仍需目检是否压字——别把文字塞进组件参数里冒充标题。

## 5 组件参数（visual.type）
所有 `at` / `len` / `stagger` 都是**拍**。
| type | 参数 | 用途 |
|---|---|---|
| none | — | 只要布景 |
| rings | scale, count | 抽象开场/结尾，3D 倾斜光环（水墨风格下是笔触圆相） |
| question | glyph（默认 ？）, at | 「你猜？」时刻的大问号 + 脉冲环 |
| bignum | from, to, at, len, decimals, prefix, suffix, label, labelAt | 数字滚动揭晓 |
| matrix | rows[], cols[], cells[][], colTitle, at, stagger, highlight:[{cell:[r,c], at}], cellScale | 收益矩阵/对照表（≤3×3） |
| duo | labels[2], states:[{at, state}] | 两人对峙。state：wall / talk / cooperate / betray-left / betray-right / betray-both |
| timeline | items:[{year,label}], focus, at, stagger | 时间线（≤6 项） |
| bars | items:[{label,value,display?,highlight?}], max, unit, at, stagger | 柱状对比（≤6 项） |
| dots | n, cols, frac, evolve:[{at, frac, len}], at, scale | 人群/比例变化（good 色占 frac） |
| network | n, at, len | 连接、合作、关系网 |
| split | left:{title,sub}, right:{title,sub}, winner, winAt, at, vs | 二选一对比 |
| quote | by, byAt | 引号装饰 + 署名；正文写在 lines 的 quote 行 |
| code | lines[], at, per, highlight, highlightAt | 逐行打字的规则/代码（≤5 行） |
| image | src（images 的 key）, alpha, filter | 照片/档案图，自动推镜 |
| custom | name + 任意参数 | 自定义组件，见 custom-visuals.md |

## 6 音效
type：`impact` 重击 · `whoosh` 呼啸 · `riser` 上扬（`riser_end` 表示在 at 处结束）· `swell` 反向渐强（在 at 处到顶）· `ding` 提示音 · `tick` 滴答 · `type` 打字声 · `gong` 锣 · `glitch` 故障 · `pluck` 拨弦 · `heartbeat` 心跳。
每个场景 ≤ 3 个手动音效；数字揭晓用 ding，转折用 impact，悬念前一小节用 riser_end。

## 7 时间换算
- 拍 = 60 / bpm 秒；小节 = 拍 × beatsPerBar。120 BPM、4/4 → 1 拍 0.5s、1 小节 2s，60 秒 = 30 小节
- 用户音乐：先跑 `audio.py beats file --bars N`，把 bpm、firstDownbeat（写进 music.offset）、suggestedStartBar（写进 music.startBar）填进 storyboard，再按小节分配场景
- 固定时长或旁白驱动时用 durationSec/endAnchor；不要为了整数小节擅自改用户时长。音乐只需关键动作对齐。

## 8 旁白驱动的秒级时码

旧 `bars` 模式继续可用；新字段用于讲解先行的项目。

- 场景 `durationSec`：正数秒，设置后优先于 `bars`。顶层 `duration` 仍是全片目标秒数。
- 文字 `atSec/outSec`：相对场景起点的秒数，优先于原 `at/out` 拍数。不能超出场景。
- 场景 `events`：`[{id:"reveal",at:4.35,duration:0.65}]`。`at` 是场景内秒数，id唯一。自定义组件用 `E.eventProgress(p.sc,"reveal",p.t)` 获取0–1进度，再应用缓动。
- 顶层 `narration`：`{gain:1,musicDuck:0.23,clips:[{id:"line1",file:"assets/voice.wav",at:0.3,text:"旁白内容",gain:1}]}`。`at` 是全片秒数；文件应是已裁好的音频片段。合成会按该时点放入独立人声轨，并在其时段降低配乐。
- `clips[].origin` 可记录素材来源、原片起止、是否含原混音。`text` 为对齐说明，不自动生成声音。
- `music.mode:"synth"` 仍按音乐网格生成配乐；画面可以有非整小节长度。

同一项时码在项目中保留一个明确来源；调整音频锚点后，同时核对字幕和对应事件。临时音频、临时时码必须在交付中说明。

事件还可以用单一声音锚点：`{id:"winner",anchor:{clip:"explain",offset:3.3},duration:0.5}`。事件时刻由该旁白片段的全片起点加偏移计算，再转为场景内时间；`anchor` 优先于 `at`。移动 clip.at 后不用重复修改相同的动画绝对时刻。

## 9 词语锚点与逐句图解

完整字段、示例与失效规则见 [narration.md](narration.md)；信息点与 explanations 字段见 [visual-coverage.md](visual-coverage.md)。`endAnchor` 可确定场景结束，`anchor/outAnchor` 可驱动事件、文字与音效。时序解析在渲染前进行，未知词语明确失败。


## 固定镜头与模式边界

跨模型一致制作先读 [stable-production.md](stable-production.md)。`visual.type:"shot"` 使用 `engine/shots.json` 的字段契约；`productionMode:"stable"` 校验输入和逐句图解缺口，显式 `custom` 保留自由绘图。`build.sh PROJECT lock` 记录并校验渲染指纹，变更后须显式重建锁及复验。
