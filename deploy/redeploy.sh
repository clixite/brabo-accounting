#!/bin/bash
# Redeploy: internal token (newline-safe), rebuild ocr-server + brabo-api, restart.
set -u

TOKEN=$(openssl rand -hex 24)
echo "generated token: ${TOKEN:0:6}…${TOKEN: -6}"

# Update or append a KEY=VALUE line in an env file, newline-safe.
write_env() {
  local file="$1" key="$2" value="$3"
  touch "$file"
  # ensure the file ends with a newline so we never concatenate onto the last line
  [ -n "$(tail -c1 "$file")" ] && printf '\n' >> "$file"
  grep -v "^${key}=" "$file" > "$file.tmp" || true
  mv "$file.tmp" "$file"
  printf '%s=%s\n' "$key" "$value" >> "$file"
}

write_env /docker/brabo-ocr/.env  OCR_SERVICE_TOKEN "$TOKEN"
write_env /docker/brabo-api/.env  OCR_SERVICE_TOKEN "$TOKEN"
echo "tokens written ($(grep -c '^OCR_SERVICE_TOKEN=' /docker/brabo-ocr/.env) ocr + $(grep -c '^OCR_SERVICE_TOKEN=' /docker/brabo-api/.env) api)"

echo "=== rebuilding ocr-server ==="
cd /docker/brabo-ocr && docker compose up -d --build 2>&1 | tail -4
echo "=== rebuilding brabo-api ==="
cd /docker/brabo-api && docker compose up -d --build 2>&1 | tail -4

echo "=== containers ==="
docker ps --filter name=brabo-ocr --filter name=brabo-api --format '{{.Names}} | {{.Status}}'
