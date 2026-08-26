#!/bin/bash
# Verify extract through the proxy with the NOW-CORRECTED token (post-fix).
set -u

BT=$(grep -oP '(?<=BRABO_API_TOKEN=).*' /docker/brabo-api/.env | tr -d "'\"" | head -c 200 | grep -v OCR_SERVICE_TOKEN || true)
# grab only the token part (no OCR_SERVICE_TOKEN concatenation)
BT=$(grep '^BRABO_API_TOKEN=' /docker/brabo-api/.env | sed 's/^BRABO_API_TOKEN=//' | tr -d "'\"")
echo "token prefix: ${BT:0:8}… len=${#BT}"

echo "=== health (correct token) ==="
curl -s -w " -> HTTP=%{http_code}\n" -H "X-BRABO-Token: $BT" https://api.brabo.clixite-prod.cloud/api/ocr/health
echo
echo "=== extract (correct token) ==="
docker exec brabo-ocr sh -c "cp /tmp/facture.png /tmp/facture2.png 2>/dev/null" 2>/dev/null
docker cp brabo-ocr:/tmp/facture.png /tmp/facture.png 2>/dev/null
CODE=$(curl -s -w '%{http_code}' -H "X-BRABO-Token: $BT" -F 'file=@/tmp/facture.png' \
  https://api.brabo.clixite-prod.cloud/api/ocr/extract -o /tmp/e.json)
echo "extract HTTP=$CODE"
python3 -c "
import json
r = json.load(open('/tmp/e.json'))
f = r.get('fields') or {}
print('conf:', r.get('confidence'), '| supplier:', f.get('supplierName',{}).get('value'), '| incl:', f.get('totalInclVat',{}).get('value'), '| pcmn:', (r.get('suggestion') or {}).get('pcmnAccount'))
" 2>/dev/null || echo "body: $(head -c 200 /tmp/e.json)"
