# Microsoft OAuth (Azure) – Configuration

Le launcher n’embarque **aucun secret** et ne fournit pas de Client ID “partagé”.  
Vous devez créer votre propre application Azure (public client) :

## 1) Créer l’application
- Azure Portal → Entra ID (Azure AD) → *App registrations* → *New registration*
- Types de comptes : **Personal Microsoft accounts** (ou “common” si vous voulez aussi AAD)
- Notez le **Application (client) ID**

## 2) Activer le flux “mobile & desktop”
- *Authentication* → *Add a platform* → **Mobile and desktop applications**
- Ajoutez un redirect URI loopback :
  - `http://127.0.0.1` (si proposé) ou `http://localhost`
  - Dans cette base, le launcher utilise un **port aléatoire** (loopback)

## 3) Permissions (scopes)
Le launcher demande :
- `XboxLive.signin`
- `offline_access`

## 4) Définir la variable d’environnement
En dev :
- Windows PowerShell : `setx AURORA_MS_CLIENT_ID "<votre-client-id>"`
- Linux/macOS : export `AURORA_MS_CLIENT_ID="<votre-client-id>"`

Redémarrez ensuite le terminal/IDE.

