#!/usr/bin/env python3
"""Report registered explanatory visuals per narration line; never claims to verify semantics."""
import json
from pathlib import Path
import sys
from project import load_project


def review(project):
    p = Path(project)
    sb = load_project(p)
    layout = json.loads((p / "qa/layout.json").read_text())
    rows, warnings, failures = [], [], []
    timeline = sb.get("_narrationTimeline", [])
    for line in timeline:
        samples = [s for s in layout["samples"] if line["start"] <= s["t"] < line["end"]]
        active, exemptions = [], []
        start, bar = 0.0, 60 / sb.get("music", {}).get("bpm", 120) * sb.get("music", {}).get("beatsPerBar", 4)
        declared = []
        for scene in sb["scenes"]:
            duration = scene.get("durationSec", scene.get("bars", 0) * bar)
            for plan in scene.get("explanations", []):
                if plan.get("line") == line["id"]:
                    if plan.get("exemptReason"):
                        exemptions.append(plan["exemptReason"])
                    else:
                        declared.append(plan)
            start += duration
        wanted = {d["id"] for d in declared}
        for sample in samples:
            marks = [v for v in sample.get("visuals", []) if v.get("id") in wanted and v.get("visible")]
            if marks:
                active.append(sample)
        coverage = len(active) / len(samples) if samples else 0
        points = sorted({d.get("point", "") for d in declared if d.get("point")})
        rows.append({"line": line["id"], "text": line["text"], "start": line["start"], "end": line["end"], "registeredCoverage": round(coverage, 3), "evidence": [d.get("evidence", "") for d in declared], "points": points, "exemptReasons": exemptions})
        if not declared and not exemptions:
            warnings.append(f"{line['id']}: 未声明对应图解或留白理由")
            if sb.get("productionMode") == "stable": failures.append(f"{line['id']}: missing explanation or explicit exemption")
        elif declared and coverage < .5:
            warnings.append(f"{line['id']}: 图解登记覆盖 {coverage:.0%}；查看该句实际画面")
            if sb.get("productionMode") == "stable":
                failures.append(f"{line['id']}: required registered visual coverage is below 50%")
        for plan in declared:
            if not plan.get("evidence"):
                warnings.append(f"{line['id']}/{plan['id']}: 缺少证据说明")
                if sb.get("productionMode") == "stable": failures.append(f"{line['id']}/{plan['id']}: missing evidence description")
    used_points = {point for row in rows for point in row["points"]}
    for point in sb.get("informationPoints", []):
        if point["id"] not in used_points:
            warnings.append(f"信息点 {point['id']} 没有关联到旁白图解")
            if sb.get("productionMode") == "stable": failures.append(f"Missing information point: {point['id']}")
    if not timeline:
        warnings.append("没有逐句旁白时间轴，未评估逐句覆盖；旧 clip 音频仍可渲染")
    report = ["# 逐句图解检查", "", "范围：对比分镜声明与渲染时登记的可见图解。不是图像识别、事实核实或美术评分。", "", f"旁白 {len(rows)} 句；WARN {len(warnings)}。需要逐句查看实际画面与证据。", "", "| 句子 | 时段 | 图解登记覆盖 | 证据或留白理由 |", "|---|---|---|---|"]
    for row in rows:
        detail = "; ".join(row["evidence"] + row["exemptReasons"]).replace("|", "/").replace("\n", " ")
        report.append(f"| {row['line']} · {row['text']} | {row['start']:.2f}–{row['end']:.2f}s | {row['registeredCoverage']:.0%} | {detail} |")
    report += ["", *["- WARN " + w for w in warnings], "", "人工确认：每幅图解是否正确表达关系？数值/标签是否与来源一致？仅登记图解不能证明图解存在或讲得清楚。"]
    report += ["", *["- FAIL " + failure for failure in failures]]
    (p / "qa/information-report.md").write_text("\n".join(report))
    (p / "qa/information.json").write_text(json.dumps({"scope": "registered visuals only", "lines": rows, "warnings": warnings, "failures": failures}, ensure_ascii=False, indent=2))
    print(f"information: {len(rows)} lines, {len(warnings)} warnings -> qa/information-report.md")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(review(sys.argv[1]))
