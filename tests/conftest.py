import os
import tempfile
from pathlib import Path

_ROOT = Path(tempfile.mkdtemp(prefix="orbi-resq-tests-"))
(_ROOT / "data").mkdir(parents=True, exist_ok=True)

os.environ["DATABASE_URL"] = f"sqlite:///{_ROOT}/data/test.db"
os.environ["DATA_DIR"] = str(_ROOT / "data")
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["CV_SERVICE_URL"] = "http://127.0.0.1:9"

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    from server.app.main import app

    with TestClient(app) as test_client:
        yield test_client
