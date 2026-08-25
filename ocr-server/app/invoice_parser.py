"""Rule-based structured invoice extraction for Belgian invoices (FR/NL/EN).

The parser works on OCR output *lines with spatial boxes*, because amounts on
an invoice live at a predictable place (right side, totals block) and because
keyword + position beats keyword-only on noisy OCR text.

It extracts: supplier name, supplier VAT/BCE, invoice number, invoice date,
due date, IBAN, structured communication (OGM), totals (HTVA / TVA / TVAC),
dominant VAT rate, payment terms — each with a confidence, plus warnings.
"""

from __future__ import annotations

import re
from datetime import datetime

from .belgian import clean_digits, format_bce, format_ogm, format_vat, validate_bce, validate_ogm

__all__ = ["OcrLine", "parse_invoice"]

BELGIAN_VAT_RATES = (21, 12, 6, 0)

# ---------------------------------------------------------------------------
# OCR line model
# ---------------------------------------------------------------------------


class OcrLine:
    """One OCR text line with its geometry (pixel coordinates, top-left origin)."""

    __slots__ = ("text", "score", "x", "y", "y_center", "w", "h", "page")

    def __init__(self, text: str, score: float, x: float, y: float, w: float, h: float, page: int = 0):
        self.text = text.strip()
        self.score = score
        self.x = x
        self.y = y
        self.y_center = y + h / 2
        self.w = w
        self.h = h
        self.page = page

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"OcrLine(y={self.y:.0f}, x={self.x:.0f}, '{self.text[:40]}', {self.score:.2f})"


# ---------------------------------------------------------------------------
# Keyword tables (FR / NL / EN)
# ---------------------------------------------------------------------------

KW_INVOICE_NO = re.compile(
    r"\b(?:"
    r"facture\s*(?:n[°o]?|num[eé]ro|nummer|nr\.?)?"
    r"|factuurnummer|factuurnr\b|factuur\s*(?:nr\.?|nummer)"
    r"|invoice\s*(?:n[°o]?|no\.?|number|#|num)"
    r"|rechnung|document\s*(?:n[°o]?|no\.?|num)"
    r"|ref(?:[ée]rence)?\s*(?:n[°o]?|\.)?"
    r"|nr\.?\s*:|num[eé]ro|n[°o]\.?\s*:"
    r"|bestelbon\s*(?:nr\.?)?"
    r")\b",
    re.IGNORECASE,
)

KW_DATE = re.compile(
    r"\b(?:"
    r"facture\s*(?:du|date)|invoice\s*date|issue\s*date|factuurdatum|factuur\s*van"
    r"|date\s*(?:de\s*(?:facturation|la\s*facture))?|datum"
    r"|e[ée]ch[ée]ance|vervaldatum|due\s*date|payment\s*date|betaaldatum"
    r"|dat[ée]e\s*du"
    r")\b",
    re.IGNORECASE,
)

KW_DUE_DATE = re.compile(
    r"\b(?:e[ée]ch[ée]ance|vervaldatum|due\s*date|betaaldatum|te\s*betalen\s*v[oô]or)\b",
    re.IGNORECASE,
)

KW_TOTAL_INCL_STRONG = re.compile(
    r"\b(?:"
    r"total\s*(?:tvac|ttc|t\.?v\.?a\.?c|general|g[eé]n[eé]ral|a\s*payer|net\s*[aà]\s*payer)"
    r"|totaal\s*(?:incl|te\s*betalen|verschuldigd|eindtotaal)"
    r"|amount\s*(?:due|payable|to\s*pay)|total\s*(?:due|payable|to\s*pay)"
    r"|grand\s*total|balance\s*due|net\s*total|eindtotaal"
    r")\b",
    re.IGNORECASE,
)

KW_TOTAL_INCL_WEAK = re.compile(
    r"\b(?:totaal|(?<!sous-)(?<!sub-)\btotal\b)\b",
    re.IGNORECASE,
)

KW_TOTAL_EXCL = re.compile(
    r"\b(?:"
    r"total\s*(?:htva|ht\b|hors\s*taxe|excl(?:\.|usif|.?\s*tva)?|net\b)"
    r"|sous-total|subtotal|sous\s*total"
    r"|totaal\s*(?:excl|zonder|netto)"
    r"|netto\s*(?:bedrag|totaal)|excl\.?\s*(?:btw|vat)"
    r"|htva\s*total|totaal\s*netto"
    r")\b",
    re.IGNORECASE,
)

