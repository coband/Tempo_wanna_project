# Lokale Entwicklung mit Cloudflare Pages Functions

Dieses Projekt ist für die lokale Entwicklung mit Cloudflare Pages Functions und R2 Storage konfiguriert.

## Setup

1. Stelle sicher, dass du Wrangler installiert hast:
   ```
   npm install -g wrangler
   ```

2. Melde dich bei Cloudflare an (falls noch nicht geschehen):
   ```
   wrangler login
   ```

## Verfügbare Scripts

- **Lokale Entwicklung mit R2-Simulation**:
  ```
  npm run dev:cf
  ```
  Startet einen lokalen Entwicklungsserver unter http://localhost:8787 mit R2-Simulation und Node.js-Kompatibilität

- **Seedung der R2-Simulation mit Beispieldaten**:
  ```
  npm run r2:seed
  ```
  Lädt die Beispiel-PDF aus dem fixtures-Verzeichnis in den R2_BUCKET_BINDING-Bucket mit dem Schlüssel sample1.pdf

- **Remote-Entwicklung mit Preview-Bucket**:
  ```
  npm run dev:remote
  ```
  Verbindet mit dem Remote-Preview-Bucket (ohne Zugriff auf den Produktions-Bucket) und aktiviert Node.js-Kompatibilität

- **Kombinierter Start für lokale Entwicklung**:
  ```
  npm run start
  ```
  Führt r2:seed aus und startet dann den lokalen Entwicklungsserver

## R2 Storage

In der Konfiguration ist R2 Storage mit folgenden Einstellungen eingerichtet:

- **Binding**: `R2_BUCKET_BINDING` (für den Zugriff über `env.R2_BUCKET_BINDING` im Code)
- **Produktions-Bucket**: `pdfs`
- **Preview-Bucket**: `pdfs-preview`

## Wichtige Hinweise

- Die lokale Entwicklung verwendet eine Miniflare-Simulation für R2 Storage
- Achte darauf, dass du im Code `env.R2_BUCKET_BINDING` für den Zugriff auf den R2-Bucket verwendest
- Node.js-Kompatibilität ist über Befehlszeilenflags aktiviert
- Die `_routes.json` ist korrekt konfiguriert für Cloudflare Pages Functions-Routing
- Für Produktions-Deployments werden die tatsächlichen Cloudflare R2-Buckets verwendet 