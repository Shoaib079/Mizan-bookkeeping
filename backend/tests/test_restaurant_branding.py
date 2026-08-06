"""Restaurant branding — what the menu prints (MENU_PLAN.md slice 3).

The address, phones, email, terms and logo live on the restaurant record so
the menu prints them from the same row as the name. The Word documents this
replaces carried them typed by hand, which is how one location's menu went out
for a year with another location's address on it.

Two things here are worth more than the rest:

- `test_saving_branding_leaves_the_company_profile_alone` and its mirror. The
  two forms edit the same row. If either sent a whole object rather than the
  fields it owns, saving one would quietly blank the other, and nothing would
  raise — the address would simply be gone next time someone looked.
- `test_a_pdf_is_rejected_even_when_it_claims_to_be_a_png`. The browser sends
  whatever content type the OS associates with the extension, so the declared
  type proves nothing.
"""

from __future__ import annotations

import io

from fastapi.testclient import TestClient

from app.features.entities.logo import (
    JPEG_MAGIC,
    MAX_LOGO_BYTES,
    PNG_MAGIC,
    InvalidLogoError,
    sniff_logo_format,
    validate_logo,
)

PNG_BYTES = PNG_MAGIC + b"\x00\x00\x00\rIHDR" + b"\x00" * 32
JPEG_BYTES = JPEG_MAGIC + b"\xe0\x00\x10JFIF" + b"\x00" * 32


def _upload(client: TestClient, entity_id, content: bytes, *, name="logo.png"):
    return client.put(
        f"/entities/{entity_id}/logo",
        files={"file": (name, io.BytesIO(content), "image/png")},
    )


# --- the fields ---------------------------------------------------------


