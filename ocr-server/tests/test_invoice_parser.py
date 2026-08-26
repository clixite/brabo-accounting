"""Tests for the multilingual (FR/NL/EN) invoice field parser."""

import pytest

from app.invoice_parser import OcrLine, parse_invoice


def line(text, y, x=100, w=600, h=14, score=0.95, page=0):
    return OcrLine(text=text, score=score, x=x, y=y, w=w, h=h, page=page)


def values(result):
    return {k: v["value"] for k, v in result["fields"].items()}


# ---------------------------------------------------------------------------
# French invoice (Proximus-style)
# ---------------------------------------------------------------------------

FR_LINES = [
    line("Proximus SA", 40),
    line("Avenue du Roi Albert II 27", 70),
    line("1030 Schaerbeek, Belgique", 90),
    line("TVA BE 0202.239.951", 110),
    line("Facture N° PROX-2026-9912", 150),
    line("Date de la facture: 12/02/2026", 170),
    line("Échéance: 14/03/2026", 190),
    line("Client: BRABO SPRL", 210),
    line("Rue de la Loi 155, 1040 Bruxelles", 230),
    line("IBAN BE68 5390 0754 7034", 250),
    line("Communication structurée +++000/0001/23470+++", 270),
    line("Fibre Pro Bizz 1 Gbps ................. 145,00", 310),
    line("Pack Mobile 5G ........................ 100,00", 330),
    line("Sous-total HTVA ....................... 245,00", 350),
    line("TVA 21% ............................... 51,45", 370),
    line("Total TVAC à payer ..................... 296,45", 390),
]


def test_french_invoice_full_extraction():
    result = parse_invoice(FR_LINES)
    vals = values(result)

    assert vals["supplierName"] == "Proximus SA"
    assert vals["supplierBce"] == "BE 0202.239.951"
    assert vals["supplierVat"] == "BE0202239951"
    assert vals["invoiceNumber"] == "PROX-2026-9912"
    assert vals["invoiceDate"] == "2026-02-12"
    assert vals["dueDate"] == "2026-03-14"
    assert vals["iban"] == "BE68539007547034"
    assert vals["structuredCommunication"] == "+++000/0001/23470+++"
    assert vals["totalExclVat"] == 245.00
    assert vals["vatRate"] == 21
    assert vals["vatAmount"] == 51.45
    assert vals["totalInclVat"] == 296.45

    assert result["warnings"] == [], result["warnings"]


def test_french_invoice_confidences():
    result = parse_invoice(FR_LINES)
    for field in ("supplierName", "supplierBce", "invoiceNumber", "totalInclVat"):
        assert 0.5 <= result["fields"][field]["confidence"] <= 1.0


# ---------------------------------------------------------------------------
# Dutch invoice (Telenet-style)
# ---------------------------------------------------------------------------

NL_LINES = [
    line("Telenet BV", 40),
    line("Liersesteenweg 4", 70),
    line("2800 Mechelen", 90),
    line("BTW BE 0403.448.140", 110),
    line("Factuurnummer: TN-2026-04812", 150),
    line("Factuurdatum: 05/01/2026", 170),
    line("Vervaldatum: 04/02/2026", 190),
    line("Internet Fiber 1G + TV ................. 89,99", 310),
    line("Totaal excl. btw ....................... 89,99", 330),
    line("BTW 21% ................................ 18,90", 350),
    line("Totaal incl. btw ....................... 108,89", 370),
    line("Mededeling: +++000/0001/23470+++", 390),
]


def test_dutch_invoice_full_extraction():
    result = parse_invoice(NL_LINES)
    vals = values(result)

    assert vals["supplierName"] == "Telenet BV"
    assert vals["supplierBce"] == "BE 0403.448.140"
    assert vals["invoiceNumber"] == "TN-2026-04812"
    assert vals["invoiceDate"] == "2026-01-05"
    assert vals["dueDate"] == "2026-02-04"
    assert vals["totalExclVat"] == 89.99
    assert vals["vatRate"] == 21
    assert vals["vatAmount"] == 18.90
    assert vals["totalInclVat"] == 108.89
    assert vals["structuredCommunication"] == "+++000/0001/23470+++"

    assert result["warnings"] == [], result["warnings"]


# ---------------------------------------------------------------------------
# English invoice
# ---------------------------------------------------------------------------

EN_LINES = [
    line("Acme Europe Ltd", 40),
    line("22 Baker Street, London", 70),
    line("VAT Number: FR12345678901", 100),
    line("Invoice No: INV-2026-00042", 150),
    line("Invoice date: 2026-02-01", 170),
    line("Due date: 2026-03-03", 190),
    line("Consulting services (21% VAT)", 300),
    line("Subtotal (excl. VAT) ................ 1.000,00", 320),
    line("VAT 21% ............................. 210,00", 340),
    line("Total to pay ........................ 1.210,00", 360),
]


