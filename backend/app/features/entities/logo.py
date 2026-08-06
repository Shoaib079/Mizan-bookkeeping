"""Restaurant logo validation (MENU_PLAN.md slice 3).

Pure functions, no session and no I/O, so the rules can be tested directly
rather than through an upload.

The format is decided by the bytes, not by what the browser claims. A browser
sends whatever content type the operating system associates with the file
extension, so a `.pdf` renamed to `.png` arrives labelled `image/png`. Trusting
the label means the file is accepted here and fails much later, inside the PDF
builder, on a different screen, with an error about flowables.
"""

from __future__ import annotations

from dataclasses import dataclass

#: reportlab draws PNG and JPEG without Pillow present. Anything else — WEBP,
#: SVG, HEIC — would upload fine and then fail when the menu is generated.
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"

MAX_LOGO_BYTES = 2 * 1024 * 1024


class InvalidLogoError(ValueError):
    """The uploaded file is not a logo this app can print."""


@dataclass(frozen=True, slots=True)
class LogoFormat:
    media_type: str
    extension: str


def sniff_logo_format(content: bytes) -> LogoFormat | None:
    """Identify the image from its leading bytes, or None if unrecognised."""
    if content.startswith(PNG_MAGIC):
        return LogoFormat(media_type="image/png", extension="png")
    if content.startswith(JPEG_MAGIC):
        return LogoFormat(media_type="image/jpeg", extension="jpg")
    return None


def validate_logo(content: bytes) -> LogoFormat:
    """Return the format, or raise with a message worth showing a person."""
    if not content:
        raise InvalidLogoError("The file is empty.")
    if len(content) > MAX_LOGO_BYTES:
        megabytes = MAX_LOGO_BYTES // (1024 * 1024)
        raise InvalidLogoError(
            f"The logo must be smaller than {megabytes} MB."
        )
    fmt = sniff_logo_format(content)
    if fmt is None:
        raise InvalidLogoError("The logo must be a PNG or a JPEG image.")
    return fmt
