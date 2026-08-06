"""The menu PDF (MENU_PLAN.md slice 4).

Every assertion here reads the generated PDF back and looks for the text. A
test that only checks the bytes start with `%PDF` passes just as happily on a
document with no prices on it, which is the one failure that actually costs
something: a price list is either right or it should not have been sent.

The layout split — `document.py` holds plain dataclasses, `menu_pdf.py` turns
them into a page — is what makes this possible without a database.
"""

from __future__ import annotations

import struct
import zlib

from fastapi.testclient import TestClient

from app.features.menu.document import (
    MenuBlock,
    MenuCategoryGroup,
    MenuDishLine,
    MenuDocument,
    RestaurantIdentity,
)
from app.features.menu.menu_pdf import build_menu_pdf, menu_pdf_filename


def pdf_text(data: bytes) -> str:
    """Every page's text, joined. Uses pymupdf, already a dependency."""
    import fitz

    with fitz.open(stream=data, filetype="pdf") as doc:
        return "\n".join(page.get_text() for page in doc)


def pdf_page_count(data: bytes) -> int:
    import fitz

    with fitz.open(stream=data, filetype="pdf") as doc:
        return len(doc)


def a_png(width: int = 4, height: int = 4) -> bytes:
    """A real, decodable PNG.

    Built here rather than committed as a fixture so the test states what it
    is relying on: reportlab draws PNG through Pillow, which arrives as a
    reportlab dependency rather than one this project declares. If that ever
    changes, `test_a_logo_is_drawn_into_the_document` is what notices.
    """

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    rows = b"".join(b"\x00" + b"\xc8\x96\x32" * width for _ in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(rows))
        + chunk(b"IEND", b"")
    )


def a_document(**overrides) -> MenuDocument:
    restaurant = RestaurantIdentity(
        **{
            "name": "India Gate Restaurant",
            "address": "Divanyolu Cad. No 1, Fatih",
            "phone_primary": "+90 212 000 00 00",
            "email": "info@indiagate.com.tr",
            "terms": "All prices exclude 10% KDV.\nMinimum 10 guests.",
            "validity_note": "Prices valid until 31 December 2026",
            **overrides,
        }
    )
    return MenuDocument(
        restaurant=restaurant,
        groups=[
            MenuCategoryGroup(
                "Vegetarian menus",
                [
                    MenuBlock(
                        name="Veg Menu 1",
                        price_minor=1500,
                        currency="USD",
                        dishes=[
                            MenuDishLine(
                                name="Dal Tadka",
                                description="Yellow lentils tempered with cumin",
                                description_tr="Kimyonla kavrulmuş sarı mercimek",
                            ),
                            MenuDishLine(name="Mix Veg Curry", note="or similar"),
                        ],
                    )
                ],
            )
        ],
    )


# --- what has to be on the page -----------------------------------------


def test_the_prices_are_on_the_page():
    text = pdf_text(build_menu_pdf(a_document()))
    assert "Veg Menu 1" in text
    assert "$15.00" in text
    assert "+KDV" in text


def test_the_dishes_are_on_the_page():
    text = pdf_text(build_menu_pdf(a_document()))
    assert "Dal Tadka" in text
    assert "Yellow lentils tempered with cumin" in text


def test_a_turkish_description_survives_the_font():
    """The reason DejaVu Sans is bundled at all.

    A server with no system fonts renders `ş` and `ı` as blank boxes with the
    built-in Helvetica, and nothing raises — the PDF is simply wrong.
    """
    text = pdf_text(build_menu_pdf(a_document()))
    assert "Kimyonla kavrulmuş sarı mercimek" in text


def test_a_note_prints_beside_its_dish_not_instead_of_it():
    text = pdf_text(build_menu_pdf(a_document()))
    assert "Mix Veg Curry (or similar)" in text


