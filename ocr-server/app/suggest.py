"""Accounting classification for an extracted invoice.

Classifies an expense by its *nature* from the FULL OCR text (supplier name,
line-item descriptions, …) onto a Belgian PCMN account, a category/nature
label, the CIR92 income-tax deductibility and the recoverable-VAT share
(Code TVA art. 45). Mirrors BRABO's `BELGIAN_PCMN_ACCOUNTS`.

The classification is the last-mile "intelligence": it must see the actual
line items, not just the supplier name, to be precise.
"""

from __future__ import annotations

import re

__all__ = ["suggest", "PCMN_ACCOUNTS"]

# code -> {category (nature), label, deduct %, deductible VAT %}
PCMN_ACCOUNTS: dict[str, dict] = {
    "600000": {"category": "Achats & Marchandises", "label": "Achats de matières premières & marchandises", "deduct": 100, "vat": 100},
    "610000": {"category": "Loyer & Charges locatives", "label": "Loyers et charges locatives de bureau", "deduct": 100, "vat": 100},
    "611000": {"category": "Fournitures & Frais généraux", "label": "Fournitures de bureau et consommables", "deduct": 100, "vat": 100},
    "612000": {"category": "Énergie", "label": "Électricité, eau, gaz et chauffage", "deduct": 100, "vat": 100},
    "613100": {"category": "Honoraires Comptables & Fiscaux", "label": "Honoraires comptables et fiscaux (Fiduciaire ITAA)", "deduct": 100, "vat": 100},
    "613200": {"category": "Honoraires Juridiques", "label": "Honoraires juridiques et d'avocats", "deduct": 100, "vat": 100},
    "614100": {"category": "Carburant & Recharge", "label": "Frais de véhicule - Carburant (75% / TVA 50%)", "deduct": 75, "vat": 50},
    "614200": {"category": "Entretien & Réparations Véhicule", "label": "Frais de véhicule - Entretien et réparations", "deduct": 75, "vat": 50},
    "614300": {"category": "Assurance Véhicule", "label": "Assurance véhicule et taxe de circulation", "deduct": 75, "vat": 0},
    "615100": {"category": "Restaurant & Réceptions", "label": "Frais de restaurant & réceptions d'affaires", "deduct": 50, "vat": 0},
    "615200": {"category": "Cadeaux & Sponsoring", "label": "Cadeaux d'affaires et sponsoring", "deduct": 50, "vat": 100},
    "616100": {"category": "Télécom & Internet", "label": "Abonnements Télécom, Internet et Mobile", "deduct": 100, "vat": 100},
    "616200": {"category": "Logiciels, SaaS & Hébergement", "label": "Logiciels SaaS, Cloud et hébergement web", "deduct": 100, "vat": 100},
    "617000": {"category": "Cotisations Sociales", "label": "Cotisations sociales indépendant (INASTI/Liantis/UCM)", "deduct": 100, "vat": 0},
    "618000": {"category": "Pension PLCI / VAPZ", "label": "Prime PLCI / VAPZ (Pension libre complémentaire)", "deduct": 100, "vat": 0},
    "640000": {"category": "Taxes & Redevances", "label": "Taxes diverses et redevances communales", "deduct": 100, "vat": 0},
    "650000": {"category": "Frais Bancaires", "label": "Frais bancaires et intérêts d'emprunt", "deduct": 100, "vat": 0},
    "240000": {"category": "Matériel Informatique (Investissement)", "label": "Matériel informatique et mobilier (investissement)", "deduct": 100, "vat": 100, "investment": True},
    "241000": {"category": "Véhicule (Investissement)", "label": "Matériel roulant / Véhicule d'entreprise", "deduct": 75, "vat": 50, "investment": True},
}

