"""Tests for the multilingual (FR/NL/EN) invoice field parser."""

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
    line("Communication structurée +++123/4567/89012+++", 270),
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
    assert vals["structuredCommunication"] == "+++123/4567/89012+++"
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
    line("Mededeling: +++123/4567/89012+++", 390),
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
    assert vals["structuredCommunication"] == "+++123/4567/89012+++"

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
