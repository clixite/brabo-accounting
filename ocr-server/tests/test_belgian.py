"""Tests for the Belgian number rules (BCE modulo 97, OGM)."""

from app.belgian import (
    clean_digits,
    format_bce,
    format_ogm,
    format_vat,
    validate_bce,
    validate_ogm,
)


def test_validate_bce_valid_examples():
    for raw, digits in [
        ("BE 0477.472.701", "0477472701"),
        ("BE0202239951", "0202239951"),
        ("BE 0403.448.140", "0403448140"),
        ("0202.239.951", "0202239951"),
    ]:
        result = validate_bce(raw)
        assert result["is_valid"] is True, f"{raw}: {result}"
        assert result["clean"] == digits
        assert result["formatted"].startswith("BE ")


def test_validate_bce_invalid():
    result = validate_bce("BE 0123.456.789")  # wrong check digits
    assert result["is_valid"] is False
    assert "modulo 97" in result["error"].lower() or "97" in result["error"]

    result = validate_bce("12345")
    assert result["is_valid"] is False
    assert "Longueur" in result["error"]


def test_validate_bce_legacy_nine_digits():
    # 9-digit legacy number -> prepend 0 -> valid modulo 97
    # 0477472701 is valid; drop the leading 0 (legacy form).
    legacy = "477472701"
    result = validate_bce(legacy)
    assert result["is_valid"] is True
    assert result["clean"] == "0477472701"


def test_format_bce():
    assert format_bce("0477472701") == "BE 0477.472.701"
    assert format_bce("BE 0477.472.701") == "BE 0477.472.701"


def test_format_vat():
    assert format_vat("0477472701") == "BE0477472701"


def test_validate_ogm_canonical():
    result = validate_ogm("+++000/0001/23470+++")
    assert result["is_valid"] is True

    result = validate_ogm("123456789002")  # 1234567890 % 97 == 2 -> check "02"
    assert result["is_valid"] is True


def test_validate_ogm_invalid():
    result = validate_ogm("+++456/7890/12345+++")
    assert result["is_valid"] is False
    result = validate_ogm("12345")
    assert result["is_valid"] is False


def test_format_ogm():
    assert format_ogm("123456789012") == "+++123/4567/89012+++"


def test_clean_digits():
    assert clean_digits("BE 0202.239.951") == "0202239951"
    assert clean_digits("") == ""
