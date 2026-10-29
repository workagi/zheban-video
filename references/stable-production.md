# 跨模型制作：把已确定的做法交给运行器

成片差异来自选题/论证、分镜选择、具体绘图、时序与环境、验收五个环节。固定绘图只能减少其中一部分差异，不能证明换模型后的选题和审美相同。模型负责观众问题、证据、文案和适合的镜头；运行器负责确定的几何关系、排序、材质、动画和渲染。

先读 [reference-production.md](reference-production.md) 了解光影层次、字幕合成顺序和段落节奏的实现，避免只把本流程理解为填写三种镜头。

## 选择模式

`productionMode:"stable"` 是有边界的可靠路径，当前只验证 `format:"landscape"`、`style:"noir-gold"`。每幕 visual.type 必须为 shot，镜头拥有背景/标题/布局/摄像机，禁止项目 custom.js 和 styleOverrides，scene.lines 只放 caption/note。保留六种风格和 custom 模式；旧项目未写 productionMode 时沿用 custom。此处不会把三种镜头称为覆盖所有主题的通用导演。

先判断本幕要让观众看懂的关系。只有注册镜头适合时才选它；例如“上一轮复制”不能用来表现同时发生的反馈。需要新机制、真实资料或新构图时进入 custom，写清缺口，先渲关键片段验证；不要悄悄借用不匹配的镜头，不要在 stable 模式塞入未验证代码。

## 唯一参数真源

先读 `engine/shots.json`（或运行 `python3 scripts/shots.py`）。不要在分镜或提示词中维护另一份完整参数表。输入只含 type/name/params，未知名称、字段和类型会失败。不要提交 computed、坐标或自己计算的我方序列。

```json
{"type":"shot","name":"lag-copy","params":{"headline":"复制对方上一轮","opponent":["C","D","D","C"],"initial":"C","event":"reveal"}}
```

- medal-reveal：一到两行 headline，奖章 emblem；split / center 两种构图。用于提出或揭晓结果，不自动证明冠军事实。
- lag-copy：opponent 输入对手序列，initial 输入首轮选择；运行器推导 own[i]=opponent[i-1]，箭头只跨一轮。wide / compact。
- ranking：items 提供 id/label/value/source；source 必须在 facts.md 有记录。运行器按数值降序排列，共用零基线和比例尺，保留并列最高。columns / horizontal。只支持非负比较；净亏损/负值需另行验证的新镜头，不能改成绝对值冒充。

场景 `staging` 为 anticipate / explain / reveal / resolve，光影与默认音乐 energy 共用注册表中的一组意图；自动重音跟随镜头完成时间，不跟随每个切点。细节见 reference-production.md。

三者均可用 event 引用本幕 events 中的 id；事件已经过统一秒级/词语锚点解析。动画完成后必须有阅读停留，时长不足直接失败。参数范围与默认值以注册表为准。

## 运行与锁定

示例 `examples/stable-shots/` 可复制为项目，按 assets.md 准备本地字体。可选在线配音必须沿用用户授权：显式 tts 一次后固定缓存，改图不重配音。已有音频也可；逐句登记检查需要时间轴。先 preview 并查看实际帧，再 silent/full 看动态和声音。

定稿后运行 `build.sh PROJECT lock`，写入 render-lock.json。每次渲染记录 qa/render-manifest.json，锁检查引擎/镜头实现、分镜、custom.js、字体/图片/旁白文件哈希、Node、Chrome、FFmpeg、分辨率、帧率及JPEG质量。内容或依赖变化会拒绝沿用旧锁；确认变更后显式重新 lock 并重验受影响片段。源码包带锁和清单，但不打包运行时二进制；不同系统/浏览器版本不承诺像素一致，也不能绕过锁直接宣称复现成功。

离线查看用户提供的其他模型结果即可比较制作方法；不得自动调用 Claude 客户端。经用户明确指定的其他模型调用才另记请求与接口返回的 model ID；CLI 名称不等于实际模型。不要将提供商返回字段当成独立审计证明。缓存声音可排除服务重新合成的波动，不能固定模型的文案判断。

## 验收与扩充

stable 逐句解释须声明 evidence 或留白理由，信息点必须关联；已声明图解登记覆盖不足50%阻止导出。标题/脚注读速、文字版面、实际声音和动态照常验收。关系日志可复查我方序列、跨轮连线、排序、数值和基线，但日志只是实现输出，必须与实际帧一起检查。

新增镜头按最小单元扩充：明确它解释的关系及不能使用的情形 → 找一个合格短镜头实现 → 收敛为有限参数 → 写关系不变量与失败测试 → 实渲默认及边界构图 → 记录验证过的风格/画幅 → 注册。不能把某次生成的 custom.js 自动晋升为可靠镜头。质感优化改固定实现，内容变化改数据，避免每个模型各维护一份代码。

如用户明确授权主动跨模型实验，使用固定题目、事实、时码、字体和声音，分别比较自由绘图与结构化接口；每模型至少重复两次，保留原始回答、实际模型ID、首轮失败与修复次数、实际帧和编码结果。只报告测到的范围：固定三镜头的差异减少，不外推到全主题、全部风格或独立创作质量。