KW_VAT = re.compile(r"\b(?:tva|btw|vat|omzetbelasting|taxe)\b", re.IGNORECASE)

KW_RATE = re.compile(r"(\d{1,2})\s*%")

KW_OGM = re.compile(r"(?:\+\+\+)?\s*(\d{3})\s*/\s*(\d{4})\s*/\s*(\d{5})\s*(?:\+\+\+)?")

VAT_CANDIDATE_RE = re.compile(
    r"(?<![\dA-Za-z])([A-Za-z]{2})[\s.\-]?((?:\d[\s.\-]?){7,12})(?![\dA-Za-z])"
)
# 10-digit BCB/KBO number (possibly with dots/spaces) used as fallback
BCE_DIGITS_RE = re.compile(r"(?<!\d)(\d{4})[.\s]?(\d{3})[.\s]?(\d{3})(?!\d)")

IBAN_RE = re.compile(r"\b([A-Z]{2}\d{2}(?:[ ]?\d{4}){3,6})\b")

MONTHS_FR = {
    "janvier": 1, "f[ée]vrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
    "juillet": 7, "ao[uû]t": 8, "septembre": 9, "octobre": 10, "novembre": 11, "d[ée]cembre": 12,
}
MONTHS_NL = {
    "januari": 1, "februari": 2, "maart": 3, "april": 4, "mei": 5, "juni": 6,
    "juli": 7, "augustus": 8, "september": 9, "oktober": 10, "november": 11, "december": 12,
}
MONTHS_EN = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}
MONTHS = {**MONTHS_FR, **MONTHS_NL, **MONTHS_EN}

JUNK_HEADER_RE = re.compile(
    r"(?:"
    r"www\.|https?://|\.com|\.be\b|\.eu\b|\.nl\b|\.fr\b"
    r"|@\w+\.\w+"
    r"|tva\s*be|btw\s*be|vat\s*be|n[°o]?\s*(?:de\s*)?facture|factuur|invoice|rechnung"
    r"|t[eé]l\.?|tel:|fax|iban|bic\b|gsm|mobile"
    r"|\+\d{2}"
    r"|^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}$"
    r"|^\d{4}$"
    r"|^\d[\d\s.,]*\s*[€e]$|^\d[\d\s.,]*$"
    r"|page\s*\d|p[aá]gina|blz\.?\s*\d|seite"
    r"|btw|tva|vat"
    r")\b",
    re.IGNORECASE,
)

LEGAL_FORM_RE = re.compile(
    r"\b(?:SA|NV|BV|SRL|BVBA|SPRL|SPRLU|SCRL|SNC|SCS|CV|VOF|SNC|ASBL|VZW|SAS|SARL|EURL|EURL|GmbH|"
    r"AG|Ltd|Ltd\.|PLC|LLC|Inc\.?|Co\.?|SCRIS|SC|Stichting|VZW|Comm\.?V|Gcv|CommV|SComm)\b",
    re.IGNORECASE,
)

MONEY_TOKEN_RE = re.compile(r"\d[\d\s.,'\u00a0\u202f]*\d|\d")


# ---------------------------------------------------------------------------
# Money helpers (Belgian comma-decimal convention)
# ---------------------------------------------------------------------------


def parse_money(token: str) -> float | None:
    """Parse a money token in Belgian/European format.

    Handles `1.234,56`, `1234,56`, `1234.56`, `1 234,56`, `1'234,56`.
    """
    s = (token or "").strip()
    if not s:
        return None
    s = s.replace("\u00a0", " ").replace("\u202f", " ").replace("'", " ")
    s = re.sub(r"[€\s]", "", s)
    if not re.fullmatch(r"[\d.,]+", s):
        return None

    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        if re.fullmatch(r"\d{1,3}(,\d{3})+", s):
            s = s.replace(",", "")
        else:
            s = s.replace(",", ".")
    else:
        if re.fullmatch(r"\d{1,3}(\.\d{3})+", s):
            s = s.replace(".", "")

    try:
        value = float(s)
    except ValueError:
        return None
    return round(value, 2)


def line_amounts(line: OcrLine) -> list[tuple[float, str]]:
    """All money amounts on a line, each with its matched token, leftmost first."""
    results: list[tuple[float, str]] = []
    for match in MONEY_TOKEN_RE.finditer(line.text):
        token = match.group(0)
        value = parse_money(token)
        if value is None or value > 10_000_000:
            continue
        results.append((value, token))
    return results


