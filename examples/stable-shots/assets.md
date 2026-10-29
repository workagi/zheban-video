# 准备与运行

复制整个示例到独立项目。将有合法来源的 Noto Serif SC 可变字体放到 `assets/fonts/NotoSerifSC-VF.ttf`，保留字体授权，fontFiles 家族名为 Noto Serif CJK SC。字体来源：https://github.com/notofonts/noto-cjk 。不自动全局安装字体。

script.json 是三句公开教学测试文案，所有排名数据均为虚构。已授权在线配音时，先运行 `bash SKILL/scripts/build.sh PROJECT tts`，生成本地音频与逐词时间轴，再 preview / lock / full。只有 tts 阶段联网。没有授权时先用去掉 narration.timeline 与 explanations 的副本做 silent 画面预览；旁白图解检查将显示未评估。

复制到其他模型时读取同一个 engine/shots.json 与此示例；不要另写绘图函数，也不要将虚构数字称为历史锦标赛成绩。
