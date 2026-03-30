#!/usr/bin/env python3
"""
说话人分辨脚本 — 使用 pyannote.audio 进行说话人自动识别
输入: 音频文件路径
输出: JSON 文件（说话人列表 + 时间段标注）

依赖:
    pip install pyannote.audio torch torchaudio

用法:
    python3 diarize.py --audio /path/to/audio.wav --output /path/to/diarization.json
"""

import argparse
import json
import sys
import os


def check_dependencies():
    """检查依赖是否已安装"""
    missing = []
    try:
        import torch  # noqa: F401
    except ImportError:
        missing.append("torch")
    try:
        import pyannote.audio  # noqa: F401
    except ImportError:
        missing.append("pyannote.audio")

    if missing:
        print(f"缺少依赖: {', '.join(missing)}", file=sys.stderr)
        print(f"请运行: pip install {' '.join(missing)}", file=sys.stderr)
        sys.exit(1)


def diarize(audio_path: str, output_path: str, hf_token: str = None):
    """执行说话人分辨"""
    from pyannote.audio import Pipeline

    # 加载预训练模型
    # 需要 Hugging Face token（首次使用需同意模型协议）
    pipeline_kwargs = {}
    if hf_token:
        pipeline_kwargs["use_auth_token"] = hf_token
    elif os.environ.get("HF_TOKEN"):
        pipeline_kwargs["use_auth_token"] = os.environ["HF_TOKEN"]

    print("加载说话人分辨模型...", file=sys.stderr)
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        **pipeline_kwargs
    )

    # 如果有 GPU 则使用
    try:
        import torch
        if torch.cuda.is_available():
            pipeline.to(torch.device("cuda"))
            print("使用 GPU 加速", file=sys.stderr)
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            pipeline.to(torch.device("mps"))
            print("使用 Apple Silicon GPU 加速", file=sys.stderr)
    except Exception:
        pass

    print("开始说话人分辨...", file=sys.stderr)
    diarization = pipeline(audio_path)

    # 收集结果
    speakers_set = set()
    segments = []

    for turn, _, speaker in diarization.itertracks(yield_label=True):
        speakers_set.add(speaker)
        segments.append({
            "speaker": speaker,
            "start": round(turn.start, 3),
            "end": round(turn.end, 3),
        })

    # 排序说话人
    speakers = sorted(speakers_set)

    result = {
        "speakers": speakers,
        "segments": segments,
    }

    # 写入输出文件
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"完成: {len(speakers)} 个说话人, {len(segments)} 个片段", file=sys.stderr)
    return result


def main():
    parser = argparse.ArgumentParser(description="说话人分辨")
    parser.add_argument("--audio", required=True, help="音频文件路径")
    parser.add_argument("--output", required=True, help="输出 JSON 文件路径")
    parser.add_argument("--hf-token", default=None, help="Hugging Face API Token")
    args = parser.parse_args()

    if not os.path.exists(args.audio):
        print(f"音频文件不存在: {args.audio}", file=sys.stderr)
        sys.exit(1)

    check_dependencies()
    diarize(args.audio, args.output, args.hf_token)


if __name__ == "__main__":
    main()
