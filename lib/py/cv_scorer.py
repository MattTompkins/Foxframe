#!/usr/bin/env python3
"""
Score video clip windows with CLIP (local, no API keys).

Batch mode (stdin JSON) — score final clip files in clips/:
{
  "positive": "person speaking to camera",
  "negative": "blurry dark",
  "clips": [{"id": "foo-clip-01.mp4", "video": "/absolute/path/clips/foo-clip-01.mp4"}]
}

Legacy (windows on one source video) still supported for tooling.

Stdout JSON:
{
  "scores": [{"id": "0", "cvScore": 0.74, "positiveSimilarity": 0.31, "negativeSimilarity": 0.12}],
  "model": "openai/clip-vit-base-patch32",
  "device": "mps"
}
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

import av
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

MODEL_ID = "openai/clip-vit-base-patch32"
FRAMES_PER_WINDOW = 3

_model: CLIPModel | None = None
_processor: CLIPProcessor | None = None
_device: torch.device | None = None


def resolve_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def load_model() -> tuple[CLIPModel, CLIPProcessor, torch.device]:
    global _model, _processor, _device
    if _model is not None and _processor is not None and _device is not None:
        return _model, _processor, _device

    device = resolve_device()
    processor = CLIPProcessor.from_pretrained(MODEL_ID)
    model = CLIPModel.from_pretrained(MODEL_ID)
    model.eval()
    model.to(device)

    _model = model
    _processor = processor
    _device = device
    return model, processor, device


def sample_times(start: float, end: float, count: int) -> list[float]:
    if end <= start:
        return [max(0.0, start)]
    if count <= 1:
        return [start + (end - start) / 2]
    step = (end - start) / (count - 1)
    return [start + step * i for i in range(count)]


def frame_at_time(
    container: av.container.InputContainer,
    stream: av.video.stream.VideoStream,
    time_sec: float,
) -> Image.Image | None:
    time_sec = max(0.0, time_sec)
    container.seek(int(time_sec * 1_000_000), stream=stream)

    for frame in container.decode(stream):
        return frame.to_image()

    return None


def extract_window_frames(
    container: av.container.InputContainer,
    stream: av.video.stream.VideoStream,
    start: float,
    end: float,
) -> list[Image.Image]:
    images: list[Image.Image] = []
    times = sample_times(start, end, FRAMES_PER_WINDOW)

    for time_sec in times:
        try:
            image = frame_at_time(container, stream, time_sec)
            if image is not None:
                images.append(image)
        except Exception:
            continue

    return images


def cosine_similarity(model: CLIPModel, processor: CLIPProcessor, device: torch.device, images: list[Image.Image], text: str) -> float:
    if not images or not text.strip():
        return 0.0

    inputs = processor(
        text=[text],
        images=images,
        return_tensors="pt",
        padding=True,
    )
    inputs = {key: value.to(device) for key, value in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)
        image_embeds = outputs.image_embeds / outputs.image_embeds.norm(dim=-1, keepdim=True)
        text_embeds = outputs.text_embeds / outputs.text_embeds.norm(dim=-1, keepdim=True)
        similarity = (image_embeds @ text_embeds.T).squeeze(-1)

    return float(similarity.mean().item())


def score_window(
    model: CLIPModel,
    processor: CLIPProcessor,
    device: torch.device,
    container: av.container.InputContainer,
    stream: av.video.stream.VideoStream,
    start: float,
    end: float,
    positive: str,
    negative: str,
) -> dict[str, float]:
    images = extract_window_frames(container, stream, start, end)
    if not images:
        return {
            "cvScore": 0.5,
            "positiveSimilarity": 0.0,
            "negativeSimilarity": 0.0,
        }

    positive = positive.strip() or "high quality video frame"
    pos = cosine_similarity(model, processor, device, images, positive)
    neg = cosine_similarity(model, processor, device, images, negative) if negative.strip() else 0.0

    # Map contrast to 0–1 (CLIP cosine similarities are typically ~0.15–0.35)
    raw = pos - neg
    cv_score = max(0.0, min(1.0, (raw + 0.05) / 0.35))

    return {
        "cvScore": round(cv_score, 4),
        "positiveSimilarity": round(pos, 4),
        "negativeSimilarity": round(neg, 4),
    }


def clip_duration_seconds(
    container: av.container.InputContainer,
    stream: av.video.stream.VideoStream,
) -> float:
    if container.duration:
        return max(0.1, container.duration / 1_000_000)
    if stream.duration and stream.time_base:
        return max(0.1, float(stream.duration * stream.time_base))
    return 1.0


def score_batch(payload: dict[str, Any]) -> dict[str, Any]:
    positive = str(payload.get("positive") or "")
    negative = str(payload.get("negative") or "")
    model, processor, device = load_model()
    scores: list[dict[str, Any]] = []

    clips = payload.get("clips")
    if isinstance(clips, list) and len(clips) > 0:
        for index, clip in enumerate(clips):
            if not isinstance(clip, dict):
                continue
            video = clip.get("video")
            if not video or not isinstance(video, str):
                continue
            clip_id = str(clip.get("id", index))

            with av.open(video) as container:
                if not container.streams.video:
                    scores.append(
                        {
                            "id": clip_id,
                            "cvScore": 0.5,
                            "positiveSimilarity": 0.0,
                            "negativeSimilarity": 0.0,
                        }
                    )
                    continue
                stream = container.streams.video[0]
                duration = clip_duration_seconds(container, stream)
                result = score_window(
                    model,
                    processor,
                    device,
                    container,
                    stream,
                    0.0,
                    duration,
                    positive,
                    negative,
                )
                scores.append({"id": clip_id, **result})

        return {
            "scores": scores,
            "model": MODEL_ID,
            "device": str(device),
            "framesSampled": FRAMES_PER_WINDOW,
        }

    video = payload.get("video")
    if not video or not isinstance(video, str):
        raise ValueError('Missing "clips" array or legacy "video" path in request')

    windows = payload.get("windows")
    if not isinstance(windows, list):
        raise ValueError('Missing "windows" array in legacy request')

    with av.open(video) as container:
        if not container.streams.video:
            raise ValueError("Video has no video stream")
        stream = container.streams.video[0]

        for index, window in enumerate(windows):
            if not isinstance(window, dict):
                continue
            window_id = str(window.get("id", index))
            start = float(window.get("start", 0))
            end = float(window.get("end", start + 1))

            result = score_window(
                model, processor, device, container, stream, start, end, positive, negative
            )
            scores.append({"id": window_id, **result})

    return {
        "scores": scores,
        "model": MODEL_ID,
        "device": str(device),
        "framesSampled": FRAMES_PER_WINDOW,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Foxframe CLIP clip scorer")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify dependencies and model load, then exit",
    )
    args = parser.parse_args()

    if args.check:
        model, _processor, device = load_model()
        print(
            json.dumps(
                {
                    "ok": True,
                    "model": MODEL_ID,
                    "device": str(device),
                    "parameters": sum(p.numel() for p in model.parameters()),
                }
            )
        )
        return 0

    raw = sys.stdin.read()
    if not raw.strip():
        print(json.dumps({"error": "No JSON input on stdin"}), file=sys.stderr)
        return 1

    try:
        payload = json.loads(raw)
        result = score_batch(payload)
        print(json.dumps(result))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
