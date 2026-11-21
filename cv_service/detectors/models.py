import os
from pathlib import Path


class ObjectDetector:
    id = "object_detection"
    label = "Vehicle and pedestrian detector"
    task = "object_detection"
    requires = ["ultralytics", "CV_YOLO_WEIGHTS"]

    def __init__(self) -> None:
        self.weights = os.environ.get("CV_YOLO_WEIGHTS", "")

    def available(self) -> tuple[bool, str]:
        try:
            from ultralytics import YOLO  # noqa: F401
        except ImportError:
            return False, "ultralytics is not installed in this environment."
        if not self.weights or not Path(self.weights).exists():
            return False, "No trained weights configured (CV_YOLO_WEIGHTS)."
        return True, f"Weights loaded from {self.weights}."

    def run(self, frame) -> list[dict]:
        from ultralytics import YOLO

        model = YOLO(self.weights)
        results = model.predict(frame, verbose=False)
        detections: list[dict] = []
        for result in results:
            names = result.names
            for box in result.boxes:
                detections.append(
                    {
                        "label": names[int(box.cls)],
                        "confidence": round(float(box.conf), 4),
                        "box": [round(float(value), 2) for value in box.xyxy[0].tolist()],
                    }
                )
        return detections


class InterfaceDetector:
    requires: list[str] = []

    def __init__(self, detector_id: str, label: str, task: str, reason: str) -> None:
        self.id = detector_id
        self.label = label
        self.task = task
        self.reason = reason

    def available(self) -> tuple[bool, str]:
        return False, self.reason

    def run(self, frame) -> list[dict]:
        return []
