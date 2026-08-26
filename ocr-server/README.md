# BRABO OCR Server — FastAPI + PaddleOCR (self-hosted, CPU)

OCR de factures **100 % onboardé** : aucune donnée cliente ne quitte le serveur.

- **Moteur** : [PaddleOCR PP-OCRv5](https://github.com/PaddlePaddle/PaddleOCR) (détection + reconnaissance
  « latin » → couvre FR/NL/EN), orientation de document, dégauchissement, orientation de ligne.
  *Choix retenu* : meilleur ratio précision/vitesse sur documents structurés (factures, reçus),
  licence Apache 2.0 (compatible SaaS commercial), CPU suffisant (≈ 2–4 s/page).
- **PDF** : rasterisation pypdfium2 (≤ 5 pages, 200 dpi).
- **Extraction structurée** : règles belges FR/NL/EN — fournisseur, n° TVA/BCE (modulo 97),
  n° de facture, dates, échéance, délai de paiement, IBAN, **OGM** (modulo 97),
  totaux HTVA / TVA / TVAC, taux TVA dominant, suggestion **PCMN** + déductibilité CIR92 + TVA récupérable.
- **API** : FastAPI, CORS contrôlé, upload ≤ 15 Mo, un seul worker (modèle en mémoire).

## Démarrage rapide (Docker)

```bash
docker build -t brabo-ocr:latest -f ocr-server/Dockerfile ocr-server
docker run --rm -p 8000:8000 -v paddle-models:/root/.paddlex brabo-ocr:latest
```

Premier démarrage : les modèles PP-OCRv5 sont pré-téléchargés au build (ou au premier appel).

## Démarrage rapide (Python brut)

```bash
cd ocr-server
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt     # Windows
# .venv/bin/pip install -r requirements.txt       # Linux/macOS
.venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

> Python 3.11 est recommandé (paddlepaddle 3.x n'est pas publié pour 3.13+).

## API

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/health` (alias `/ocr/health`) | État moteur + version |
| POST | `/ocr/extract` | `multipart/form-data`, champ `file` (image ou PDF) → JSON structuré |

Réponse `POST /ocr/extract` :

```json
{
  "engine": "paddleocr",
  "engineVersion": "3.0.0",
  "processedAt": "2026-02-01T10:00:00Z",
  "pages": 1,
  "confidence": 0.94,
  "rawText": "Proximus SA\nTVA BE 0202.239.951\n…",
  "fields": {
    "supplierName":       { "value": "Proximus SA",       "confidence": 0.97 },
    "supplierVat":        { "value": "BE0202239951",      "confidence": 0.98 },
    "supplierBce":        { "value": "BE 0202.239.951",   "confidence": 0.98 },
    "invoiceNumber":      { "value": "PROX-2026-9912",    "confidence": 0.95 },
    "invoiceDate":        { "value": "2026-02-12",        "confidence": 0.94 },
    "dueDate":            { "value": "2026-03-14",        "confidence": 0.93 },
    "paymentTermsDays":   { "value": 30,                  "confidence": 0.9 },
    "iban":               { "value": "BE68539007547034",  "confidence": 0.98 },
    "structuredCommunication": { "value": "+++000/0001/23470+++", "confidence": 0.99 },
    "totalExclVat":       { "value": 245.0,               "confidence": 0.96 },
    "vatRate":            { "value": 21,                  "confidence": 0.9 },
    "vatAmount":          { "value": 51.45,               "confidence": 0.95 },
    "totalInclVat":       { "value": 296.45,              "confidence": 0.97 }
  },
  "suggestion": {
    "pcmnAccount": "616100",
    "category": "Télécom & Internet",
    "label": "Abonnements Télécom, Internet et Mobile",
    "deductibilityRate": 100,
    "deductibleVatRate": 100,
    "isInvestment": false,
    "description": null
  },
  "warnings": []
}
```

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PADDLE_LANG` | `latin` | Modèle de reconnaissance (`latin`, `fr`, `nl`…) |
| `OCR_DOC_ORIENTATION` | `1` | Classification d'orientation du document |
| `OCR_DOC_UNWARPING` | `1` | Dégauchissement du document (désactiver si lent) |
| `OCR_MAX_PAGES` | `5` | Pages PDF max analysées |
| `OCR_PDF_DPI` | `200` | DPI de rasterisation PDF |
| `OCR_MAX_UPLOAD_MB` | `15` | Taille max d'upload |
| `OCR_MAX_IMAGE_PIXELS` | `25 000 000` | Garde anti « bombe de décompression » (5000×5000) |
| `OCR_SERVICE_TOKEN` | vide (désactivé) | Jeton interne requis en header `X-OCR-Token` sur `/ocr/extract` (défense en profondeur) |
| `OCR_CORS_ORIGINS` | localhost:5173 | Origines CORS autorisées (liste CSV) |

## Sécurité (bonnes pratiques)

- **Utilisateur non-root** : le conteneur tourne sous `ocr` (uid 10001) ; le cache de modèles
  vit dans `$HOME/.paddlex` → monter le volume sur `/home/ocr/.paddlex`.
- **Réseau isolé** : le service n'est exposé sur aucun port public — seul `brabo-api` l'atteint
  sur le réseau Docker, derrière le jeton partagé `OCR_SERVICE_TOKEN`.
- **Validation du contenu** : magic bytes (PNG/JPEG/WebP/BMP/TIFF/PDF) + garde de résolution
  maximale avant tout OCR.
- **Limites** : upload ≤ 15 Mo, ≤ 5 pages PDF, 1 worker, concurrency bornée (503 au-delà).

## Observabilité

- `GET /metrics` — métriques Prometheus au format texte (compteurs par statut, histogramme
  de latence, `brabo_ocr_engine_loaded`, uptime), sans dépendance supplémentaire.
- Logs structurés : chaque requête `/ocr/*` log méthode, chemin, statut et durée.

## Tests

```bash
ocr-server/.venv/Scripts/python -m pytest ocr-server/tests -q
# 23 tests : règles belges (BCE/OGM modulo 97), parser FR/NL/EN, API (moteur stubé)
```

## Intégration BRABO

Le frontend appelle `/api/ocr/*` sur l'API Express (`server/index.js`), qui **proxifie**
vers ce service sur le réseau Docker (`OCR_SERVICE_URL=http://ocr-server:8000`).
Le service OCR n'est **jamais exposé publiquement**. Voir `deploy/README.md`.

## Pourquoi PaddleOCR et pas X ?

| Moteur | Verdict |
|---|---|
| **PaddleOCR PP-OCRv5** | 🏆 retenu — précision/serveur CPU, tables, Apache 2.0 |
| Surya OCR 2 | meilleure précision brute (layouts durs, manuscrit) mais GPL-3.0 + GPU conseillé |
| Tesseract 5 | léger mais nettement moins précis sur factures |
| Docling (IBM) | excellent pipeline parsing, mais pas un moteur OCR pur |
