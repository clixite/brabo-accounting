"""Tests for the full-text nature classification (suggest)."""

from app.suggest import PCMN_ACCOUNTS, suggest


def classify(supplier="", raw_text="", fields=None):
    f = {"supplierName": {"value": supplier}, "invoiceNumber": {"value": "X-1"}}
    if fields:
        f.update(fields)
    return suggest(f, raw_text)


def test_energy_from_supplier_brand():
    r = classify(supplier="TotalEnergies BE", raw_text="Electricity invoice")
    assert r["pcmnAccount"] == "612000"
    assert r["deductibilityRate"] == 100


def test_telecom_from_nature():
    r = classify(supplier="Proximus SA", raw_text="abonnement fibre internet")
    assert r["pcmnAccount"] == "616100"


def test_software_saas():
    r = classify(supplier="AWS EMEA", raw_text="cloud hosting server usage")
    assert r["pcmnAccount"] == "616200"


def test_fuel_classified_as_car():
    r = classify(supplier="", raw_text="Diesel station service 45L")
    assert r["pcmnAccount"] == "614100"
    assert r["deductibilityRate"] == 75
    assert r["deductibleVatRate"] == 50


def test_restaurant_vat_not_recoverable():
    r = classify(supplier="Brasserie Les Brigittines", raw_text="repas de travail")
    assert r["pcmnAccount"] == "615100"
    assert r["deductibilityRate"] == 50
    assert r["deductibleVatRate"] == 0


def test_investment_hardware():
    r = classify(supplier="Dell", raw_text="laptop XPS 15")
    assert r["pcmnAccount"] == "240000"
    assert r["isInvestment"] is True


def test_legal_honoraries():
    r = classify(supplier="Avocat Dupont", raw_text="honoraires juridiques")
    assert r["pcmnAccount"] == "613200"


def test_defaults_to_general():
    r = classify(supplier="Acme", raw_text="some generic service")
    assert r["pcmnAccount"] == "611000"


def test_zero_vat_unclassified_falls_back_to_financial():
    r = classify(supplier="Acme", raw_text="misc", fields={"vatRate": {"value": 0}})
    assert r["pcmnAccount"] == "650000"


def test_all_accounts_have_required_fields():
    for code, acc in PCMN_ACCOUNTS.items():
        assert "category" in acc and "label" in acc and "deduct" in acc and "vat" in acc, code
