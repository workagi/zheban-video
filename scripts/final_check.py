#!/usr/bin/env python3
"""final_check.py project video.mp4 [--silent]; nonzero exit on failed checks."""
import json, math, os, re, subprocess, sys
from pathlib import Path
from project import load_project


def run(args):
    return subprocess.run(args, capture_output=True, check=False)


def first_frame_metrics(mp4):
    # Decode into full-range RGB. Limited-range YUV black is Y=16, not zero.
    r = run(['ffmpeg', '-v', 'error', '-i', str(mp4), '-vf', 'scale=320:-1,format=rgb24',
             '-frames:v', '1', '-f', 'rawvideo', '-'])
    if r.returncode or not r.stdout:
        raise ValueError('无法解码首帧: ' + r.stderr.decode(errors='replace')[-300:])
    d = r.stdout
    y = [0.2126 * a + 0.7152 * b + 0.0722 * c for a, b, c in zip(d[::3], d[1::3], d[2::3])]
    return sum(y) / len(y), sum(v > 12 for v in y) / len(y)


def main():
    P, mp4 = Path(sys.argv[1]), Path(sys.argv[2])
    silent = '--silent' in sys.argv[3:]
    sb = load_project(P)
    fails, oks = [], []
    def chk(ok, good, bad):
        (oks if ok else fails).append(good if ok else bad)
    try:
        p = run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(mp4)])
        if p.returncode: raise ValueError('ffprobe 无法读取文件: ' + p.stderr.decode(errors='replace')[-300:])
        pr = json.loads(p.stdout)
        videos = [s for s in pr['streams'] if s['codec_type'] == 'video']
        audios = [s for s in pr['streams'] if s['codec_type'] == 'audio']
        if len(videos) != 1: raise ValueError('需要且只允许一条视频轨')
        v = videos[0]
        w,h = (1080,1920) if sb.get('format') == 'portrait' else (1920,1080)
        fps = sb.get('fps',30); dur = float(pr['format']['duration'])
        chk(v.get('codec_name') == 'h264' and v.get('profile') == 'High' and v.get('pix_fmt') == 'yuv420p',
            '视频 H.264 High / yuv420p', '视频必须为 H.264 High / yuv420p')
        chk((v['width'],v['height']) == (w,h), f'分辨率 {w}×{h}', '分辨率不符')
        num,den = map(int,v['avg_frame_rate'].split('/'))
        chk(den > 0 and abs(num/den - fps) < .01, f'帧率 {fps}fps', '帧率不符')
        bar = 60 / sb.get('music',{}).get('bpm',120) * sb.get('music',{}).get('beatsPerBar',4)
        target = sb.get('duration',sum(s.get('durationSec', s.get('bars',0)*bar) for s in sb['scenes']))
        chk(abs(dur-target) < .15, f'时长 {dur:.2f}s', f'时长 {dur:.2f}s ≠ {target}s')
        if silent:
            chk(not audios, '无声预览：0 条音轨', '无声预览意外包含音轨')
        else:
            chk(len(audios)==1 and audios[0].get('codec_name')=='aac' and audios[0].get('sample_rate')=='48000',
                '音频 AAC 48kHz', '需要一条 AAC 48kHz 音轨')
            if audios:
                a = run(['ffmpeg','-v','info','-nostats','-i',str(mp4),'-vn','-af','ebur128=peak=true','-f','null','-'])
                txt = a.stderr.decode(errors='replace'); summ = txt[txt.rfind('Summary:'):]
                im = re.search(r'I:\s+(-?[\d.]+|-inf) LUFS',summ)
                pm = re.search(r'Peak:\s+(-?[\d.]+|-inf) dBFS',summ)
                if a.returncode or not im or not pm: fails.append('响度分析失败，不能视为通过')
                else:
                    loud,peak = float(im[1]),float(pm[1])
                    chk(math.isfinite(loud) and -15<=loud<=-13, f'响度 {loud:.1f} LUFS', f'响度 {loud} LUFS 超出 -14±1')
                    chk(math.isfinite(peak) and peak<=-1, f'真峰值 {peak:.1f} dBTP', f'真峰值 {peak} dBTP 不合格')
                tail=run(['ffmpeg','-v','info','-nostats','-sseof','-0.25','-i',str(mp4),'-vn','-af','volumedetect','-f','null','-'])
                tm=re.search(r'mean_volume: (-?[\d.]+|-inf) dB',tail.stderr.decode(errors='replace'))
                chk(tail.returncode==0 and tm is not None and float(tm[1]) < -35,
                    '结尾淡出通过', '结尾淡出不合格或无法测量')
        decode=run(['ffmpeg','-v','error','-xerror','-i',str(mp4),'-f','null','-'])
        chk(decode.returncode==0 and not decode.stderr.strip(), '全片解码通过', '全片解码失败: '+decode.stderr.decode(errors='replace')[-300:])
        mean,lit=first_frame_metrics(mp4)
        chk(mean>3 and lit>=.01, f'首帧非黑：RGB亮度 {mean:.1f}，可见像素 {lit:.1%}',
            f'首帧接近黑屏：RGB亮度 {mean:.1f}，可见像素 {lit:.1%}')
        ov=P/'qa/overview.jpg'; ov.parent.mkdir(parents=True,exist_ok=True)
        cs=run([sys.executable,str(Path(__file__).with_name('contact_sheet.py')),'video',str(mp4),str(ov),'16'])
        chk(cs.returncode==0,'总览图已生成，仍需人工目检','总览图生成失败: '+cs.stderr.decode(errors='replace')[-300:])
    except (ValueError,KeyError,StopIteration,OSError,ZeroDivisionError) as e:
        fails.append(str(e))
    rep=['# 成片检查','',f'文件：{mp4.name}',f'模式：{"无声预览" if silent else "有声音频成片"}','',
         f'**结论：{"❌ 未通过" if fails else "✅ 通过"}**','']
    rep += ['- ❌ '+x for x in fails]+['- ✅ '+x for x in oks]
    (P/'qa').mkdir(exist_ok=True)
    (P/'qa/final_report.md').write_text('\n'.join(rep))
    print('\n'.join(rep))
    return 1 if fails else 0


if __name__=='__main__': sys.exit(main())
