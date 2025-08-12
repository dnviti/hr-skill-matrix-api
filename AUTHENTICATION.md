# Configurazione Autenticazione OIDC con Authentik

Questa guida spiega come configurare l'autenticazione OpenID Connect (OIDC) utilizzando Authentik nella HR Skill Matrix API.

## Panoramica

L'applicazione supporta due modalità di autenticazione:
1. **Modalità sviluppo** (`OIDC_ENABLED=false`): Utilizza un utente fittizio per lo sviluppo locale
2. **Modalità produzione** (`OIDC_ENABLED=true`): Utilizza Authentik per l'autenticazione OIDC

## Configurazione di Authentik

### 1. Creazione dell'applicazione in Authentik

1. Accedi al pannello di amministrazione di Authentik
2. Vai su **Applications** → **Applications**
3. Clicca su **Create** per creare una nuova applicazione

### 2. Configurazione del Provider OAuth2/OpenID

1. Vai su **Applications** → **Providers**
2. Clicca su **Create** e seleziona **OAuth2/OpenID Provider**
3. Configura i seguenti parametri:
   - **Name**: `HR Skill Matrix`
   - **Client Type**: `Confidential`
   - **Client ID**: Genera automaticamente o imposta manualmente (es: `hr-skill-matrix`)
   - **Client Secret**: Genera automaticamente
   - **Redirect URIs**: `http://localhost:8000/auth/callback` (per sviluppo) o `https://your-domain.com/auth/callback` (per produzione)
   - **Scopes**: `openid email profile`
   - **Subject mode**: `Based on the User's ID`
   - **Include claims in id_token**: Abilitato

### 3. Collegamento dell'applicazione al provider

1. Torna su **Applications** → **Applications**
2. Modifica l'applicazione creata al punto 1
3. Imposta il **Provider** sul provider OAuth2 creato al punto 2
4. Configura:
   - **Launch URL**: `http://localhost:8000` (o il tuo dominio in produzione)
   - **Icon**: Opzionale

## Configurazione delle variabili d'ambiente

Copia il file `.env.example` in `.env` e configura le seguenti variabili:

```bash
# Abilita l'autenticazione OIDC
OIDC_ENABLED=true

# URL dell'issuer di Authentik
# Formato: https://[AUTHENTIK_DOMAIN]/application/o/[SLUG_APPLICAZIONE]/
OIDC_ISSUER=https://auth.example.com/application/o/hr-skill-matrix/

# Client ID dell'applicazione configurata in Authentik
OIDC_CLIENT_ID=hr-skill-matrix

# Client Secret dell'applicazione configurata in Authentik
OIDC_CLIENT_SECRET=your-super-secret-key

# URL di redirect dopo l'autenticazione
OIDC_REDIRECT_URI=http://localhost:8000/auth/callback

# Configurazione JWT (normalmente non necessario modificare)
JWT_ALGORITHM=RS256
JWT_AUDIENCE=hr-skill-matrix
```

## Flusso di autenticazione

### 1. Login
- **Endpoint**: `GET /auth/login`
- **Descrizione**: Reindirizza l'utente alla pagina di login di Authentik
- **Risposta**: Redirect HTTP 302 verso Authentik

### 2. Callback
- **Endpoint**: `GET /auth/callback`
- **Parametri**: `code`, `state`
- **Descrizione**: Gestisce il callback da Authentik e scambia il codice con i token
- **Risposta**: JSON con informazioni utente e token

### 3. Informazioni utente
- **Endpoint**: `GET /auth/userinfo`
- **Autenticazione**: Bearer token richiesto
- **Descrizione**: Restituisce le informazioni dell'utente autenticato

### 4. Logout
- **Endpoint**: `GET /auth/logout`
- **Descrizione**: Fornisce l'URL per il logout da Authentik

### 5. Configurazione
- **Endpoint**: `GET /auth/config`
- **Descrizione**: Restituisce la configurazione di autenticazione per il frontend

