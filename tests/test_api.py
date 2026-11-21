BHUBANESWAR = {"latitude": 20.2961, "longitude": 85.8245}


def test_health_reports_components(client):
    response = client.get("/api/system/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"ok", "degraded"}
    assert body["database_backend"]
    assert body["counts"]["cameras"] > 0
    assert any(component["name"] == "database" for component in body["components"])


def test_radius_options_are_global_defaults(client):
    response = client.get("/api/cameras/radius-options")
    assert response.status_code == 200
    body = response.json()
    assert 5 in body["options_km"] and 100 in body["options_km"]


def test_camera_list_is_distance_ordered(client):
    response = client.get("/api/cameras", params={**BHUBANESWAR, "radius_km": 50, "page_size": 50})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] > 0
    distances = [item["distance_km"] for item in body["items"] if item.get("distance_km") is not None]
    assert distances == sorted(distances)


def test_camera_validation_never_claims_live_without_check(client):
    listed = client.get("/api/cameras", params={"page_size": 1}).json()
    camera_id = listed["items"][0]["id"]
    response = client.post(f"/api/cameras/{camera_id}/validate")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"LIVE", "OFFLINE", "UNVERIFIED", "RESTRICTED", "ARCHIVED"}
    assert body["last_validated_at"] is not None


def test_stream_info_declares_playback_kind(client):
    listed = client.get("/api/cameras", params={"page_size": 1}).json()
    camera_id = listed["items"][0]["id"]
    response = client.get(f"/api/cameras/{camera_id}/stream")
    assert response.status_code == 200
    body = response.json()
    assert body["playback_kind"] in {"hls", "video", "snapshot", "external_page", "unavailable"}
    if body["playback_kind"] == "unavailable":
        assert body["playable"] is False
        assert body["reason"]


