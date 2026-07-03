"""Turkish tax id checksum — VKN (10 digits) and TCKN (11 digits)."""

from __future__ import annotations

import re

_VKN_RE = re.compile(r"^\d{10}$")
_TCKN_RE = re.compile(r"^\d{11}$")


def is_valid_vkn(value: str) -> bool:
    """Validate Vergi Kimlik Numarası (10-digit company tax id)."""
    cleaned = value.strip()
    if not _VKN_RE.match(cleaned):
        return False
    digits = [int(ch) for ch in cleaned]
    total = 0
    for index in range(9):
        tmp = (digits[index] + (9 - index)) % 10
        if tmp == 0:
            continue
        product = (tmp * (2 ** (9 - index))) % 9
        if product == 0:
            product = 9
        total += product
    check = (10 - (total % 10)) % 10
    return digits[9] == check


def is_valid_tckn(value: str) -> bool:
    """Validate TC Kimlik Numarası (11-digit personal id)."""
    cleaned = value.strip()
    if not _TCKN_RE.match(cleaned) or cleaned[0] == "0":
        return False
    digits = [int(ch) for ch in cleaned]
    tenth = (sum(digits[0:9:2]) * 7 - sum(digits[1:8:2])) % 10
    if digits[9] != tenth:
        return False
    return digits[10] == sum(digits[0:10]) % 10


def is_valid_vkn_or_tckn(value: str) -> bool:
    """Accept a valid 10-digit VKN or 11-digit TCKN."""
    cleaned = value.strip()
    if len(cleaned) == 10:
        return is_valid_vkn(cleaned)
    if len(cleaned) == 11:
        return is_valid_tckn(cleaned)
    return False
