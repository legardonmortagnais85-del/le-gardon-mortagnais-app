# Street Fishing Mortagne 2027

Projet de site de concours de pêche et de jeu de pêche multijoueur dans un univers arcade inspiré du street fishing.

- Site public : https://street-fishing-mortagne-2027.pages.dev/
- Langues : français
- Technologies : HTML, CSS, JavaScript ; Cloudflare Pages/Worker (jeu et API) ; Supabase (comptes et gestion du concours)

## Organisation du dépôt

- `index.html`, `app-78.js`, `app-78.css` : application concours
- `jeu/` : interface et logique du jeu
- `_worker.js`, `_routes.json`, `_headers` : partie Cloudflare
- `supabase/functions/` : fonctions serveur Supabase
- `*.sql` : scripts pour la base de données (à exécuter manuellement et après vérification)
- `tests/` : tests automatisés
- `LIRE-MOI.txt` et `INSTALLATION-IA.md` : documentation historique de déploiement

## Tester

Les pages statiques peuvent être examinées localement. Le multijoueur et les fonctions serveur nécessitent leur configuration Cloudflare/Supabase.

Un environnement Node.js compatible peut exécuter les tests :

```bash
node tests/test-gameplay-v166.mjs
node --experimental-strip-types tests/test-ai.mjs
node --experimental-strip-types tests/test-guided-ai-v170.mjs
```

Le code de l'application est fourni dans son état v193 ; ces fichiers GitHub n'ont pas modifié le fonctionnement du jeu.

## Confidentialité et publication

Ne jamais ajouter de mot de passe, de clé serveur, de jeton privé ou de fichier `.env` au dépôt. Les secrets doivent rester dans les paramètres de Supabase ou Cloudflare. Une clé Supabase *publishable* prévue pour le navigateur est différente d'une clé secrète `service_role`.

**Licence : MIT** pour le code original publié par ses ayants droit (voir `LICENSE`). Cette licence autorise aussi l’utilisation, la modification et la redistribution commerciales, sous réserve de conserver l’avis de licence. Les logos, photos, cartes, fonds cartographiques et composants tiers ne deviennent pas libres de droits pour autant : voir `DROITS-DES-RESSOURCES.md`.

Consulter `GUIDE-GITHUB.md` avant toute publication.