# (regex, pcmn) — checked in order, first match wins. Covers nature + supplier brands.
RULES: list[tuple[re.Pattern, str]] = [
    # --- Energy / utilities ---
    (re.compile(r"\b([ée]lectricit[ée]|energie|energy|gaz|gas|eau|water|chauffage|verwarming|engie|luminus|otalio|elex|totalenergies|shell|esso|fuel\s*(?:station|card)|stroom|stroomkosten)\b", re.IGNORECASE), "612000"),
    # --- Telecom & internet ---
    (re.compile(r"\b(proximus|orange|telenet|vodafone|scarlet|mobistar|base\s*company|internet|fibre|gsm|mobile|abonnement|subscription|telecom|telecom\b|wifi|4g|5g|broadband)\b", re.IGNORECASE), "616100"),
    # --- Software / SaaS / cloud / hosting ---
    (re.compile(r"\b(saas|cloud|logiciel|software|h[ée]bergement|hosting|serveur|server|licence|license|aws|azure|google\s*cloud|gcp|domain|domaine|abonnement\s*it|microsoft\s*365|office\s*365|slack|notion|github|gitlab|stripe|paypal|mailchimp|hubspot|salesforce|zoho|clickup|trello|linear|vercel|netlify|heroku|digitalocean|ovh|cloudflare)\b", re.IGNORECASE), "616200"),
    # --- IT hardware (investment) ---
    (re.compile(r"\b(ordinateur|laptop|macbook|imac|ecran|screen|moniteur|clavier|souris|imprimante|printer|router|switch|nas\b|pc\b|desktop|mat[ée]riel\s*informatique|hardware|t[ée]l[ée]phone|iphone|ipad|tablette|tablet|dell|lenovo|hp\b|asus|acer|server|serveur)\b", re.IGNORECASE), "240000"),
    # --- Car: fuel/recharge ---
    (re.compile(r"\b(carburant|fuel|essence|diesel|benzine|recharge|charging|e-?charging|chargepoint|fastned|ionity|tesla|supercharger|parking|p[ée]age|toll|station\s*service)\b", re.IGNORECASE), "614100"),
    # --- Car: leasing / maintenance / parts ---
    (re.compile(r"\b(leasing|lease|leaseplan|arval|athlon|alphabet|entretien|onderhoud|maintenance|r[ée]parat|reparatie|pneus|banden|garage|auto\b|voiture|wagen|wagenpark|d'ieteren|kwik-fit|autoc[ée]l[ée]\b|contr[ôo]le\s*technique)\b", re.IGNORECASE), "614200"),
    # --- Car: insurance / road tax ---
    (re.compile(r"\b(assurance\s*(?:auto|v[ée]hicule)|verzekering|insurance\s*(?:car|vehicle)|taxe\s*de\s*circulation|verkeersbelasting|omnium|tour\s*ing|kbc\s*auto|axa\s*auto|ethias\s*auto)\b", re.IGNORECASE), "614300"),
    # --- Restaurant / catering / hospitality ---
    (re.compile(r"\b(restaurant|brasserie|caf[ée]|bistro|h[ôo]tel|hotel|traiteur|catering|eatery|diner|d[ée]jeuner|lunch|repas|maaltijd|eetcaf[ée]|lunch\s*garden|quick|mcdonald|delhaize\s*shop|catering|snack|frituur|pizzeria)\b", re.IGNORECASE), "615100"),
    # --- Gifts / sponsorship / events ---
    (re.compile(r"\b(cadeau|gift|sponsoring|relatiegeschenk|reception|r[ée]ception|goodies|merchandising|vin|champagne|fleurs|flower)\b", re.IGNORECASE), "615200"),
    # --- Legal ---
    (re.compile(r"\b(notaire|avocat|advocaat|juridique|legal|huissier|greffe|tribunal|notaris)\b", re.IGNORECASE), "613200"),
    # --- Accounting / fiduciary / consulting ---
    (re.compile(r"\b(fiduciaire|comptable|accountant|itaa|iec|honoraire|honorarium|boekhoud|bookkeeping|consulting|consultance|conseil|advisor|expert[-\s]comptable|fiscali)\b", re.IGNORECASE), "613100"),
    # --- Marketing / advertising ---
    (re.compile(r"\b(marketing|publicit[ée]|advertising|ads\b|m[ée]ta\b|google\s*ads|facebook\s*ads|linkedin\s*ads|sponsor|seo|sea\b|print\s*shop|imprimerie|flyers|brochures)\b", re.IGNORECASE), "611000"),
    # --- Rent / real estate ---
    (re.compile(r"\b(loyer|huur|rent|bail|locatif|co-working|co-working|regus|wework|spaces)\b", re.IGNORECASE), "610000"),
    # --- Social security / pension ---
    (re.compile(r"\b(cotisation|bijdrage|inasti|rsvz|liantis|ucm|xerius|securex|acerta|partena|plci|vapz|pension|ipt|eip)\b", re.IGNORECASE), "617000"),
    # --- Bank & financial ---
    (re.compile(r"\b(banque|bank|frais\s*bancaires|bankkosten|bnpparibas|belfius|kbc|ing\b|fortis|hello\s*bank|interest|int[ée]r[êe]t)\b", re.IGNORECASE), "650000"),
    # --- Taxes & levies ---
    (re.compile(r"\b(taxe\s*(?:communale|provinciale|r[ée]gionale)|redevance|belasting|heffing|pr[ée]compte|onem|tv[ée]belasting)\b", re.IGNORECASE), "640000"),
    # --- Office supplies ---
    (re.compile(r"\b(fourniture|bureau|papier|toner|cartouche|consommable|kantoor|briefpapier|stabilo|bic\b|lyreco|staples|office\s*supplies)\b", re.IGNORECASE), "611000"),
    # --- Cleaning / facilities ---
    (re.compile(r"\b(nettoyage|cleaning|schoonmaak|m[ée]nag[ée]|femme\s*de\s*m[ée]nage|maintenance\s*de\s*bureau)\b", re.IGNORECASE), "611000"),
    # --- Training / formation ---
    (re.compile(r"\b(formation|training|opleiding|s[ée]minaire|webinar|cours|workshop|coaching)\b", re.IGNORECASE), "611000"),
    # --- Transport / freight / travel ---
    (re.compile(r"\b(transport|freight|logistique|livraison|delivery|taxi|uber|bolt\b|sncb|nmbs|thalys|eurostar|billet\s*train|vol\b|flight|airline|easyjet|ryanair)\b", re.IGNORECASE), "611000"),
]


def suggest(fields: dict, raw_text: str = "") -> dict:
    """Return {pcmnAccount, category, label, deductibilityRate, deductibleVatRate, isInvestment, description}."""
    supplier = str(fields.get("supplierName", {}).get("value") or "")
    invoice_no = str(fields.get("invoiceNumber", {}).get("value") or "")
    description = str(fields.get("description", {}).get("value") or "")
    # Full-text nature classification: supplier + line items + raw OCR text.
    haystack = " ".join([supplier, description, raw_text])

    code = None
    for pattern, account in RULES:
        if pattern.search(haystack):
            code = account
            break
    if code is None:
        code = "611000"

    account = PCMN_ACCOUNTS[code]
    vat_rate = fields.get("vatRate", {}).get("value")
    # VAT-rate inference as a secondary signal.
    if code == "611000" and vat_rate == 0:
        code = "650000"  # 0% + unclassified → likely financial/social
        account = PCMN_ACCOUNTS[code]

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
