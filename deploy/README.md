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
| `docker-compose.yml` | `/docker/brabo/docker-compose.yml` (conteneur nginx `brabo-web`) |
| `dist/` (build local) | `/var/www/brabo.clixite-prod.cloud/dist/` (fichiers statiques) |

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

# 5. Démarrer le conteneur
ssh root@76.13.46.55 "cd /docker/brabo && docker compose up -d"
```

Traefik surveille `/docker/traefik-svsx/config/` (watch=true) : la config est prise en compte
automatiquement et le certificat Let's Encrypt est émis/renouvelé sans redémarrage.

Le DNS `*.clixite-prod.cloud` pointe déjà vers `76.13.46.55` (wildcard), donc aucune action DNS n'est nécessaire.
