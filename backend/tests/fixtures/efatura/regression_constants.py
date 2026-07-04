"""Constants for e-Fatura regression PDF fixtures.

The buyer VKN below is printed on the scanned fixture PDFs (customer block), not
application config. Any entity with that VKN on profile would parse the same way.
"""

from datetime import date

REGRESSION_FIXTURE_BUYER_VKN = "7342656849"

TURKTELEKOM_OIV_55 = {
    "invoice_number": "A162026001298705",
    "invoice_date": date(2026, 2, 28),
    "supplier_vkn": "8590491872",
    "net_kurus": 66077,
    "vat_breakdown": [{"rate_percent": 20, "base_kurus": 66077, "vat_kurus": 13215}],
    "other_taxes_kurus": 6608,
    "gross_kurus": 85900,
    "buyer_vkn_excluded": REGRESSION_FIXTURE_BUYER_VKN,
}
