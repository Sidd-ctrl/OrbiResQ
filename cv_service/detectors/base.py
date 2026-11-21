from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class DetectorCapability:
    id: str
    label: str
    task: str
    state: str
    detail: str
    requires: list[str] = field(default_factory=list)
    detections: list[dict] = field(default_factory=list)


class Detector(Protocol):
    id: str
    label: str
    task: str

    def available(self) -> tuple[bool, str]: ...

    def run(self, frame) -> list[dict]: ...


def capability(detector: Detector) -> DetectorCapability:
    ready, detail = detector.available()
    return DetectorCapability(
        id=detector.id,
        label=detector.label,
        task=detector.task,
        state="ready" if ready else "unavailable",
        detail=detail,
        requires=getattr(detector, "requires", []),
    )
