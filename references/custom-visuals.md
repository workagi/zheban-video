# 自定义组件（custom.js）

内置组件不够用时，在**项目目录**写 `custom.js`，不要改引擎。render.cjs 会在引擎之后自动注入它。

```js
window.CKV_CUSTOM = window.CKV_CUSTOM || {};
// storyboard: "visual": { "type": "custom", "name": "scale", "left": "合作", "right": "背叛" }
window.CKV_CUSTOM.scale = (c, r, p, E) => {
  const S = E.S;                        // 当前风格 token：S.c.accent / S.c.text / S.c.good / S.c.bad ...
  const k = E.ease.out(E.clamp((p.b - 1) / 2)); // p.b = 场景内拍数；按拍写动画
  const cx = r.x + r.w / 2, cy = r.y + r.h * 0.45, tilt = Math.sin(p.t * 0.8) * 0.06 * k;
  E.stroke(c, [[cx - 300, cy + 300 * tilt], [cx + 300, cy - 300 * tilt]], { k, width: 1.2 }); // 风格化线条（笔触/发光/铅笔自动适配）
  E.panel(c, cx - 360, cy + 40, 160, 90, { k });                                             // 风格化面板
  E.label(c, p.v.left, cx - 280, cy + 85, { valign: 'middle', maxW: 150, kin: k });          // 文字必须走 E.label（参与质检）
  E.glowDot(c, cx, cy, 6, S.c.accent, k);
};
```

## 规则
- 只能用 `p.t`（场景内秒）、`p.b`（场景内拍）、`p.k`（0–1 进度）和 `E.rng(seed)` 产生变化。禁止 `Math.random`、`Date`、`performance.now`、`requestAnimationFrame`
- 只在组件区 `r` 内画；center 布局时 `p.avoid` 是文字区，要绕开
- 颜色、线条、面板都从 `E.S` / `E.stroke` / `E.panel` 取，别写死色值，否则换风格就穿帮
- 组件里的文字一律 `E.label(...)`（role 默认 label），这样字号、对比度、遮挡都会被质检
- 需要预计算（如生成路径、离屏画布）就写 `window.CKV_CUSTOM_INIT = async (E) => {...}`，会在初始化时调用一次

## 需要真 3D 时（Three.js）
1. 在项目里放 `assets/three.module.js`（或用 npm 包 three 的 build 文件）
2. 在 `CKV_CUSTOM_INIT` 里建一个离屏 `WebGLRenderer({ canvas: new OffscreenCanvas(w,h), preserveDrawingBuffer: true })`，场景、相机都在这里建好
3. 组件里按 `p.t` 设置相机/物体变换 → `renderer.render(scene, camera)` → `c.drawImage(renderer.domElement, r.x, r.y, r.w, r.h)`
4. 不用 `THREE.Clock`，不用 `setAnimationLoop`；动画只由 `p.t` 决定
5. 3D 只占中景；背景和前景仍用风格布景，保证三层次和统一质感

## API 速查
`E.ease.{lin,out,in,inOut,expo,back}` · `E.clamp` `E.lerp` · `E.rng(seed)` · `E.noise1(seed)(x)` `E.fbm1(seed)(x)` · `E.hexA(hex, a)` · `E.stroke(c, pts, {k, width, color, alpha, mode, seed})` · `E.panel(c, x, y, w, h, {k, highlight, alpha})` → 返回该面板上该用的文字色 · `E.label(c, text, x, y, {role, align, valign, maxW, kin, color, size, maxLines})` · `E.glowDot(c, x, y, r, color, a)` · `E.F`（版式：safe/size/min）· `E.W` `E.H` · `E.beat` `E.bar`

## 专属视觉论证

组件库是可复用绘图工具，不限定整片的镜头结构。先写观众问题和证据，再选通用组件或专属动画；不要让“只能填一个框”替代构图设计。

`E.BG`/`E.FG` 暴露背景和前景注册表，必要时在 `CKV_CUSTOM_INIT` 注册项目布景，并由场景 `bg/fg` 选择。保持当前预设的色彩、字体和材质语言。自定义布景中的装饰数字不是论据，不得让其取代实际图表的数据来源。

场景内事件可用 `E.eventProgress(p.sc,id,p.t)` 驱动。物体、箭头、数据和局部强调的变化都应对应某个解释任务；整体缓慢推近不是专属动画的替代。

金属体积可以通过明暗面、倒角、反射扫光和投影表现；先验证2D绘图是否满足目标，再决定是否引入真正3D。不要靠大面积光晕遮盖主体细节。

### 已执行的样例

`examples/visual-argument-pilot/custom.js` 是15秒横屏片段：金属奖章提出矛盾，两排选择和错位箭头解释复制规则，真实排名柱图揭晓平均分第一。代码展示确定性材质纹理、局部事件和分层绘制。`storyboard.json` 保存已核实的得分数据；素材准备见该目录 `assets.md`。

复杂画面更要实看动态片段，检查转场交接、数值与柱高、标签底衬、主次和旁白对应。示例本身是待用户对照参考评价的试片，不能宣称复制后必然达到同一水准。

## 信息登记与硬切

实际绘制图解时调用 `E.info(id,kind,{x,y,w,h})`，对应场景 explanations 中的 id。只在图形可见分支登记；这不是语义检验。内置 `transition:"cut"` 可避免不相容构图在叠化中重影。词语 anchor 解析后的事件仍用 E.eventProgress；首场景精确对词时设 visual.preroll:0。


## 固定镜头与模式边界

跨模型一致制作先读 [stable-production.md](stable-production.md)。`visual.type:"shot"` 使用 `engine/shots.json` 的字段契约；`productionMode:"stable"` 校验输入和逐句图解缺口，显式 `custom` 保留自由绘图。`build.sh PROJECT lock` 记录并校验渲染指纹，变更后须显式重建锁及复验。