def rightmost_amount(line: OcrLine) -> tuple[float, str] | None:
    """The amount at the right edge of the line — invoice totals sit right-aligned."""
    amounts = line_amounts(line)
    if not amounts:
        return None
    return amounts[-1]


# ---------------------------------------------------------------------------
# Date parsing
# ---------------------------------------------------------------------------

DATE_RE = re.compile(
    r"\b(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})\b"
)


def _parse_date_token(token: str) -> str | None:
    m = DATE_RE.search(token)
    if m:
        a, b, c = m.group(1), m.group(2), m.group(3)
        if len(a) == 4:  # yyyy-mm-dd
            year, month, day = int(a), int(b), int(c)
        elif len(c) == 4:  # dd/mm/yyyy
            day, month, year = int(a), int(b), int(c)
        else:
            year = 2000 + int(c) if int(c) < 100 else int(c)
            day, month = int(a), int(b)
        if 1 <= month <= 12 and 1 <= day <= 31 and 1970 <= year <= 2100:
            return f"{year:04d}-{month:02d}-{day:02d}"
        return None

    for name, num in MONTHS.items():
        m = re.search(rf"(\d{{1,2}})\s*(?:er|ste|de)?\s*{name}\.?\s*(\d{{4}}|\d{{2}})", token, re.IGNORECASE)
        if m:
            day = int(m.group(1))
            year_raw = m.group(2)
            year = int(year_raw) if len(year_raw) == 4 else 2000 + int(year_raw)
            if 1 <= day <= 31 and 1970 <= year <= 2100:
                return f"{year:04d}-{num:02d}-{day:02d}"
    return None


def find_date_in_line(line: OcrLine) -> tuple[str | None, str | None]:
    """(ISO date, matched token) found on the line, or (None, None)."""
    # Scan raw tokens: amounts lose separator info, so scan the text.
    for match in re.finditer(
        r"\b\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}\b|\b\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\b",
        line.text,
    ):
        iso = _parse_date_token(match.group(0))
        if iso:
            return iso, match.group(0)
    for match in re.finditer(
        r"\b\d{1,2}(?:er|ste|de)?\s*(?:" + "|".join(MONTHS) + r")\.?\s*\d{4}\b|\b\d{1,2}(?:er|ste|de)?\s*(?:"
        + "|".join(MONTHS)
        + r")\.?\s*\d{2}\b",
        line.text,
        re.IGNORECASE,
    ):
        iso = _parse_date_token(match.group(0))
        if iso:
            return iso, match.group(0)
    return None, None


# ---------------------------------------------------------------------------
# Main parser
# ---------------------------------------------------------------------------


