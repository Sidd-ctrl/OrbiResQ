from .models import Camera, Incident
from .schemas import CameraOut, IncidentOut


def camera_out(camera: Camera, distance_km: float | None = None, incident_count: int = 0) -> CameraOut:
    payload = CameraOut.model_validate(camera)
    payload.distance_km = distance_km
    payload.incident_count = incident_count
    return payload


def incident_out(incident: Incident, camera_name: str | None = None) -> IncidentOut:
    payload = IncidentOut.model_validate(incident)
    payload.camera_name = camera_name
    return payload