def test_the_terms_and_contacts_print():
    text = pdf_text(build_menu_pdf(a_document()))
    assert "Terms and conditions" in text
    assert "Minimum 10 guests." in text
    assert "Divanyolu Cad. No 1, Fatih" in text
    assert "info@indiagate.com.tr" in text
    assert "Prices valid until 31 December 2026" in text


def test_the_category_headings_print():
    assert "Vegetarian menus" in pdf_text(build_menu_pdf(a_document()))


# --- whose document this is ---------------------------------------------


def test_the_document_carries_no_mizan_branding():
    """The financial exports sign themselves "Mizan · Page 2" — this must not.

    The reader is a tour agency. A bookkeeping app's name on a restaurant's
    price list invites a question nobody wants to answer.
    """
    text = pdf_text(build_menu_pdf(a_document()))
    assert "Mizan" not in text


def test_the_footer_carries_the_restaurant_name():
    assert "India Gate Restaurant" in pdf_text(build_menu_pdf(a_document()))


# --- the logo -----------------------------------------------------------


def test_a_logo_is_drawn_into_the_document():
    import fitz

    data = build_menu_pdf(a_document(logo=a_png()))
    with fitz.open(stream=data, filetype="pdf") as doc:
        images = [img for page in doc for img in page.get_images(full=True)]
    assert images, "the logo was not embedded in the PDF"


def test_the_restaurant_name_is_set_when_there_is_no_logo():
    """A document has to say whose it is one way or the other."""
    text = pdf_text(build_menu_pdf(a_document(logo=None)))
    assert text.count("India Gate Restaurant") >= 2  # title block and footer


def test_an_unreadable_logo_does_not_take_the_prices_down():
    """A corrupt image must not stop someone sending their prices."""
    data = build_menu_pdf(a_document(logo=b"\x89PNG\r\n\x1a\ntruncated"))
    assert "$15.00" in pdf_text(data)


# --- shapes that used to break the page ---------------------------------


def test_a_menu_with_no_price_prints_its_dishes_and_no_figure():
    """Not `$0.00` — nobody meant to quote that."""
    document = MenuDocument(
        restaurant=RestaurantIdentity(name="Test"),
        groups=[
            MenuCategoryGroup(
                "Vegetarian menus",
                [MenuBlock(name="Veg Menu 1", dishes=[MenuDishLine(name="Dal Tadka")])],
            )
        ],
    )
    text = pdf_text(build_menu_pdf(document))
    assert "Dal Tadka" in text
    assert "$0.00" not in text


def test_a_surcharge_prints_with_its_label():
    document = MenuDocument(
        restaurant=RestaurantIdentity(name="Test"),
        groups=[
            MenuCategoryGroup(
                "Catering",
                [
                    MenuBlock(
                        name="Catering Menu",
                        price_minor=2700,
                        surcharge_minor=200,
                        surcharge_label="catering charges",
                        dishes=[MenuDishLine(name="Biryani")],
                    )
                ],
            )
        ],
    )
    text = pdf_text(build_menu_pdf(document))
    assert "$27.00" in text
    assert "$2.00" in text
    assert "catering charges" in text


def test_an_ampersand_in_a_dish_name_does_not_break_the_build():
    """`Paragraph` parses a small HTML dialect; `&` and `<` are markup to it."""
    document = MenuDocument(
        restaurant=RestaurantIdentity(name="Test"),
        groups=[
            MenuCategoryGroup(
                "Special menus",
                [
                    MenuBlock(
                        name="Fish & Chips <Special>",
                        dishes=[MenuDishLine(name="Cod & Peas")],
                    )
                ],
            )
        ],
    )
    text = pdf_text(build_menu_pdf(document))
    assert "Fish & Chips <Special>" in text
    assert "Cod & Peas" in text


def test_a_restaurant_with_nothing_filled_in_still_produces_a_document():
    document = MenuDocument(
        restaurant=RestaurantIdentity(name="Test"),
        groups=[
            MenuCategoryGroup(
                "Vegetarian menus",
                [MenuBlock(name="Veg Menu 1", dishes=[MenuDishLine(name="Dal Tadka")])],
            )
        ],
    )
    assert pdf_page_count(build_menu_pdf(document)) >= 1


