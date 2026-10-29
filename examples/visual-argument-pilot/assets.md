# 样例素材准备

本例是已执行的15秒横屏样片。项目代码、数据和旁白时码在同目录文件中。字体和用户提供的参考片原声不重复存入Skill；用户交付的源码包包含本次实际使用的项目素材。

复现时准备：

- `assets/fonts/NotoSerifSC-VF.ttf`：官方 Noto Serif SC 可变字体，SIL OFL 1.1；来自 https://github.com/notofonts/noto-cjk/tree/main/Serif/Variable/TTF/Subset ，保留原许可证。
- `assets/audio/reference-intro.wav`：本次用户参考片0.00–3.65秒的原声片段，保留原混音，48kHz立体声。
- `assets/audio/reference-explain.wav`：同一参考片38.25–42.05秒原声片段。

使用自己的录音时修改`narration.clips`的文件、时点和文本，并回调动画事件和字幕；不依赖特定说话人的身份，也不需要音色克隆。

运行`build.sh <项目> preview`、`silent`或`full`。本例用于展示视觉论证和声音时码，是否达到参考影片的观感仍需人判断。