def test_english_invoice():
    result = parse_invoice(EN_LINES)
    vals = values(result)

    assert vals["supplierName"] == "Acme Europe Ltd"
    assert vals["supplierVat"] == "FR12345678901"
    assert vals["invoiceNumber"] == "INV-2026-00042"
    assert vals["invoiceDate"] == "2026-02-01"
    assert vals["dueDate"] == "2026-03-03"
    assert vals["totalExclVat"] == 1000.00
    assert vals["vatRate"] == 21
    assert vals["vatAmount"] == 210.00
    assert vals["totalInclVat"] == 1210.00

    assert result["warnings"] == [], result["warnings"]


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_no_lines_yields_warning():
    result = parse_invoice([])
    assert result["fields"] == {}
    assert any("vide" in w for w in result["warnings"])


def test_receipt_without_vat_number():
    """A small receipt: no VAT number, no totals — should still find a date and amounts."""
    lines = [
        line("Brasserie Les Brigittines", 40),
        line("Rue de la Régence 63", 70),
        line("1000 Bruxelles", 90),
        line("12/02/2026 14:32", 110),
        line("Dame Blanche ......................... 8,50", 300),
        line("Café ................................. 3,00", 320),
        line("TOTAL ................................ 11,50", 340),
    ]
    result = parse_invoice(lines)
    vals = values(result)

    assert vals["supplierName"] == "Brasserie Les Brigittines"
    assert vals["invoiceDate"] == "2026-02-12"
    # "TOTAL" alone matches KW_TOTAL_INCL ("total" bare alternative).
    assert vals.get("totalInclVat") == 11.50
    assert "supplierBce" not in vals


def test_misread_vat_number_warns():
    lines = [
        line("Fake Supplier SPRL", 40),
        line("TVA BE 0123.456.789", 110),  # invalid modulo 97
        line("Total TVAC 100,00", 200),
    ]
    result = parse_invoice(lines)
    assert any("invalide" in w for w in result["warnings"])
    assert "supplierBce" not in values(result)


def test_amount_consistency_warning():
    lines = [
        line("Supplier SA", 40),
        line("TVA BE 0477.472.701", 110),
        line("Sous-total HTVA 100,00", 300),
        line("TVA 21% 10,00", 320),
        line("Total TVAC 130,00", 340),  # 100 + 10 != 130
    ]
    result = parse_invoice(lines)
    assert any("≠" in w for w in result["warnings"])


def test_payment_terms_detected():
    lines = [
        line("Supplier NV", 40),
        line("TVA BE 0477.472.701", 110),
        line("Paiement à 30 jours", 200),
        line("Total TVAC 50,00", 300),
    ]
    result = parse_invoice(lines)
    assert values(result).get("paymentTermsDays") == 30


def test_dotted_leaders_split_amounts():
    """OCR often splits '<label> ...... 245,00' into two lines: keep the totals."""
    lines = [
        line("Proximus SA", 40),
        line("TVA BE 0202.239.951", 110),
        line("Sous-total HTVA ..............", 350),
        line("245,00", 366),  # the amount, on its own line right below
        line("TVA 21% ......................", 390),
        line("51,45", 406),
        line("Total TVAC à payer ............", 430),
        line("296,45", 446),
    ]
    result = parse_invoice(lines)
    vals = values(result)

    assert vals["totalExclVat"] == 245.00
    assert vals["vatAmount"] == 51.45
    assert vals["totalInclVat"] == 296.45
    assert vals["vatRate"] == 21
    assert result["warnings"] == [], result["warnings"]


def test_vat_header_line_does_not_steal_from_invoice_number_line():
    """Regression: 'TVA BE 0202.239.951' must not grab '2026-9912' below it."""
    lines = [
        line("Proximus SA", 40, h=30),
        line("TVA BE 0202.239.951", 110, h=30),
        line("Facture N° PROX-2026-9912", 150, h=30),
        line("Sous-total HTVA 245,00", 350, h=30),
        line("TVA 21% 51,45", 370, h=30),
        line("Total TVAC à payer 296,45", 390, h=30),
    ]
    result = parse_invoice(lines)
    vals = values(result)

    assert vals["vatAmount"] == 51.45
    assert vals["totalInclVat"] == 296.45
    assert vals["invoiceNumber"] == "PROX-2026-9912"
    assert result["warnings"] == [], result["warnings"]


def test_merged_vat_keyword_without_space():
    """OCR often merges 'TVA 21%' into 'TVA21%' — the keyword must still match."""
    lines = [
        line("Proximus SA", 40),
        line("TVA BE 0202.239.951", 110),
        line("Sous-total HTVA 245,00", 350),
        line("TVA21% 51,45", 370),
        line("Total TVAC à payer 296,45", 390),
    ]
    result = parse_invoice(lines)
    vals = values(result)

    assert vals["vatAmount"] == 51.45
    assert vals["vatRate"] == 21
    assert vals["totalInclVat"] == 296.45