def parse_invoice(lines: list[OcrLine]) -> dict:
    """Extract structured fields from OCR lines.

    Returns {"fields": {key: {"value": ..., "confidence": ...}}, "warnings": [...]}.
    """
    fields: dict[str, dict] = {}
    warnings: list[str] = []

    def put(key: str, value, confidence: float, overwrite: bool = True) -> None:
        if value is None or value == "":
            return
        if key in fields and not overwrite:
            return
        fields[key] = {"value": value, "confidence": round(min(max(confidence, 0.0), 1.0), 4)}

    if not lines:
        return {"fields": fields, "warnings": ["Document vide — aucun texte détecté."]}

    # ---------------- VAT / BCE numbers (whole text) ------------------------
    for line in lines:
        for m in VAT_CANDIDATE_RE.finditer(line.text):
            cc = m.group(1).upper()
            digits = clean_digits(m.group(2))
            conf = max(0.5, min(line.score * 1.05, 0.98))
            if cc == "BE" and len(digits) == 10:
                check = validate_bce(digits)
                if check["is_valid"]:
                    put("supplierBce", check["formatted"], conf)
                else:
                    warnings.append(f"BCE {digits} invalide (modulo 97).")
                put("supplierVat", format_vat(digits), conf)
            else:
                put("supplierVat", f"{cc}{digits}", conf, overwrite=False)
        # Bare 10-digit BCE (no country prefix)
        if "supplierVat" not in fields or "supplierBce" not in fields:
            for m in BCE_DIGITS_RE.finditer(line.text):
                digits = m.group(1) + m.group(2) + m.group(3)
                check = validate_bce(digits)
                if check["is_valid"]:
                    put("supplierBce", check["formatted"], min(line.score * 1.05, 0.98))
                    put("supplierVat", format_vat(digits), min(line.score * 1.05, 0.98))

    # ---------------- IBAN ----------------------------------------------------
    for line in lines:
        for m in IBAN_RE.finditer(line.text):
            iban = m.group(1).replace(" ", "")
            if len(iban) >= 15:
                put("iban", iban, min(line.score * 1.05, 0.98), overwrite=False)

    # ---------------- Structured communication (OGM) --------------------------
    for line in lines:
        for m in KW_OGM.finditer(line.text):
            digits = m.group(1) + m.group(2) + m.group(3)
            check = validate_ogm(digits)
            if check["is_valid"]:
                put("structuredCommunication", format_ogm(digits), min(line.score * 1.05, 0.98))
            else:
                warnings.append("Communication structurée détectée mais clé modulo 97 invalide.")

    # ---------------- Invoice number -----------------------------------------
    for line in lines:
        m = KW_INVOICE_NO.search(line.text)
        if not m:
            continue
        tail = line.text[m.end():].lstrip(" :#—–-")
        tail = re.split(r"\s{2,}|\t", tail)[0]
        if not tail:
            continue
        tail = tail.split()[0] if tail.split() else tail
        if re.fullmatch(r"[\d.,%]+", tail) and "," in tail:
            continue  # looks like an amount, not a number
        tail = tail.strip(" .:;")
        if 2 <= len(tail) <= 40 and not tail.isdigit():
            put("invoiceNumber", tail, min(line.score * 1.05, 0.98))
            break

    # ---------------- Dates ---------------------------------------------------
    for line in lines:
        if KW_DATE.search(line.text):
            iso, _ = find_date_in_line(line)
            if iso:
                if KW_DUE_DATE.search(line.text):
                    put("dueDate", iso, min(line.score * 1.05, 0.98))
                else:
                    put("invoiceDate", iso, min(line.score * 1.05, 0.98))

    # Fallback: any date on the page (first) becomes the invoice date.
    if "invoiceDate" not in fields:
        for line in lines:
            iso, _ = find_date_in_line(line)
            if iso:
                put("invoiceDate", iso, 0.55)
                break

    # ---------------- Payment terms ------------------------------------------
    for line in lines:
        m = re.search(
            r"\b(?:paiement|payment|betaling|terms|e[ée]ch[ée]ance|verval)\b.*?(\d{1,2})\s*(?:jours?|days?|dagen)", line.text,
            re.IGNORECASE,
        )
        if m:
            put("paymentTermsDays", int(m.group(1)), min(line.score * 0.95, 0.9))

    # ---------------- Totals ---------------------------------------------------
    candidates_incl: list[tuple[float, float, OcrLine, bool]] = []  # (amount, conf, line, strong)
    candidates_excl: list[tuple[float, float, OcrLine]] = []
    candidates_vat: list[tuple[float, float, OcrLine]] = []

    for line in lines:
        amounts = line_amounts(line)
        if not amounts:
            continue
        rightmost = rightmost_amount(line)
        conf = min(line.score * 1.05, 0.98)
        strong_incl = bool(KW_TOTAL_INCL_STRONG.search(line.text))
        weak_incl = (not strong_incl) and bool(KW_TOTAL_INCL_WEAK.search(line.text))
        if strong_incl or weak_incl:
            candidates_incl.append((rightmost[0], conf, line, strong_incl))
        if KW_TOTAL_EXCL.search(line.text):
            candidates_excl.append((rightmost[0], conf, line))
        if KW_VAT.search(line.text):
            for value, _token in amounts:
                # Guard: a bare 1-2 digit number is usually the rate, not money.
                if re.fullmatch(r"\d{1,2}", _token):
                    continue
                candidates_vat.append((value, conf, line))

    def pick(candidates: list, strong_first: bool = False) -> tuple[float, float] | None:
        """Prefer the strongest keyword match, then the largest amount."""
        if not candidates:
            return None
        if strong_first:
            strong = [c for c in candidates if c[3]]
            best = max(strong or candidates, key=lambda c: c[0])
        else:
            best = max(candidates, key=lambda c: c[0])
        return best[0], best[1]

    incl = pick(candidates_incl, strong_first=True)
    excl = pick(candidates_excl)

    # VAT amount: prefer the line whose text contains a rate too, else the
    # largest "TVA/BTW/VAT"-labelled amount that is not the total itself.
    vat = None
    if candidates_vat:
        strong = [c for c in candidates_vat if c[0] < 1_000_000]
        if strong:
            vat = max(strong, key=lambda c: c[0])
    # A VAT amount must not equal the grand total (would be a misread).
    if incl and vat and abs(vat[0] - incl[0]) < 0.01:
        strong = [c for c in candidates_vat if abs(c[0] - incl[0]) > 0.01]
        vat = max(strong, key=lambda c: c[0]) if strong else None

    # A weak bare "total" that equals the HTVA total is not a TVAC: drop it.
    if (
        incl
        and excl
        and abs(incl[0] - excl[0]) < 0.01
        and not any(c[3] for c in candidates_incl)
    ):
        incl = None

    if incl:
        put("totalInclVat", incl[0], incl[1])
    if excl:
        put("totalExclVat", excl[0], excl[1])
    if vat:
        put("vatAmount", vat[0], vat[1])

    # ---------------- VAT rate -------------------------------------------------
    rate = None
    rates_found: list[int] = []
    for line in lines:
        for m in KW_RATE.finditer(line.text):
            r = int(m.group(1))
            if r in BELGIAN_VAT_RATES and r not in rates_found:
                rates_found.append(r)

    vat_amt = fields.get("vatAmount", {}).get("value")
    excl_amt = fields.get("totalExclVat", {}).get("value")
    incl_amt = fields.get("totalInclVat", {}).get("value")

    def nearest_rate(computed: float) -> int | None:
        nearest = min(BELGIAN_VAT_RATES, key=lambda r: abs(r - computed))
        return nearest if abs(computed - nearest) <= 2 else None

    if vat_amt is not None and excl_amt and excl_amt != 0:
        rate = nearest_rate(round(vat_amt / excl_amt * 100))
    elif incl_amt is not None and excl_amt and excl_amt != 0:
        rate = nearest_rate(round((incl_amt / excl_amt - 1) * 100))
    if rate is None and rates_found:
        # Prefer the rate attached to the total-VAT line, else the highest.
        rate = rates_found[0] if len(rates_found) == 1 else max(rates_found)
    if rate is not None:
        conf_rate = 0.85 if rate is not None and rates_found else 0.6
        put("vatRate", rate, conf_rate)

    if len(rates_found) > 1:
        warnings.append(f"Plusieurs taux détectés ({', '.join(map(str, sorted(rates_found)))} %) — à vérifier.")

    # Consistency: TVAC ≈ HTVA + TVA
    if incl_amt is not None and excl_amt is not None and vat_amt is not None:
        if abs(incl_amt - (excl_amt + vat_amt)) > 0.5:
            warnings.append(
                f"Total TVAC ({incl_amt:.2f} €) ≠ HTVA ({excl_amt:.2f} €) + TVA ({vat_amt:.2f} €)."
            )

    # ---------------- Supplier name (layout-aware header block) ---------------
    page0 = [l for l in lines if l.page == 0] or lines
    if page0:
        page_h = max(l.y + l.h for l in page0) or 1.0
        header = [l for l in page0 if l.y <= page_h * 0.30][:8] or page0[:6]

        def junk(l: OcrLine) -> bool:
            t = l.text
            if JUNK_HEADER_RE.search(t):
                return True
            if KW_OGM.search(t):
                return True
            return False

        candidates = [l for l in header if not junk(l)]
        if not candidates:
            candidates = [l for l in page0 if not junk(l)][:3]

        if candidates:
            # Prefer a line with a legal form, else the first substantial line.
            chosen = next((l for l in candidates if LEGAL_FORM_RE.search(l.text)), candidates[0])
            # Never return an entire address line as a supplier name.
            name = re.split(r"\s{2,}|\t", chosen.text)[0].strip(" ,;:–—")
            if len(name) >= 2:
                conf = min(chosen.score * 1.05, 0.98)
                if not LEGAL_FORM_RE.search(chosen.text):
                    conf = min(conf, 0.7)
                put("supplierName", name, conf)

    # Fallback: line just before the VAT/BCE number line.
    if "supplierName" not in fields:
        for i, line in enumerate(lines):
            if VAT_CANDIDATE_RE.search(line.text) or BCE_DIGITS_RE.search(line.text):
                if i > 0 and len(lines[i - 1].text) > 2:
                    put("supplierName", lines[i - 1].text.strip(" ,:;–—"), min(lines[i - 1].score * 1.05, 0.9))
                    break

    if not fields:
        warnings.append("Aucun champ facture reconnu — document peu lisible ou non-facture.")

    return {"fields": fields, "warnings": warnings}
