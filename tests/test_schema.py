import json
from typing import Any

import pytest
from pydantic import ValidationError
from tests.conftest import SNAPSHOT, make_payload

from airwise.catalog import LOCATIONS, eaqi_band
from airwise.ingest import MappingError, load_snapshot, to_rows
from airwise.provider.schema import ProviderPayload


def test_recorded_provider_response_satisfies_the_contract() -> None:
    snap = load_snapshot(SNAPSHOT)
    assert len(snap.payload.root) == len(LOCATIONS)
    rows = to_rows(snap.payload, LOCATIONS)
    assert len(rows) == len(LOCATIONS) * 5 * len(snap.payload.root[0].hourly.time)


def test_single_location_object_is_accepted() -> None:
    payload = ProviderPayload.model_validate(make_payload(LOCATIONS[:1])[0])
    assert len(payload.root) == 1


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda d: d["hourly"]["pm10"].pop(), "has 47 values for 48 timestamps"),
        (lambda d: d.update(utc_offset_seconds=10800), "expected UTC"),
        (lambda d: d["hourly_units"].update(pm2_5="ppm"), "unexpected unit for pm2_5"),
        (lambda d: d["hourly"]["time"].reverse(), "not strictly increasing"),
        (lambda d: d["hourly"]["ozone"].__setitem__(3, -1.0), "negative concentration"),
        (lambda d: d["hourly"].pop("european_aqi"), "european_aqi"),
    ],
)
def test_contract_violations_are_rejected(mutate: Any, message: str) -> None:
    doc = make_payload(LOCATIONS[:1])[0]
    mutate(doc)
    with pytest.raises(ValidationError) as info:
        ProviderPayload.model_validate_json(json.dumps(doc))
    assert message in str(info.value)


def test_mapping_rejects_responses_for_other_coordinates() -> None:
    doc = make_payload(LOCATIONS[:2])
    doc[0]["latitude"] = 51.5  # London instead of Tel Aviv
    with pytest.raises(MappingError):
        to_rows(ProviderPayload.model_validate(doc), LOCATIONS[:2])


def test_mapping_keeps_gaps_as_null() -> None:
    doc = make_payload(LOCATIONS[:1], hours=3, value=lambda _i, h: None if h == 1 else 5.0)
    rows = to_rows(ProviderPayload.model_validate(doc), LOCATIONS[:1])
    pm25 = [r for r in rows if r[1] == "pm2_5"]
    assert [r[3] for r in pm25] == [5.0, None, 5.0]


@pytest.mark.parametrize(
    ("value", "band"),
    [
        (None, None),
        (0, "Good"),
        (20, "Good"),
        (20.1, "Fair"),
        (59, "Moderate"),
        (80, "Poor"),
        (100, "Very poor"),
        (140, "Extremely poor"),
    ],
)
def test_eaqi_bands(value: float | None, band: str | None) -> None:
    assert eaqi_band(value) == band
