#!/usr/bin/env bash
# Construit dist/FlixHome.wgt, un paquet Tizen non signé prêt pour Apps2Samsung
# (Apps2Samsung le signe lui-même pour ta TV au moment de l'installation).
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(sed -n 's/.*<widget[^>]*version="\([^"]*\)".*/\1/p' config.xml | head -1)
appid=$(sed -n 's/.*<tizen:application[^>]*id="\([^"]*\)".*/\1/p' config.xml | head -1)
[ -n "$version" ] || { echo "Version introuvable dans config.xml" >&2; exit 1; }
[ "$appid" = "HrznHome01.Horizon" ] || { echo "Identifiant inattendu : $appid (la mise à jour ne remplacerait pas Flix Home)" >&2; exit 1; }

# Vérifie que chaque fichier référencé existe.
for f in index.html icon.png style.css js/brands.js js/apps.js js/inputs.js js/main.js; do
  [ -f "$f" ] || { echo "Fichier manquant : $f" >&2; exit 1; }
done
if ls author-signature.xml signature*.xml >/dev/null 2>&1; then
  echo "Signature présente à la racine : supprime-la, Apps2Samsung signe lui-même." >&2; exit 1
fi

mkdir -p dist
out="dist/FlixHome.wgt"
rm -f "$out"
# -X : pas d'attributs système ; -D : pas d'entrées de dossier ; config.xml en premier.
zip -q -X -D -9 "$out" config.xml index.html icon.png style.css
zip -q -X -D -9 -r "$out" js assets
unzip -tq "$out" >/dev/null
echo "$out  (Flix Home $version, $(du -k "$out" | cut -f1) Ko)"
echo "$version" > dist/VERSION
