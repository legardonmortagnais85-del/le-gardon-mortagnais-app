# Analyse automatique des prises — version 168 (toise, double contrôle)

La version 168 corrige le mode de lecture : plus aucune taille ne doit être proposée si deux lectures indépendantes de la toise sont contradictoires, si les graduations autour de la queue sont illisibles ou si la bouche n'est pas au zéro. Les résultats restent purement indicatifs, jamais des mesures certifiées. **L'IA ne garantit pas la justesse d'une longueur à partir d'une photographie.**

**Attention : le ZIP Cloudflare seul ne met pas à jour l'IA.** Pour appliquer ce correctif, redéploie la fonction Supabase `analyze-catch` avec `supabase/functions/analyze-catch/index.ts`, depuis Edge Functions → analyze-catch → Code → Deploy, ou avec la CLI. Les scripts SQL 16 et 17 déjà installés n'ont pas besoin d'être rejoués.

Les tests utilisent des services simulés. Aucun appel OpenAI payant réel n'a été réalisé pendant ces corrections.

## Ce que fait l’IA

Après l’envoi d’une nouvelle prise en attente, une file de traitement déclenche son analyse. Le staff voit l’espèce proposée, la longueur estimée, un intervalle d’incertitude et les points à contrôler. L’IA ne modifie ni l’espèce déclarée, ni la taille, ni le statut de validation. « Reporter la suggestion » remplit seulement les champs du formulaire : le staff doit encore enregistrer ou valider.

Une mesure n’est pas proposée si le zéro, les graduations ou le poisson entier ne sont pas lisibles, ou si la position de la bouche n’est pas vérifiable. Même lorsque tout semble lisible, la proposition reste une estimation. L’appréciation « confiance » n’est pas une probabilité calibrée. **La version 168 effectue une seconde lecture si la première est exploitable** : jusqu’à **deux appels API par prise**, avec un coût potentiellement proche du double. Si les lectures divergent de plus de 10 mm, la longueur proposée est masquée. Les chiffres ne sont jamais copiés automatiquement dans les champs du staff. Le bouton « Vérifier sur la toise (3 repères) » permet de calculer une longueur indicative à partir de deux graduations choisies par le staff (en mm), et d’un clic sur la queue. Le staff doit vérifier la bouche contre la butée et peut refuser de reporter le calcul si la photo est floue. Les photos TEST et captures annotées ne sont pas des mesures de référence.

## 1. Base Supabase

Dans SQL Editor, exécute dans cet ordre :

1. `16-aide-ia.sql`
2. `17-file-ia-automatique.sql`

Le script 17 utilise Cron, pg_net et Vault. Si une extension n’est pas disponible, active Cron et pg_net depuis les intégrations/extensions du projet avant de relancer. Les scripts ne valident aucune prise et n’analysent pas les anciennes prises en masse.

## 2. Secrets serveur

Dans Supabase → Edge Functions → Secrets, ajoute :

| Nom | Valeur |
| --- | --- |
| `OPENAI_API_KEY` | Ta clé API OpenAI, avec du crédit API disponible |
| `OPENAI_MODEL` | `gpt-5.4` recommandé (vision en détail original et Structured Outputs, facturation API éventuellement plus élevée). Si le secret reste `gpt-4.1`, les images sont traitées en niveau `high` et les détails fins de la toise peuvent être perdus. |
| `AI_AUTOMATION_STAFF_ID` | L’identifiant UUID d’un compte staff existant |
| `AI_WEBHOOK_SECRET` | Un secret aléatoire fort, d’au moins 32 caractères |
| `ALLOWED_ORIGINS` | `https://street-fishing-mortagne-2027.pages.dev` |

Les variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont normalement fournies à la fonction par Supabase. Ne copie jamais les clés OpenAI ou service_role dans app.js, le navigateur, le ZIP ou une conversation.

Pour retrouver les identifiants des comptes staff :

```sql
SELECT user_id FROM public.staff_members;
```

Dans Supabase Vault, crée également un secret nommé **`sf_ai_webhook_secret`**, avec exactement la même valeur que `AI_WEBHOOK_SECRET`. Utilise l’interface Vault pour saisir ce secret.

## 3. Déployer la fonction serveur

Dans Supabase → Edge Functions, crée une fonction nommée exactement **`analyze-catch`**. Son fichier `index.ts` est fourni dans :