def test_branding_fields_round_trip(restaurant_a, client: TestClient):
    resp = client.patch(
        f"/entities/{restaurant_a.id}",
        json={
            "address": "Divanyolu Cad. No 1, Fatih, İstanbul",
            "phone_primary": "+90 212 000 00 00",
            "phone_secondary": "+90 532 000 00 00",
            "email": "info@indiagate.com.tr",
            "menu_terms": "All prices exclude 10% KDV.\nMinimum 10 guests.",
            "menu_validity_note": "Prices valid until 31 December 2026",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["address"] == "Divanyolu Cad. No 1, Fatih, İstanbul"
    assert body["phone_secondary"] == "+90 532 000 00 00"
    assert body["menu_validity_note"] == "Prices valid until 31 December 2026"

    got = client.get(f"/entities/{restaurant_a.id}").json()
    assert got["menu_terms"].endswith("Minimum 10 guests.")
    assert got["email"] == "info@indiagate.com.tr"


def test_a_new_restaurant_has_no_branding(restaurant_a, client: TestClient):
    body = client.get(f"/entities/{restaurant_a.id}").json()
    assert body["address"] is None
    assert body["phone_primary"] is None
    assert body["menu_terms"] is None
    assert body["has_logo"] is False


def test_an_emptied_field_is_cleared(restaurant_a, client: TestClient):
    """A form posts "" for a field the user emptied — that has to clear it."""
    client.patch(f"/entities/{restaurant_a.id}", json={"address": "Old address"})
    resp = client.patch(f"/entities/{restaurant_a.id}", json={"address": ""})
    assert resp.status_code == 200, resp.text
    assert resp.json()["address"] is None


def test_an_omitted_field_is_left_alone(restaurant_a, client: TestClient):
    client.patch(f"/entities/{restaurant_a.id}", json={"address": "Kept"})
    resp = client.patch(
        f"/entities/{restaurant_a.id}", json={"phone_primary": "+90 212 000 00 00"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["address"] == "Kept"


def test_branding_alone_satisfies_the_at_least_one_field_rule(
    restaurant_a, client: TestClient
):
    """The old check named name, legal_name and vkn explicitly.

    A branding-only PATCH would have been rejected as empty, with a message
    saying at least one field was required — while carrying six.
    """
    resp = client.patch(f"/entities/{restaurant_a.id}", json={"address": "Somewhere"})
    assert resp.status_code == 200, resp.text


def test_saving_branding_leaves_the_company_profile_alone(
    restaurant_a, client: TestClient
):
    before = client.get(f"/entities/{restaurant_a.id}").json()
    client.patch(f"/entities/{restaurant_a.id}", json={"address": "Somewhere"})
    after = client.get(f"/entities/{restaurant_a.id}").json()
    assert after["name"] == before["name"]
    assert after["vkn"] == before["vkn"]
    assert after["legal_name"] == before["legal_name"]


def test_saving_the_company_profile_leaves_branding_alone(
    restaurant_a, client: TestClient
):
    client.patch(f"/entities/{restaurant_a.id}", json={"address": "Somewhere"})
    client.patch(f"/entities/{restaurant_a.id}", json={"name": "India Gate Fatih"})
    after = client.get(f"/entities/{restaurant_a.id}").json()
    assert after["address"] == "Somewhere", "renaming the restaurant wiped its address"


def test_branding_is_per_restaurant(restaurant_a, restaurant_b, client: TestClient):
    """The whole reason the locations are separate records."""
    client.patch(f"/entities/{restaurant_a.id}", json={"address": "Fatih"})
    client.patch(f"/entities/{restaurant_b.id}", json={"address": "Kadıköy"})
    assert client.get(f"/entities/{restaurant_a.id}").json()["address"] == "Fatih"
    assert client.get(f"/entities/{restaurant_b.id}").json()["address"] == "Kadıköy"


def test_an_empty_patch_is_still_rejected(restaurant_a, client: TestClient):
    assert client.patch(f"/entities/{restaurant_a.id}", json={}).status_code == 422


# --- the logo -----------------------------------------------------------


def test_a_logo_can_be_uploaded_and_read_back(restaurant_a, client: TestClient):
    resp = _upload(client, restaurant_a.id, PNG_BYTES)
    assert resp.status_code == 200, resp.text
    assert resp.json()["has_logo"] is True

    got = client.get(f"/entities/{restaurant_a.id}/logo")
    assert got.status_code == 200
    assert got.content == PNG_BYTES
    assert got.headers["content-type"].startswith("image/png")


def test_the_media_type_follows_the_bytes_not_the_upload_label(
    restaurant_a, client: TestClient
):
    """A JPEG posted as image/png comes back as image/jpeg.

    It is still a valid logo — only the label was wrong — so it is accepted,
    but stored under what it actually is. Serving a JPEG as image/png is how a
    logo renders in one PDF viewer and not another.
    """
    resp = _upload(client, restaurant_a.id, JPEG_BYTES, name="logo.png")
    assert resp.status_code == 200, resp.text
    got = client.get(f"/entities/{restaurant_a.id}/logo")
    assert got.headers["content-type"].startswith("image/jpeg")


def test_a_pdf_is_rejected_even_when_it_claims_to_be_a_png(
    restaurant_a, client: TestClient
):
    resp = _upload(client, restaurant_a.id, b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    assert resp.status_code == 422, resp.text
    assert "PNG or a JPEG" in resp.json()["detail"]
    assert client.get(f"/entities/{restaurant_a.id}").json()["has_logo"] is False


def test_an_empty_file_is_rejected(restaurant_a, client: TestClient):
    assert _upload(client, restaurant_a.id, b"").status_code == 422


def test_uploading_a_second_logo_replaces_the_first(restaurant_a, client: TestClient):
    _upload(client, restaurant_a.id, PNG_BYTES)
    _upload(client, restaurant_a.id, JPEG_BYTES, name="new.jpg")
    got = client.get(f"/entities/{restaurant_a.id}/logo")
    assert got.content == JPEG_BYTES


def test_a_logo_can_be_removed(restaurant_a, client: TestClient):
    _upload(client, restaurant_a.id, PNG_BYTES)
    resp = client.delete(f"/entities/{restaurant_a.id}/logo")
    assert resp.status_code == 200, resp.text
    assert resp.json()["has_logo"] is False
    assert client.get(f"/entities/{restaurant_a.id}/logo").status_code == 404


def test_asking_for_a_logo_that_was_never_uploaded_is_a_404(
    restaurant_a, client: TestClient
):
    assert client.get(f"/entities/{restaurant_a.id}/logo").status_code == 404


def test_one_restaurants_logo_is_not_anothers(
    restaurant_a, restaurant_b, client: TestClient
):
    _upload(client, restaurant_a.id, PNG_BYTES)
    assert client.get(f"/entities/{restaurant_b.id}").json()["has_logo"] is False
    assert client.get(f"/entities/{restaurant_b.id}/logo").status_code == 404


def test_the_stored_path_is_never_sent_to_the_browser(
    restaurant_a, client: TestClient
):
    """It is an R2 key or a disk location — of no use to a client, and not
    something to publish."""
    _upload(client, restaurant_a.id, PNG_BYTES)
    body = client.get(f"/entities/{restaurant_a.id}").json()
    assert "logo_stored_path" not in body
    assert "logo_media_type" not in body


# --- the validation rules, directly -------------------------------------


def test_sniff_recognises_png_and_jpeg():
    assert sniff_logo_format(PNG_BYTES).media_type == "image/png"
    assert sniff_logo_format(JPEG_BYTES).media_type == "image/jpeg"
    assert sniff_logo_format(b"GIF89a") is None


def test_an_oversized_logo_is_rejected():
    try:
        validate_logo(PNG_BYTES + b"\x00" * MAX_LOGO_BYTES)
    except InvalidLogoError as exc:
        assert "2 MB" in str(exc)
    else:  # pragma: no cover - the assertion below is the point
        raise AssertionError("an oversized logo was accepted")


def test_the_extension_matches_the_format():
    assert validate_logo(PNG_BYTES).extension == "png"
    assert validate_logo(JPEG_BYTES).extension == "jpg"
