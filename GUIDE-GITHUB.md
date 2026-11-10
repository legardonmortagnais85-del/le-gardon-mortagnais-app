# Guide de publication GitHub — Street Fishing v193

## Résultat du contrôle du ZIP d'origine

- 165 entrées (fichiers et dossiers), 7,3 Mo compressés ; structure valide.
- Pages HTML, scripts, images, Cloudflare et Supabase présents.
- Références locales des deux pages HTML vérifiées : aucun chemin local manquant.
- 28 tests automatisés réussis en local ; deux nécessitent `node --experimental-strip-types` sous Node.js 22.
- Aucun fichier `.env`, clé privée PEM ni clé API privée évidente détectée par la recherche de motifs connus.
- Ceci n'est **pas** un audit de sécurité complet et ne garantit pas qu'un dépôt, une application tierce ou un compte sera accepté par GitHub.

## Pour mettre le projet sur GitHub

1. **Ne transférez pas le ZIP seul.** Décompressez-le puis publiez le contenu du dossier.
2. GitHub limite à 100 fichiers par envoi depuis un navigateur : faites plusieurs envois ou utilisez GitHub Desktop pour publier le projet complet.
3. Pour une première mise en ligne, préférez un dépôt **privé** avant de vérifier la confidentialité et les droits sur les images.
4. Vérifiez que les éventuelles clés utilisées dans Cloudflare ou Supabase sont des variables secrètes serveur et ne sont pas intégrées au dépôt.
5. Le fichier `LICENSE` contient la **licence MIT** : le code original peut être utilisé, modifié et redistribué, même commercialement. Avant la publication, vérifiez que vous avez le droit de publier ce code et lisez `DROITS-DES-RESSOURCES.md` pour les cartes, photos, logos et composants tiers.

## Compte GitHub signalé

Si le compte existant affiche « This account is flagged, and therefore cannot authorize a third party application », le problème est lié au statut du compte. Réorganiser ce ZIP ne retire pas cette restriction. Demandez un réexamen officiel à GitHub avant de tenter un nouveau compte. GitHub encadre le nombre de comptes personnels gratuits.

## Pour la candidature Claude for Open Source

Un dépôt public documenté et sous une licence reconnue ne suffit pas à lui seul. Les critères du programme portent aussi sur l'ancienneté du compte, les contributions réelles et l'impact du projet. Ne présentez pas le dépôt comme un projet open source établi tant que les conditions ne sont pas remplies.
