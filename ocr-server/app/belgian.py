"""Belgian business-number rules shared with the BRABO frontend.

Mirrors `src/utils/belgianAccounting.ts` so the OCR service and the UI agree
on formatting and validation (Modulo 97):
  * BCE / KBO enterprise number  -> BE 0123.456.789
  * VAT number (TVA / BTW)       -> BE0123456789
  * Structured communication OGM -> +++123/4567/89012+++
"""

import re

__all__ = [
    "clean_digits",
    "validate_bce",
    "format_bce",
    "format_vat",
    "validate_ogm",
    "format_ogm",
]


def clean_digits(raw: str) -> str:
    """Keep only the digits of a number string."""
    return re.sub(r"\D", "", raw or "")


def validate_bce(raw: str) -> dict:
    """Validate a Belgian BCE/KBO number.

    Rules (same as the frontend):
      * 10 digits (9-digit legacy numbers get a leading 0)
      * Modulo 97: check == 97 - (first 8 digits % 97)

    Returns {"is_valid": bool, "formatted": str, "clean": str, "error": str | None}.
    """
    if not raw:
        return {"is_valid": False, "formatted": "", "clean": "", "error": "Numéro requis"}

    clean = clean_digits(raw)
    if len(clean) == 9:
        clean = "0" + clean
    if len(clean) != 10:
        return {
            "is_valid": False,
            "formatted": raw,
            "clean": clean,
            "error": f"Longueur invalide ({len(clean)}/10 chiffres)",
        }

    first8 = int(clean[:8])
    check = int(clean[8:10])
    remainder = first8 % 97
    expected = 97 - remainder

    if check != expected:
        return {
            "is_valid": False,
            "formatted": format_bce(clean),
            "clean": clean,
            "error": (
                f"Clé de contrôle modulo 97 invalide "
                f"(attendu: {expected:02d}, trouvé: {check:02d})"
            ),
        }

    return {"is_valid": True, "formatted": format_bce(clean), "clean": clean, "error": None}


def format_bce(bce: str) -> str:
    """Format clean digits to `BE 0123.456.789`."""
    clean = clean_digits(bce).zfill(10)[-10:]
    if len(clean) != 10:
        return bce
    return f"BE {clean[0:4]}.{clean[4:7]}.{clean[7:10]}"


def format_vat(clean_10: str) -> str:
    """Format clean 10 digits to the Belgian VAT form `BE0123456789`."""
    clean = clean_digits(clean_10).zfill(10)[-10:]
    return f"BE{clean}" if len(clean) == 10 else clean_10


def validate_ogm(raw: str) -> dict:
    """Validate a Belgian structured communication (OGM / VCS / mededeling).

    12 digits; Modulo 97 with the `0 -> 97` special case.
    """
    digits = clean_digits(raw)
    if len(digits) != 12:
        return {
            "is_valid": False,
            "error": "Une communication structurée belge doit comporter 12 chiffres.",
        }

    base10 = int(digits[:10])
    check = int(digits[10:12])
    remainder = base10 % 97
    expected = 97 if remainder == 0 else remainder

    if check != expected:
        return {
            "is_valid": False,
            "error": (
                f"Clé Modulo 97 incorrecte "
                f"(attendu: {expected:02d}, actuel: {check:02d})"
            ),
        }

    return {"is_valid": True, "error": None}


def format_ogm(raw: str) -> str:
    """Format 12 digits to `+++123/4567/89012+++`."""
    digits = clean_digits(raw).zfill(12)[-12:]
    if len(digits) != 12:
        return raw
    return f"+++{digits[0:3]}/{digits[3:7]}/{digits[7:12]}+++"
