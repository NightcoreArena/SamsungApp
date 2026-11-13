# Flix Home

Écran d'accueil léger pour TV Samsung (Tizen), avec tes apps favorites et tes sources HDMI.
Une source dont l'appareil est allumé s'affiche en bleu, et l'ouvrir passe par le lecteur TV de
Samsung, ce qui garde le Mode Jeu, le mode PC, le VRR, etc.

Identifiant Tizen : `HrznHome01.Horizon`. Une nouvelle version remplace l'ancienne et garde tes
favoris et les noms de tes sources.

## Installer avec Apps2Samsung

Le paquet `.wgt` publié ici **n'est pas signé, et c'est voulu** : Apps2Samsung le signe pour ta TV
pendant l'installation, avec le certificat créé lors de ta première installation.

### Méthode conseillée : ajouter ce dépôt comme source (mises à jour automatiques)

1. Dans Apps2Samsung, ouvre le menu **⋯** du catalogue → **Ajouter une source** (ou les sources
   dans les Paramètres).
2. Colle `NightcoreArena/SamsungApp` et valide.
3. **Flix Home** apparaît dans le catalogue : installe-la. Chaque nouvelle version publiée ici y
   apparaît ensuite d'elle-même (bouton Actualiser).

### Méthode manuelle : fichier local

1. Télécharge `FlixHome-<version>.wgt` depuis la page **Releases** du dépôt.
2. Vérifie que le nom finit bien par **`.wgt`**. Si ton téléphone l'a renommé en `.zip` ou
   `.wgt.zip`, renomme-le : Apps2Samsung refuse tout autre nom.
3. Dans Apps2Samsung, page d'installation : section **Votre propre paquet → WGT / TPK**, choisis le
   fichier, puis installe.

## Développement

- `./tools/build-wgt.sh` construit `dist/FlixHome.wgt` et vérifie les fichiers, l'identifiant et
  l'absence de signature.
- Une modification de `version` dans `config.xml`, poussée sur `main`, publie automatiquement la
  release `v<version>` avec son `.wgt` (workflow `.github/workflows/release.yml`).
- `index.html` s'ouvre dans un navigateur (« Aperçu navigateur ») avec des apps et des sources simulées.

D'après [arn0-tv](https://github.com/NelsonEU/arn0-tv) (licence MIT).
