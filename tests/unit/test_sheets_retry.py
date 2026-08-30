"""
A Sheets call that fails because Google is unwell must be retried, and must
never come back looking like an empty tab.

A 503 on the first call of a Pull used to fall straight through the retry
helper (which only ever recognised 429), get swallowed by `get_all_raw_rows`
into `[]`, and read downstream as "no data found" -- so the tab was skipped and
the whole run still logged Success.
"""

import pytest
from gspread.exceptions import APIError

from app.services.integrations import sheets


class _FakeResponse:
    """
    The bare slice of requests.Response that gspread's APIError reads.

    gspread 5.12.0 keeps the whole response on the error and reads `.json()`
    for the message, falling back to `.text`. `status_code` is therefore the
    only place the HTTP status reliably survives.
    """

    def __init__(self, code, message, parseable=True):
        self.status_code = code
        self.text = f"[{code}]: {message}"
        self._parseable = parseable
        self._payload = {
            "error": {"code": code, "message": message, "status": "ERROR"}
        }

    def json(self):
        if not self._parseable:
            raise ValueError("not JSON")
        return self._payload


def api_error(code, message="boom", parseable=True):
    return APIError(_FakeResponse(code, message, parseable))


@pytest.fixture
def no_sleep(monkeypatch):
    """Record the backoff waits instead of actually serving them."""
    waits = []
    monkeypatch.setattr(sheets.time, "sleep", lambda s: waits.append(s))
    return waits


class _Flaky:
    """Fails `failures` times with `error`, then returns `value`."""

    def __init__(self, failures, error, value="ok"):
        self.remaining = failures
        self.error = error
        self.value = value
        self.calls = 0

    def __call__(self, *args, **kwargs):
        self.calls += 1
        if self.remaining > 0:
            self.remaining -= 1
            raise self.error()
        return self.value


# ---------------------------------------------------------------------------
# Status extraction
# ---------------------------------------------------------------------------
#
# gspread 5.12.0 builds APIError from the raw `requests.Response` and stores
# nothing but `.response`; gspread 6 adds a `.code` attribute. The status must
# come off the response in both, so these tests must not assume either shape.


def test_status_comes_from_the_response():
    assert sheets._status_code(api_error(503)) == 503


def test_status_is_found_even_when_the_body_is_not_json():
    # An HTML 503 from a proxy: gspread falls back to `response.text`, so the
    # parsed error dict is gone, but the response still carries the status.
    error = api_error(503, parseable=False)
    assert sheets._status_code(error) == 503


def test_status_falls_back_to_a_code_attribute():
    # gspread 6 sets `.code`. Nothing here uses it today; this keeps the
    # upgrade from silently turning every retry back off.
    class _Six(Exception):
        code = 429

    assert sheets._status_code(_Six("quota")) == 429


def test_a_negative_code_attribute_is_not_trusted():
    # gspread 6 parks `.code` at -1 when it could not parse the body.
    class _Six(Exception):
        code = -1

    assert sheets._status_code(_Six("[502]: bad gateway")) == 502


def test_status_falls_back_to_the_rendered_message():
    # No response, no code -- only the text. Both shapes gspread renders are
    # read: the bracketed status line and the repr of the parsed error dict.
    assert sheets._status_code(RuntimeError("[503]: unavailable")) == 503
    assert (
        sheets._status_code(
            RuntimeError("{'code': 429, 'message': 'Quota exceeded'}")
        )
        == 429
    )


def test_status_is_none_when_nothing_looks_like_a_code():
    assert sheets._status_code(RuntimeError("something went wrong")) is None


def test_a_stray_three_digit_number_is_not_read_as_a_status():
    # "1975" or a row count must not be mistaken for an HTTP status, or a
    # permanent error would be retried three times before surfacing.
    assert sheets._status_code(RuntimeError("wrote 1975 rows")) is None


# ---------------------------------------------------------------------------
# Retry behaviour
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("code", sheets.TRANSIENT_STATUS_CODES)
def test_a_transient_error_is_retried_and_can_succeed(code, no_sleep):
    flaky = _Flaky(1, lambda: api_error(code))

    assert sheets._execute_with_retry(flaky) == "ok"
    assert flaky.calls == 2
    assert no_sleep == [2]


def test_transient_backoff_grows_and_skips_the_final_wait(no_sleep):
    always = _Flaky(99, lambda: api_error(503))

    with pytest.raises(sheets.SheetsUnavailableError):
        sheets._execute_with_retry(always)

    assert always.calls == 3
    # Two waits for three attempts -- no sleeping after the last one.
    assert no_sleep == [2, 4]


def test_a_quota_error_keeps_its_minute_long_pacing(no_sleep):
    flaky = _Flaky(1, lambda: api_error(429, "Quota exceeded"))

    assert sheets._execute_with_retry(flaky) == "ok"
    assert no_sleep == [60]


def test_a_permanent_error_is_raised_on_the_spot(no_sleep):
    flaky = _Flaky(99, lambda: api_error(403, "The caller does not have permission"))

    with pytest.raises(APIError):
        sheets._execute_with_retry(flaky)

    assert flaky.calls == 1
    assert no_sleep == []


def test_exhausted_retries_raise_rather_than_return_none(no_sleep):
    with pytest.raises(sheets.SheetsUnavailableError, match="Max retries exceeded"):
        sheets._execute_with_retry(_Flaky(99, lambda: api_error(503)))


# ---------------------------------------------------------------------------
# get_all_raw_rows: an outage is not an empty tab
# ---------------------------------------------------------------------------


def test_unreadable_tab_raises_instead_of_reading_as_empty(monkeypatch, no_sleep):
    def boom(tab_name):
        raise api_error(503, "The service is currently unavailable.")

    monkeypatch.setattr(sheets, "get_google_sheet_tab", boom)

    with pytest.raises(sheets.SheetsUnavailableError, match="System Options"):
        sheets.get_all_raw_rows("System Options")


def test_a_genuinely_empty_tab_still_returns_an_empty_list(monkeypatch):
    class _Worksheet:
        def get_all_values(self):
            return []

    monkeypatch.setattr(sheets, "get_google_sheet_tab", lambda tab: _Worksheet())

    assert sheets.get_all_raw_rows("System Options") == []
