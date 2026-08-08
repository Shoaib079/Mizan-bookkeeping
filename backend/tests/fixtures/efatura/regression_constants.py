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


#: TT Mobil — the invoice that posted itself six weeks into the future.
#:
#: Two separate misreads in one document, both silent:
#:
#: 1. The date. "Bir Sonraki Son Ödeme Fatura Tarihi: 16/09/2026" was taken
#:    as the invoice date. The guard that skips "Bir Sonraki Fatura Tarihi"
#:    looked back a fixed 24 characters for "Sonraki"; the words "Son Ödeme"
#:    push it out of reach. The real date, 31-07-2026, appears *later* in the
#:    file, and the scan takes the first label it accepts.
#:
#: 2. The tax. This layout writes "KDV (20%) (Matrah 929.13 TL )" with the
#:    amount on the next line; the reader only knew "KDV %20 (Matrah 929,13)
#:    132,15". Both tax patterns missed, so it fell back to assuming one 20%
#:    line for everything between net and gross — calling 585,75 VAT when the
#:    document says 185,83. The other 400 lira are Özel İletişim Vergisi and a
#:    radio licence fee, neither reclaimable.
#:
#: net + vat + other = 122576 + 18583 + 9291 = 150450, the printed total.
TTMOBIL_NEXT_DUE_DATE_62 = {
    "invoice_number": "GB32026007708382",
    "invoice_date": date(2026, 7, 31),
    "supplier_vkn": "8590380323",
    "net_kurus": 122576,
    "vat_breakdown": [{"rate_percent": 20, "base_kurus": 92913, "vat_kurus": 18583}],
    "other_taxes_kurus": 9291,
    "gross_kurus": 150450,
}
