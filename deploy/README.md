# BRABO — Déploiement Hostinger VPS
Ce dossier contient la configuration de déploiement (non secrète) pour le sous-domaine
`brabo.clixite-prod.cloud` sur le VPS Hostinger (KVM 8 — 76.13.46.55, Ubuntu 24.04).

## Architecture
- **Traefik v3.3** (reverse proxy) — routes les sous-domaines via des fichiers de config
  dynamiques dans `/docker/traefik-svsx/config/*.yml`.
- **Nginx (nginx:alpine)** — conteneur `brabo-web` qui sert les fichiers statiques du build Vite.
- **Réseau Docker `proxy`** — réseau partagé entre Traefik et les conteneurs applicatifs.

## Fichiers
| Fichier | Destination sur le VPS |
|---|---|
| `brabo.yml` | `/docker/traefik-svsx/config/brabo.yml` (routage Traefik + TLS Let's Encrypt) |
| `brabo.nginx.conf` | `/etc/nginx/sites-available/brabo.clixite-prod.cloud` (SPA + gzip + cache) |
| `docker-compose.yml` | `/docker/brabo/docker-compose.yml` (conteneur nginx `brabo-web` + `ocr-server`) |
| `dist/` (build local) | `/var/www/brabo.clixite-prod.cloud/dist/` (fichiers statiques) |
| `ocr-server/` (dossier) | `/docker/brabo/ocr-server/` (source du service OCR) |

## OCR serveur (auto-hébergé)

Le service `ocr-server` (FastAPI + PaddleOCR PP-OCRv5, CPU) tourne sur le réseau Docker
`brabo-internal` (avec `brabo-api` et `brabo-db`) et n'est **jamais exposé publiquement** :
le frontend appelle `/api/ocr/*` sur `api.brabo…` (Express), qui proxifie vers
`http://ocr-server:8000` en envoyant le jeton interne `X-OCR-Token`.

1. Copier la source OCR sur le VPS :
   ```bash
   scp -r ocr-server root@76.13.46.55:/docker/brabo-ocr/ocr-server
   scp deploy/brabo-ocr-compose.yml root@76.13.46.55:/docker/brabo-ocr/docker-compose.yml
   ```
2. Générer un jeton interne et le partager entre les deux services :
   ```bash
   openssl rand -hex 24   # -> <TOKEN>
   # /docker/brabo-ocr/.env    : OCR_SERVICE_TOKEN=<TOKEN>
   # /docker/brabo-api/.env    : OCR_SERVICE_TOKEN=<TOKEN>
   ```
3. Reconstruire et redémarrer :
   ```bash
   ssh root@76.13.46.55 "cd /docker/brabo-ocr && docker compose up -d --build"
   ssh root@76.13.46.55 "cd /docker/brabo-api && docker compose up -d --build"
   ```

Vérification : `curl http://localhost:8000/ocr/health` sur le VPS, puis dans BRABO le badge
« OCR serveur en ligne » dans le modal Scanner une dépense. Métriques : `GET /metrics`
sur le conteneur OCR.

## Déploiement
```bash
# 1. Construire le bundle de production
npm run build

# 2. Créer les répertoires distants
ssh root@76.13.46.55 "mkdir -p /var/www/brabo.clixite-prod.cloud/dist /etc/nginx/sites-available /docker/brabo"

# 3. Uploader les fichiers statiques
scp -r dist/* root@76.13.46.55:/var/www/brabo.clixite-prod.cloud/dist/

# 4. Uploader les configs
scp deploy/brabo.yml root@76.13.46.55:/docker/traefik-svsx/config/brabo.yml
scp deploy/brabo.nginx.conf root@76.13.46.55:/etc/nginx/sites-available/brabo.clixite-prod.cloud
scp deploy/docker-compose.yml root@76.13.46.55:/docker/brabo/docker-compose.yml
scp -r ocr-server root@76.13.46.55:/docker/brabo/ocr-server

# 5. Démarrer les conteneurs
ssh root@76.13.46.55 "cd /docker/brabo && docker compose up -d"
```

Traefik surveille `/docker/traefik-svsx/config/` (watch=true) : la config est prise en compte
automatiquement et le certificat Let's Encrypt est émis/renouvelé sans redémarrage.

Le DNS `*.clixite-prod.cloud` pointe déjà vers `76.13.46.55` (wildcard), donc aucune action DNS n'est nécessaire.