def test_invoice_number_strips_leading_symbols():
    """OCR artifacts ('°PROX-2026-9912') must not pollute the invoice number."""
    lines = [
        line("Proximus SA", 40),
        line("Facture N° °PROX-2026-9912", 150),
        line("Total TVAC à payer 296,45", 390),
    ]
    result = parse_invoice(lines)
    assert values(result)["invoiceNumber"] == "PROX-2026-9912"


def test_supplier_skips_disclaimer_and_prefers_real_company():
    """'provided by … GmbH' is a label — pick the actual supplier line above it."""
    lines = [
        line("Digital Charging Solutions GmbH", 40, h=30),
        line("provided by Digital Charging Solutions GmbH", 80, h=14),
        line("BE 8786.846.477", 110),
        line("Invoice number: DC-2025-1234", 150),
        line("Total to pay 45,00", 300),
    ]
    result = parse_invoice(lines)
    vals = values(result)
    assert vals["supplierName"] == "Digital Charging Solutions GmbH"
    assert vals["invoiceNumber"] == "DC-2025-1234"


def test_supplier_strips_disclaimer_prefix_when_it_is_the_only_name():
    """When the only company line is a disclaimer, the prefix must be stripped."""
    lines = [
        line("provided by Digital Charging Solutions GmbH", 40, h=24),
        line("BE 8786.846.477", 110),
        line("Total to pay 45,00", 300),
    ]
    result = parse_invoice(lines)
    assert values(result)["supplierName"] == "Digital Charging Solutions GmbH"


def test_invoice_number_rejects_label_words():
    """'fiscal' is a label, not a reference; a coded reference is accepted."""
    lines = [
        line("Supplier NV", 40),
        line("BE 0477.472.701", 110),
        line("Reference: fiscal", 150),
        line("Invoice no. DC-2025-1234", 170),
        line("Total to pay 45,00", 300),
    ]
    vals = values(parse_invoice(lines))
    assert vals["invoiceNumber"] == "DC-2025-1234"


def test_supplier_prefers_larger_font_legal_form():
    """The company name uses the largest font and a legal form."""
    lines = [
        line("TOTALENERGIES MARKETING BELGIUM NV", 40, h=34),
        line("Chaussée de Charleroi 112, 1060 Bruxelles", 70, h=14),
        line("BE 0403.448.140", 100),
        line("Facture N° TE-2025-0789", 150),
        line("Total TVAC 50,00", 300),
    ]
    vals = values(parse_invoice(lines))
    assert vals["supplierName"] == "TOTALENERGIES MARKETING BELGIUM NV"


def test_total_accentuated_and_merged_payer():
    """'Total à payer' (accent) and 'Totalpayer' (merged) must both be totals."""
    lines = [
        line("Supplier NV", 40),
        line("BE 0477.472.701", 110),
        line("Sous-total HTVA 37,19", 300),
        line("TVA 21% 7,81", 320),
        line("Total à payer 45,00", 340),
    ]
    vals = values(parse_invoice(lines))
    assert vals["totalInclVat"] == 45.00
    assert vals["vatAmount"] == 7.81

    merged = [
        line("Supplier NV", 40),
        line("BE 0477.472.701", 110),
        line("Sous-total HTVA 37,19", 300),
        line("TVA 21% 7,81", 320),
        line("Totalpayer 45,00", 340),
    ]
    vals2 = values(parse_invoice(merged))
    assert vals2["totalInclVat"] == 45.00


def test_cross_derives_missing_amounts():
    """Given only TVAC + rate, HTVA and TVA must be derived coherently."""
    lines = [
        line("Supplier NV", 40),
        line("BE 0477.472.701", 110),
        line("TVA 21%", 300),
        line("Total à payer 121,00", 340),
    ]
    vals = values(parse_invoice(lines))
    assert vals["totalInclVat"] == 121.00
    assert vals["vatRate"] == 21
    assert vals["totalExclVat"] == pytest.approx(100.0, abs=0.02)
    assert vals["vatAmount"] == pytest.approx(21.0, abs=0.02)


def test_grand_total_by_position_fallback():
    """No recognized label: the largest bottom amount is the grand total."""
    lines = [
        line("Supplier NV", 40),
        line("BE 0477.472.701", 110),
        line("item line .................. 12,50", 300),
        line("another .................... 25,00", 330),
        line("129,99", 500),  # bottom-right total, no keyword
    ]
    vals = values(parse_invoice(lines))
    assert vals["totalInclVat"] == 129.99
    assert any("position" in w for w in parse_invoice(lines)["warnings"])