def test_the_filename_names_the_restaurant():
    name = menu_pdf_filename("India Gate Restaurant")
    assert name.endswith(".pdf")
    assert "india-gate" in name.lower()


# --- the route ----------------------------------------------------------


def _menu_with_a_dish(client: TestClient, entity_id) -> None:
    dish = client.post(
        f"/entities/{entity_id}/dishes", json={"name": "Dal Tadka"}
    ).json()
    menu = client.post(
        f"/entities/{entity_id}/group-menus",
        json={"name": "Veg Menu 1", "price_minor": 1500, "currency": "USD"},
    ).json()
    client.put(
        f"/entities/{entity_id}/group-menus/{menu['id']}/lines",
        json=[{"dish_id": dish["id"]}],
    )


def test_the_export_route_returns_a_pdf(restaurant_a, client: TestClient):
    _menu_with_a_dish(client, restaurant_a.id)
    resp = client.get(f"/entities/{restaurant_a.id}/group-menus/export.pdf")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    text = pdf_text(resp.content)
    assert "Veg Menu 1" in text
    assert "Dal Tadka" in text
    assert "$15.00" in text


def test_export_pdf_is_not_read_as_a_menu_id(restaurant_a, client: TestClient):
    """Route order: registered after `/group-menus/{menu_id}`, FastAPI reads
    `export.pdf` as a UUID, fails, and returns 422 — a broken download whose
    error message is about the wrong thing entirely."""
    _menu_with_a_dish(client, restaurant_a.id)
    resp = client.get(f"/entities/{restaurant_a.id}/group-menus/export.pdf")
    assert resp.status_code == 200, (
        "export.pdf was matched as a menu id — move the route above "
        "/group-menus/{menu_id}"
    )
    assert resp.headers["content-type"] == "application/pdf"


def test_a_restaurant_with_no_menus_gets_a_reason_not_an_empty_pdf(
    restaurant_a, client: TestClient
):
    resp = client.get(f"/entities/{restaurant_a.id}/group-menus/export.pdf")
    assert resp.status_code == 422, resp.text
    assert "no active menus" in resp.json()["detail"]


def test_a_retired_menu_is_not_printed(restaurant_a, client: TestClient):
    """A retired menu's prices are no longer being offered, and the point of
    sending a PDF is that the figures on it are the ones you stand behind."""
    _menu_with_a_dish(client, restaurant_a.id)
    menus = client.get(f"/entities/{restaurant_a.id}/group-menus").json()["items"]
    client.patch(
        f"/entities/{restaurant_a.id}/group-menus/{menus[0]['id']}",
        json={"is_active": False},
    )
    resp = client.get(f"/entities/{restaurant_a.id}/group-menus/export.pdf")
    assert resp.status_code == 422, "a retired menu was still printed"


def test_the_export_prints_this_restaurants_menus_only(
    restaurant_a, restaurant_b, client: TestClient
):
    _menu_with_a_dish(client, restaurant_a.id)
    dish_b = client.post(
        f"/entities/{restaurant_b.id}/dishes", json={"name": "Butter Chicken"}
    ).json()
    menu_b = client.post(
        f"/entities/{restaurant_b.id}/group-menus",
        json={"name": "Non-Veg Menu 1", "price_minor": 1800, "currency": "USD"},
    ).json()
    client.put(
        f"/entities/{restaurant_b.id}/group-menus/{menu_b['id']}/lines",
        json=[{"dish_id": dish_b["id"]}],
    )

    text = pdf_text(
        client.get(f"/entities/{restaurant_a.id}/group-menus/export.pdf").content
    )
    assert "Dal Tadka" in text
    assert "Butter Chicken" not in text, "another restaurant's dish printed"
