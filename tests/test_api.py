from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from airwise.config import Settings
from airwise.main import create_app


@pytest.fixture
def api(settings: Settings) -> Iterator[TestClient]:
    snapshot_settings = settings.model_copy(update={"provider_mode": "snapshot"})
    with TestClient(create_app(snapshot_settings)) as client:
        yield client


def test_catalog_lists_locations_metrics_and_attribution(api: TestClient) -> None:
    body = api.get("/api/catalog").json()
    assert len(body["locations"]) == 10
    assert {m["id"] for m in body["metrics"]} == {
        "pm2_5",
        "pm10",
        "nitrogen_dioxide",
        "ozone",
        "european_aqi",
    }
    assert "CC BY 4.0" in body["attribution"]["text"]


def test_series_returns_aligned_points_and_provenance(api: TestClient) -> None:
    res = api.get("/api/series", params={"locations": "tel-aviv,athens", "metric": "pm10", "hours": 72})
    assert res.status_code == 200
    body = res.json()
    assert [s["locationId"] for s in body["series"]] == ["tel-aviv", "athens"]
    assert body["metric"]["unit"] == "µg/m³"
    assert body["freshness"]["source"] == "snapshot"
    a, b = (s["points"] for s in body["series"])
    assert [p[0] for p in a] == [p[0] for p in b]
    assert all(body["from"] <= p[0] <= body["to"] for p in a)


def test_daily_resolution_aggregates(api: TestClient) -> None:
    body = api.get(
        "/api/series", params={"locations": "jerusalem", "hours": 168, "resolution": "daily"}
    ).json()
    points = body["series"][0]["points"]
    assert 6 <= len(points) <= 12
    assert all(p[0] % 3600 == 0 for p in points)


@pytest.mark.parametrize(
    ("params", "field"),
    [
        ({"locations": "atlantis"}, "locations"),
        ({"locations": "tel-aviv,haifa,eilat,athens,cairo"}, "locations"),
        ({"locations": "tel-aviv", "hours": 5}, "hours"),
        ({"locations": "tel-aviv", "metric": "co2"}, "metric"),
    ],
)
def test_invalid_series_requests_are_rejected(api: TestClient, params: dict[str, object], field: str) -> None:
    res = api.get("/api/series", params=params)
    assert res.status_code == 400
    assert field in res.json()["error"]["details"]["fields"]


def test_summary_covers_every_location_with_a_band(api: TestClient) -> None:
    items = api.get("/api/summary").json()["items"]
    assert len(items) == 10
    assert all(
        i["eaqiBand"] in {"Good", "Fair", "Moderate", "Poor", "Very poor", "Extremely poor"} for i in items
    )


def test_refresh_is_a_no_op_in_snapshot_mode(api: TestClient) -> None:
    res = api.post("/api/refresh")
    assert res.status_code == 202
    assert res.json()["outcome"] == "skipped"


def test_security_headers_and_request_id(api: TestClient) -> None:
    res = api.get("/api/catalog", headers={"x-request-id": "trace-12345678"})
    assert res.headers["x-request-id"] == "trace-12345678"
    assert "frame-ancestors 'none'" in res.headers["content-security-policy"]
    assert res.headers["x-content-type-options"] == "nosniff"
    hostile = api.get("/api/catalog", headers={"x-request-id": "<script>"})
    assert hostile.headers["x-request-id"] != "<script>"


def test_health_endpoints(api: TestClient) -> None:
    assert api.get("/healthz").json() == {"status": "ok"}
    assert api.get("/readyz").status_code == 200


def test_unknown_api_path_uses_the_error_format(api: TestClient) -> None:
    res = api.get("/api/nope")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"