def test_discovery_uses_registry_and_reports_providers(client):
    response = client.post(
        "/api/cameras/discover",
        json={**BHUBANESWAR, "radius_km": 25, "providers": ["registry"], "persist": False},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    assert body["providers"]
    assert any(report["id"] == "registry" for report in body["providers"])


def test_discovery_empty_radius_reports_message(client):
    response = client.post(
        "/api/cameras/discover",
        json={"latitude": -54.8, "longitude": -68.3, "radius_km": 5, "providers": ["registry"], "persist": False},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 0
    assert body["message"]


def test_incidents_filters_and_summary(client):
    listed = client.get("/api/incidents", params={"page_size": 5})
    assert listed.status_code == 200
    body = listed.json()
    assert body["total"] > 0
    assert len(body["items"]) <= 5

    summary = client.get("/api/incidents/summary").json()
    assert summary["total"] >= body["total"]
    assert set(summary["by_severity"]).issubset({"LOW", "MEDIUM", "HIGH", "CRITICAL"})

    severity = body["items"][0]["severity"]
    filtered = client.get("/api/incidents", params={"severity": severity, "page_size": 50}).json()
    assert all(item["severity"] == severity for item in filtered["items"])


def test_incident_verification_workflow(client):
    incident = client.get("/api/incidents", params={"page_size": 1}).json()["items"][0]
    response = client.patch(f"/api/incidents/{incident['id']}", json={"verification_status": "verified"})
    assert response.status_code == 200
    assert response.json()["verification_status"] == "verified"

    resolved = client.patch(f"/api/incidents/{incident['id']}", json={"verification_status": "resolved"})
    assert resolved.status_code == 200
    assert resolved.json()["verification_status"] == "resolved"


def test_incident_rejects_unknown_category(client):
    response = client.get("/api/incidents", params={"category": "not_a_category"})
    assert response.status_code in {200, 422}
    if response.status_code == 200:
        assert response.json()["total"] == 0


def test_pagination_limit_enforced(client):
    response = client.get("/api/incidents", params={"page_size": 500})
    assert response.status_code == 422


def test_location_resolution_returns_place_fields(client):
    response = client.get("/api/location/current", params=BHUBANESWAR)
    assert response.status_code == 200
    body = response.json()
    assert round(body["latitude"], 4) == round(BHUBANESWAR["latitude"], 4)
    for field in ("locality", "city", "district", "state", "country", "display_name"):
        assert field in body


def test_location_search_returns_candidates(client):
    response = client.get("/api/location/search", params={"q": "Berlin"})
    assert response.status_code == 200
    results = response.json()
    assert isinstance(results, list)
    if results:
        assert results[0]["display_name"]


def test_dataset_creation_and_import(client):
    created = client.post("/api/datasets", json={"name": "API test dataset", "category": "accident"})
    assert created.status_code == 201
    dataset = created.json()
    assert dataset["file_count"] == 0

    imported = client.post(
        "/api/datasets/import",
        data={"dataset_id": dataset["id"], "category": "accident", "metadata": '{"source":"test"}'},
        files=[("files", ("sample.csv", b"frame,label\n1,accident\n", "text/csv"))],
    )
    assert imported.status_code == 201
    body = imported.json()
    assert body["file_count"] == 1
    assert body["size_bytes"] > 0
    assert body["items"][0]["filename"] == "sample.csv"

    removed = client.delete(f"/api/datasets/{dataset['id']}")
    assert removed.status_code == 204


def test_import_rejects_unsupported_file(client):
    response = client.post(
        "/api/datasets/import",
        data={"dataset_name": "Rejected import", "category": "other"},
        files=[("files", ("notes.txt", b"plain text", "text/plain"))],
    )
    assert response.status_code in {400, 201}
    if response.status_code == 201:
        assert response.json()["file_count"] == 0


def test_models_registry_and_runtime(client):
    models = client.get("/api/models")
    assert models.status_code == 200
    assert isinstance(models.json(), list)

    runtime = client.get("/api/models/runtime")
    assert runtime.status_code == 200
    body = runtime.json()
    assert "reachable" in body
    assert isinstance(body["detectors"], list)
    if not body["reachable"]:
        assert body["detectors"] == []


def test_cv_service_reports_detector_states_honestly():
    from fastapi.testclient import TestClient

    from cv_service.app import app as cv_app

    with TestClient(cv_app) as vision:
        health = vision.get("/health").json()
        assert health["status"] == "ok"
        assert health["detectors"] >= 4

        detectors = vision.get("/v1/models").json()["detectors"]
        assert detectors
        for detector in detectors:
            assert detector["state"] in {"ready", "unavailable"}
            assert detector["detail"]

        assert vision.post("/v1/detect", json={}).status_code == 400
        assert vision.post("/v1/detect", json={"image_url": "ftp://example.com/a.jpg"}).status_code == 400


def test_notification_channels_and_acknowledgement(client):
    channels = client.get("/api/notifications/channels")
    assert channels.status_code == 200
    assert any(channel["channel"] == "in_app" for channel in channels.json())

    created = client.post("/api/notifications/test")
    assert created.status_code in {200, 201}
    record = created.json()
    assert record["acknowledged_at"] is None

    acknowledged = client.post(f"/api/notifications/{record['id']}/acknowledge")
    assert acknowledged.status_code == 200
    assert acknowledged.json()["acknowledged_at"] is not None


def test_settings_and_storage_are_exposed_safely(client):
    settings = client.get("/api/system/settings").json()
    assert settings["emergency_services_enabled"] is False
    assert settings["max_radius_km"] >= settings["default_radius_km"]

    storage = client.get("/api/system/storage").json()
    assert storage["backend"] in {"local", "s3"}
    serialized = str(storage).lower()
    assert "secret" not in serialized and "password" not in serialized


def test_camera_registration_marks_unverified_until_validated(client):
    payload = {
        "name": "Test junction camera",
        "latitude": 20.3,
        "longitude": 85.83,
        "city": "Bhubaneswar",
        "state": "Odisha",
        "country": "India",
        "source_type": "web_page",
        "access_classification": "authorized",
        "provider": "test",
    }
    created = client.post("/api/cameras", json=payload)
    assert created.status_code == 201
    body = created.json()
    assert body["status"] in {"UNVERIFIED", "RESTRICTED"}
    assert body["status"] != "LIVE"


def test_camera_registration_rejects_invalid_coordinates(client):
    response = client.post(
        "/api/cameras",
        json={"name": "Bad camera", "latitude": 120, "longitude": 200},
    )
    assert response.status_code == 422