## Autorizzazione

L'applicazione implementa due livelli di autorizzazione:

### Utente autenticato (`get_current_user`)
- Può visualizzare risorse e competenze
- Può accedere alle proprie informazioni

### Amministratore (`get_current_admin_user`)
- Può creare, modificare ed eliminare risorse
- Può gestire competenze e business unit
- Può accedere a tutte le funzionalità amministrative

### Configurazione gruppi/ruoli amministratore

Un utente è considerato amministratore se appartiene a uno dei seguenti gruppi o ruoli:
- Gruppi: `admin`, `administrators`, `hr-admin`
- Ruoli: `admin`, `administrator`, `hr-admin`

Configura questi gruppi/ruoli in Authentik secondo le tue necessità.

## Modalità sviluppo

Quando `OIDC_ENABLED=false`, l'applicazione utilizza un utente fittizio:
- **Email**: `dev@example.com`
- **Nome**: `Sviluppatore`
- **Gruppi**: `["admin"]`
- **Privilegi**: Amministratore completo

Questa modalità è utile per lo sviluppo locale senza dover configurare Authentik.

## Sicurezza

### Raccomandazioni per la produzione:

1. **Usa HTTPS**: Assicurati che tutti gli URL utilizzino HTTPS in produzione
2. **Client Secret sicuro**: Genera un client secret forte e mantienilo segreto
3. **Redirect URI specifici**: Non utilizzare wildcard nei redirect URI
4. **Rotazione dei secret**: Implementa una rotazione periodica dei client secret
5. **Monitoring**: Monitora i tentativi di autenticazione e gli accessi

### Variabili d'ambiente sensibili:
- `OIDC_CLIENT_SECRET`: Non committare mai questa variabile nel repository
- `DATABASE_URL`: Contiene credenziali del database
- Usa un servizio di gestione segreti in produzione (es: Azure Key Vault, AWS Secrets Manager)

## Troubleshooting

### Errori comuni

1. **"Token JWT non valido"**
   - Verifica che `OIDC_ISSUER` sia corretto
   - Controlla che l'orario del server sia sincronizzato
   - Verifica che il client ID e audience corrispondano

2. **"Chiave pubblica non trovata"**
   - Verifica la connettività verso l'endpoint JWKS di Authentik
   - Controlla che l'URL dell'issuer sia corretto

3. **"Redirect URI mismatch"**
   - Verifica che `OIDC_REDIRECT_URI` corrisponda esattamente a quello configurato in Authentik
   - Controlla la presenza/assenza di trailing slash

4. **"Accesso negato: privilegi di amministratore richiesti"**
   - Verifica che l'utente appartenga ai gruppi/ruoli amministratore corretti
   - Controlla la configurazione dei gruppi in Authentik

### Debug

Per debug più dettagliato, puoi:
1. Abilitare i log di debug in FastAPI
2. Controllare i log di Authentik
3. Verificare i token JWT su [jwt.io](https://jwt.io)

## Testing

### Test dell'autenticazione

```bash
# Test della configurazione
curl http://localhost:8000/auth/config

# Test del login (in modalità dev)
curl http://localhost:8000/auth/userinfo

# Test di un endpoint protetto
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8000/api/resources
```

## Esempi di integrazione frontend

### JavaScript/React

```javascript
// Controlla la configurazione di auth
const authConfig = await fetch('/auth/config').then(r => r.json());

if (authConfig.oidc_enabled) {
  // Autenticazione OIDC abilitata
  window.location.href = '/auth/login';
} else {
  // Modalità sviluppo
  const userInfo = await fetch('/auth/userinfo').then(r => r.json());
  console.log('User:', userInfo);
}

// Uso del token per le API
const response = await fetch('/api/resources', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

### Gestione del token

```javascript
// Salva il token dopo il callback
localStorage.setItem('accessToken', data.access_token);

// Usa il token nelle chiamate API
const token = localStorage.getItem('accessToken');
```