`supabase/functions/analyze-catch/index.ts`

Le fichier est autonome, sans bibliothèque à installer : tu peux le coller dans l’éditeur de fonction Supabase et le déployer.

Pour accepter les appels automatiques, désactive la vérification JWT du *gateway* pour cette fonction. Cela ne rend pas l’analyse anonyme : le code de la fonction vérifie lui-même soit un JWT valide et le rôle staff, soit le secret interne de l’automatisation. Les clés publiques ne suffisent pas pour appeler l’IA.

Avec la CLI, le fichier `supabase/config.toml` fourni configure ce comportement :

```bash
supabase functions deploy analyze-catch --project-ref poqsalgjouoznsfalagi
```

## 4. Activer dans l’application

Redéploie le contenu du ZIP sur Cloudflare Pages, puis :

**Staff → Barème et réglages → Analyse IA des prises**

- Coche « Activer l’aide IA ».
- Coche « Analyser automatiquement les nouvelles prises ».
- Choisis une limite quotidienne, puis enregistre.

Par défaut, l’IA est désactivée et la limite est de 200 appels réservés par jour UTC. Les appels au service d’IA sont payants selon ton compte API ; la limite d’appels n’est pas un plafond en euros. Configure aussi un budget/une limite de dépense dans ton compte API si nécessaire.

## 5. Vérification

Envoie une seule vraie photo avec une nouvelle prise. Dans le staff, l’analyse doit apparaître après l’actualisation. Le lancement est demandé à l’envoi ; la file est également vérifiée chaque minute pour reprendre les éléments en attente. Trois analyses au maximum tournent simultanément. La reprise après erreur est limitée à trois réservations par prise. Une erreur durable reste contrôlable avec le bouton manuel « Analyser avec l’IA ».

Les résultats sont conservés dans `catch_ai_reviews`, accessibles au staff seulement. La file est dans `catch_ai_queue`. Les résultats déjà terminés pour la même photo, le même modèle et la même version de consigne sont réutilisés. La version de consigne `toise-v2-reperes-double` force une nouvelle lecture des photos précédemment analysées (si demandée) plutôt que de réutiliser les anciennes mesures. Les échecs et délais dépassés peuvent consommer une réservation quotidienne ; l’appel facturé dépend du service API.

Une prise validée/supprimée avant son analyse automatique est retirée des traitements futurs. Le traitement ne rend aucune photo publique. Il envoie uniquement les octets de la photo à OpenAI ; aucun nom d’équipe, numéro de téléphone, e-mail ou taille déclarée n’est transmis dans la demande IA. Les instructions d’analyse utilisent `store: false`.

## Désactiver

Décoche « Analyser automatiquement » pour stopper les futurs traitements automatiques ; les tâches déjà en cours peuvent finir. Décoche « Activer l’aide IA » pour désactiver aussi les demandes manuelles. Les validations staff habituelles restent disponibles.

## Contrôles effectués

Tests locaux avec services simulés : authentification, refus des participants, secret webhook, contrôle d’origine, paramètres, résultats illisibles, cohérence des mesures, cache, format de réponse et conservation de la décision humaine. Les requêtes payantes et le déploiement de la migration dans ta base ne sont pas testés sans configuration réelle.

## Références techniques

- https://developers.openai.com/api/docs/guides/images-vision
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/models/gpt-4.1
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/functions/schedule-functions


## Mise à jour v170 : lecture automatique à deux repères

Installer le ZIP v170 sur Cloudflare Pages, PUIS remplacer le code de la fonction Edge `analyze-catch` dans Supabase par `supabase/functions/analyze-catch/index.ts` (enregistrer/déployer). Aucun SQL supplémentaire si les tables IA sont déjà installées.

Dans Espace staff → Prises à valider → « Vérifier sur la toise (2 repères) », touche 0 puis Q. L'IA reçoit la photo originale et, si le navigateur l'autorise, un aperçu avec deux cercles colorés pour guider la lecture des inscriptions physiques de la toise. Deux lectures cohérentes proposent un nombre de mm ; sinon aucune longueur n'est préremplie. Le staff peut corriger, confirme puis reporte la valeur. La prise n'est jamais validée automatiquement. Le bouton pour relancer la lecture peut engendrer un coût API.

Pour confirmer la qualité, teste plusieurs photos réelles avec des longueurs connues. L'IA n'est pas un appareil de mesure étalonné.
