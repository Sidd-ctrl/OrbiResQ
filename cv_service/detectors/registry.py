import io
import os

from .base import DetectorCapability, capability
from .models import InterfaceDetector, ObjectDetector


def frame_metrics(content: bytes) -> dict:
    try:
        from PIL import Image
        import numpy as np
    except ImportError:
        return {"available": False, "detail": "Pillow and numpy are required for frame metrics."}

    try:
        with Image.open(io.BytesIO(content)) as image:
            width, height = image.size
            grey = image.convert("L")
            array = np.asarray(grey, dtype="float32")
    except Exception as exc:  # noqa: BLE001
        return {"available": False, "detail": f"Frame could not be decoded: {exc.__class__.__name__}"}

    if array.size == 0:
        return {"available": False, "detail": "Decoded frame is empty."}

    gradient_y, gradient_x = np.gradient(array)
    edge_energy = float(np.mean(np.abs(gradient_x) + np.abs(gradient_y)))
    return {
        "available": True,
        "width": width,
        "height": height,
        "mean_luma": round(float(array.mean()), 2),
        "contrast_std": round(float(array.std()), 2),
        "edge_energy": round(edge_energy, 3),
        "low_visibility": bool(array.mean() < 35 or edge_energy < 2.5),
    }


def build_registry() -> list:
    return [
        ObjectDetector(),
        InterfaceDetector(
            "road_anomaly",
            "Road anomaly classifier",
            "road_anomaly",
            "Interface defined. A trained pothole, debris and obstruction model must be registered before inference.",
        ),
        InterfaceDetector(
            "environment_hazard",
            "Environmental hazard classifier",
            "environment",
            "Interface defined. Flood, waterlogging, fire and smoke weights are not installed.",
        ),
        InterfaceDetector(
            "accident_temporal",
            "Temporal collision analyser",
            "accident",
            "Interface defined. Collision inference needs multi-frame tracking and trained temporal weights.",
        ),
        InterfaceDetector(
            "traffic_density",
            "Traffic density analyser",
            "traffic",
            "Interface defined. Density estimation needs calibrated per-camera baselines.",
        ),
    ]


def registry_capabilities() -> list[DetectorCapability]:
    return [capability(detector) for detector in build_registry()]


def run_detectors(content: bytes, requested: list[str] | None) -> dict:
    metrics = frame_metrics(content)
    results = []
    detections: list[dict] = []
    any_model = False

    for detector in build_registry():
        if requested and detector.id not in requested:
            continue
        ready, detail = detector.available()
        entry = {
            "id": detector.id,
            "label": detector.label,
            "task": detector.task,
            "state": "ran" if ready else "model_not_installed",
            "detail": detail,
            "detections": [],
        }
        if ready and metrics.get("available"):
            try:
                from PIL import Image

                with Image.open(io.BytesIO(content)) as image:
                    frame = image.convert("RGB")
                found = detector.run(frame)
                entry["detections"] = found
                detections.extend(found)
                any_model = True
            except Exception as exc:  # noqa: BLE001
                entry["state"] = "failed"
                entry["detail"] = f"Inference failed: {exc.__class__.__name__}"
        results.append(entry)

    return {
        "status": "ok" if any_model else "model_not_installed",
        "frame": metrics,
        "detectors": results,
        "detections": detections,
        "note": "Only detectors with installed weights produce detections. Frame metrics are measured, not inferred.",
        "weights_directory": os.environ.get("CV_WEIGHTS_DIR", ""),
    }
