"""Accounting suggestions for an extracted invoice.

Maps the supplier name / description / amounts to a Belgian PCMN account,
a category, a CIR92 income-tax deductibility rate and a recoverable-VAT share
(Code TVA art. 45). Mirrors the rules baked into BRABO's `BELGIAN_PCMN_ACCOUNTS`.
"""

from __future__ import annotations

import re

__all__ = ["suggest", "PCMN_ACCOUNTS"]

# code -> (category, label, deduct %, deductible VAT %)
PCMN_ACCOUNTS: dict[str, dict] = {
    "600000": {"category": "Achats & Marchandises", "label": "Achats de matières premières & marchandises", "deduct": 100, "vat": 100},
    "610000": {"category": "Loyer & Immeuble", "label": "Loyers et charges locatives de bureau", "deduct": 100, "vat": 100},
    "611000": {"category": "Fournitures & Frais généraux", "label": "Fournitures de bureau et consommables", "deduct": 100, "vat": 100},
    "612000": {"category": "Énergie", "label": "Électricité, eau, gaz et chauffage", "deduct": 100, "vat": 100},
    "613100": {"category": "Honoraires", "label": "Honoraires comptables et fiscaux (Fiduciaire ITAA)", "deduct": 100, "vat": 100},
    "613200": {"category": "Honoraires", "label": "Honoraires juridiques et d'avocats", "deduct": 100, "vat": 100},
    "614100": {"category": "Véhicule & Carburant", "label": "Frais de véhicule - Carburant (75% / TVA 50%)", "deduct": 75, "vat": 50},
    "614200": {"category": "Véhicule & Entretien", "label": "Frais de véhicule - Entretien et réparations", "deduct": 75, "vat": 50},
    "614300": {"category": "Véhicule & Assurance", "label": "Assurance véhicule et taxe de circulation", "deduct": 75, "vat": 0},
    "615100": {"category": "Représentation & Restaurant", "label": "Frais de restaurant & réceptions d'affaires", "deduct": 50, "vat": 0},
    "615200": {"category": "Représentation & Cadeaux", "label": "Cadeaux d'affaires", "deduct": 50, "vat": 100},
    "616100": {"category": "Télécom & Internet", "label": "Abonnements Télécom, Internet et Mobile", "deduct": 100, "vat": 100},
    "616200": {"category": "IT & Logiciels", "label": "Logiciels SaaS, Cloud et hébergement web", "deduct": 100, "vat": 100},
    "617000": {"category": "Cotisations Sociales", "label": "Cotisations sociales indépendant (INASTI/Liantis/UCM)", "deduct": 100, "vat": 0},
    "618000": {"category": "Cotisations Sociales", "label": "Prime PLCI / VAPZ (Pension libre complémentaire)", "deduct": 100, "vat": 0},
    "640000": {"category": "Taxes & Redevances", "label": "Taxes diverses et redevances communales", "deduct": 100, "vat": 0},
    "650000": {"category": "Frais Bancaires", "label": "Frais bancaires et intérêts d'emprunt", "deduct": 100, "vat": 0},
    "240000": {"category": "Investissement Matériel IT", "label": "Matériel informatique et mobilier (investissement)", "deduct": 100, "vat": 100, "investment": True},
    "241000": {"category": "Investissement Véhicule", "label": "Matériel roulant / Véhicule d'entreprise", "deduct": 75, "vat": 50, "investment": True},
}

# (regex, pcmn code) — checked in order, first match wins
RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b(proximus|orange|telenet|telenet|vodafone|scarlet|mobistar|base\s*company|internet|fibre|gsm|mobile|abonnement|subscription|telecom)\b", re.IGNORECASE), "616100"),
    (re.compile(r"\b(restaurant|brasserie|caf[ée]|bistro|hotel|h[ôo]tel|traiteur|eatery|diner|d[ée]jeuner|lunch|repas|maaltijd|eetcaf[ée])\b", re.IGNORECASE), "615100"),
    (re.compile(r"\b(cadeau|gift|reception|r[ée]ception|sponsoring|relatiegeschenk)\b", re.IGNORECASE), "615200"),
    (re.compile(r"\b(carburant|fuel|essence|diesel|benzine|diesel|charging|recharge|parking|peage|p[ée]age|toll)\b", re.IGNORECASE), "614100"),
    (re.compile(r"\b(leasing|lease|entretien|maintenance|reparat|r[ée]parat|pneus|banden|garage|auto|voiture|wagen|wagens|wagenpark)\b", re.IGNORECASE), "614200"),
    (re.compile(r"\b(assurance|verzekering|insurance)\b", re.IGNORECASE), "614300"),
    (re.compile(r"\b(notaire|avocat|advocaat|juridique|legal|huissier)\b", re.IGNORECASE), "613200"),
    (re.compile(r"\b(fiduciaire|comptable|accountant|itaa|iec|honoraire|honorarium|boekhoud)\b", re.IGNORECASE), "613100"),
    (re.compile(r"\b(loyer|huur|rent|bail|locatif)\b", re.IGNORECASE), "610000"),
    (re.compile(r"\b([ée]lectricit[ée]|elex|engie|luminus|otalio|gaz|gas|eau|water|chauffage|verwarming|energie|energy)\b", re.IGNORECASE), "612000"),
    (re.compile(r"\b(saas|cloud|logiciel|software|software|h[ée]bergement|hosting|serveur|server|licence|abonnement\s*it|aws|azure|google\s*cloud|domain|domaine)\b", re.IGNORECASE), "616200"),
    (re.compile(r"\b(ordinateur|laptop|macbook|imac|ecran|screen|moniteur|clavier|souris|imprimante|printer|router|switch|nas|pc\b|desktop|materiel\s*informatique|hardware|telephone|iphone|ipad)\b", re.IGNORECASE), "240000"),
    (re.compile(r"\b(cotisation|inasti|rsvz|liantis|ucm|sociale|sociale\s*bijdrage|plci|vapz|pension)\b", re.IGNORECASE), "617000"),
    (re.compile(r"\b(fourniture|bureau|papier|toner|cartouche|consommable|kantoor|briefpapier)\b", re.IGNORECASE), "611000"),
    (re.compile(r"\b(banque|bank|frais\s*bancaires|bankkosten)\b", re.IGNORECASE), "650000"),
    (re.compile(r"\b(taxe|redevance|belasting|heffing)\b", re.IGNORECASE), "640000"),
]


def suggest(fields: dict) -> dict:
    """Return {pcmnAccount, category, label, deductibilityRate, deductibleVatRate, isInvestment, description}."""
    supplier = str(fields.get("supplierName", {}).get("value") or "")
    invoice_no = str(fields.get("invoiceNumber", {}).get("value") or "")
    description = str(fields.get("description", {}).get("value") or "")
    haystack = " ".join([supplier, description])

    code = None
    for pattern, account in RULES:
        if pattern.search(haystack):
            code = account
            break
    if code is None:
        code = "611000"

    account = PCMN_ACCOUNTS[code]
    vat_rate = fields.get("vatRate", {}).get("value")
    if code == "616200" and vat_rate == 0:
        # Hosting of *our own* website — not deductible VAT. Keep 616200 anyway.
        pass

    desc = description or invoice_no or supplier
    return {
        "pcmnAccount": code,
        "category": account["category"],
        "label": account["label"],
        "deductibilityRate": account["deduct"],
        "deductibleVatRate": account["vat"],
        "isInvestment": bool(account.get("investment")),
        "description": desc or None,
    }
