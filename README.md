# Aurora Minecraft Launcher (base)

Base open-source d’un launcher Minecraft **moderne**, **multi-plateforme** et **sécurisé** :
- Windows / Linux / macOS
- Auth Microsoft (OAuth2 + Xbox Live + Minecraft Services)
- Installation automatique de Java (sans Java préinstallé)
- Support des versions Minecraft (1.0 → dernière) + loaders (Forge, NeoForge, Fabric, LegacyFabric, Quilt)
- Auto-update via GitHub Releases
- Profils, versions installées, statut serveur, news feed, maintenance distante

Ce dépôt fournit une **fondation fonctionnelle et extensible** (monorepo TypeScript) :
- `packages/core` : logique métier (auth, java, versions, lancement, remote config)
- `apps/desktop` : app Electron (UI React) sécurisée + auto-update

## Pré-requis
- Node.js >= 18.18
- (Optionnel) Un **Client ID Microsoft** pour activer le mode **Online (Microsoft)**.

## Démarrage (dev)
```bash
npm install
npm run dev
```

## Variables de configuration
Le launcher lit une config locale (fichier JSON) + variables d’environnement.

- `AURORA_MS_CLIENT_ID` : Client ID (obligatoire uniquement pour login Microsoft réel)
- `AURORA_REMOTE_CONFIG_URL` : URL JSON (news + maintenance + endpoints)

Voir `docs/AZURE_OAUTH.md` et `docs/remote-config.example.json`.
Voir aussi `docs/MANAGED_SERVER.md` pour la partie serveur local géré.

Astuce : vous pouvez aussi renseigner le Client ID directement dans l’UI (champ `msClientId`) au lieu d’une variable d’environnement.

## Mode Offline (sans Microsoft)
- Dans l’UI, bascule `Offline (pseudo)` puis définis un pseudo.
- Le launcher génère un UUID offline stable (compatible avec la convention “OfflinePlayer:<name>”).

## Serveur Minecraft local (géré) — MVP
Le launcher peut créer et gérer un serveur vanilla local :
- Télécharge automatiquement le `server.jar` officiel pour la version choisie.
- Gère l’acceptation `EULA` (obligatoire), le démarrage/arrêt, un ping local et un tail de logs.
- Expose une “configuration rapide” (MOTD, max joueurs, online-mode) et une console (commandes serveur).

Note : c’est un MVP vanilla (pas encore Forge/Fabric côté serveur), pensé pour être étendu.

## Notes légales (Mojang/Microsoft)
Ce projet ne distribue ni assets propriétaires, ni identifiants, ni secrets. Il se contente d’utiliser les endpoints publics (manifests, services) et d’exécuter Minecraft localement.

## Licence
MIT (voir `LICENSE`).
