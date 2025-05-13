#!/bin/bash

# Verzeichnis festlegen
FIXTURES_DIR="./fixtures"
BUCKET_NAME="R2_BUCKET_BINDING"

# Prüfen, ob das Verzeichnis existiert
if [ ! -d "$FIXTURES_DIR" ]; then
  echo "Verzeichnis $FIXTURES_DIR nicht gefunden!"
  exit 1
fi

# Anzahl der hochgeladenen Dateien zählen
COUNT=0

# Alle PDFs im Verzeichnis finden und hochladen
for PDF_FILE in "$FIXTURES_DIR"/*.pdf; do
  if [ -f "$PDF_FILE" ]; then
    # Dateiname extrahieren (ohne Pfad)
    FILENAME=$(basename "$PDF_FILE")
    
    echo "Lade $FILENAME hoch..."
    wrangler r2 object put "$BUCKET_NAME/$FILENAME" --file="$PDF_FILE"
    
    if [ $? -eq 0 ]; then
      ((COUNT++))
      echo "✅ $FILENAME erfolgreich hochgeladen."
    else
      echo "❌ Fehler beim Hochladen von $FILENAME."
    fi
  fi
done

echo "------------------------"
echo "✅ $COUNT PDF-Dateien wurden in den R2-Bucket '$BUCKET_NAME' hochgeladen."
echo "------------------------" 