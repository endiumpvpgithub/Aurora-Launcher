# Serveur Minecraft local (géré) — Aurora

Cette fonctionnalité permet de **créer et gérer un serveur Minecraft vanilla local** depuis l’UI du launcher.

## Ce que fait le launcher (MVP)
- Télécharge le `server.jar` **officiel** de Mojang pour la version choisie (via le manifest officiel).
- Crée le dossier du serveur, initialise `eula.txt` et `server.properties`.
- Permet d’accepter/refuser l’EULA, démarrer/arrêter, envoyer des commandes console.
- Affiche un ping local et un extrait (“tail”) des logs.

## EULA (obligatoire)
Le serveur Minecraft exige l’acceptation de l’EULA avant tout démarrage.
- Le launcher écrit `eula=true` dans `eula.txt` uniquement si vous cliquez **Accepter EULA**.
- L’utilisateur reste responsable de la conformité (voir https://aka.ms/MinecraftEULA).

## Emplacement des serveurs
Les serveurs sont stockés dans le répertoire de données de l’application :
- `…/AuroraLauncher/servers/<id>/`

Depuis l’UI, utilisez **Ouvrir dossier**.

## Configuration rapide
Le launcher modifie quelques clés de `server.properties` :
- `motd`
- `max-players`
- `online-mode`
- `server-port`

Pour des réglages avancés, éditez directement `server.properties` dans le dossier du serveur.

## Limitations actuelles
- Vanilla uniquement (pas encore d’installation Forge/Fabric côté serveur).
- Le mapping “version MC -> Java requis” côté serveur est minimal (Java 17 par défaut actuellement).
- Gestion multi-serveurs : démarrage/arrêt basique, pas encore de suppression/backup UI.

