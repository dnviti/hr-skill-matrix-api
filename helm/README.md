# HR Skill Matrix - Helm Chart

Questo Helm chart permette di deployare la HR Skill Matrix API su Kubernetes con supporto completo per l'autenticazione OIDC.

## Prerequisiti

- Kubernetes 1.19+
- Helm 3.8+
- Ingress Controller (nginx, traefik, etc.)
- Cert-Manager (opzionale, per TLS automatico)
- Provider OIDC configurato (es: Authentik)

## Installazione

### 1. Installazione base (senza autenticazione)

```bash
# Clona il repository
git clone https://github.com/dnviti/hr-skill-matrix-api.git
cd hr-skill-matrix-api/helm

# Installa con configurazione base
helm install hr-skill-matrix . \
  --set ingress.hosts[0].host=skill-matrix.yourdomain.com \
  --set ingress.tls[0].hosts[0]=skill-matrix.yourdomain.com
```

### 2. Installazione con autenticazione OIDC

```bash
# Installa con autenticazione abilitata
helm install hr-skill-matrix . \
  --set auth.enabled=true \
  --set auth.oidc.issuer="https://auth.yourdomain.com/application/o/hr-skill-matrix/" \
  --set auth.oidc.clientId="hr-skill-matrix" \
  --set auth.oidc.clientSecret="your-secret-key" \
  --set auth.oidc.redirectUri="https://skill-matrix.yourdomain.com/auth/callback" \
  --set ingress.hosts[0].host=skill-matrix.yourdomain.com \
  --set ingress.tls[0].hosts[0]=skill-matrix.yourdomain.com
```

### 3. Installazione con file values personalizzato

```bash
# Crea un file values personalizzato
cp values.yaml values-production.yaml

# Modifica values-production.yaml secondo le tue necessità
# Poi installa
helm install hr-skill-matrix . -f values-production.yaml
```

## Configurazione

### Parametri principali

| Parametro | Descrizione | Default |
|-----------|-------------|---------|
| `appDeployment.replicas` | Numero di repliche dell'applicazione | `1` |
| `appDeployment.skillMatrixApp.image.repository` | Repository dell'immagine Docker | `ghcr.io/dnviti/hr-skill-matrix-api` |
| `appDeployment.skillMatrixApp.image.tag` | Tag dell'immagine Docker | `latest` |
| `appDeployment.skillMatrixApp.env.APP_ENV` | Ambiente dell'applicazione | `prod` |

### Parametri autenticazione

| Parametro | Descrizione | Default |
|-----------|-------------|---------|
| `auth.enabled` | Abilita l'autenticazione OIDC | `false` |
| `auth.oidc.issuer` | URL dell'issuer OIDC | `""` |
| `auth.oidc.clientId` | Client ID dell'applicazione OIDC | `""` |
| `auth.oidc.clientSecret` | Client Secret dell'applicazione OIDC | `""` |
| `auth.oidc.redirectUri` | URL di redirect dopo l'autenticazione | `""` |
| `auth.oidc.jwt.algorithm` | Algoritmo JWT | `RS256` |
| `auth.oidc.jwt.audience` | Audience JWT (default: clientId) | `""` |

### Parametri ingress

| Parametro | Descrizione | Default |
|-----------|-------------|---------|
| `ingress.enabled` | Abilita l'ingress | `true` |
| `ingress.className` | Classe dell'ingress controller | `nginx` |
| `ingress.hosts[0].host` | Hostname dell'applicazione | `skill-matrix.local` |
| `ingress.tls[0].secretName` | Nome del secret TLS | `skill-matrix-tls` |

### Parametri database (MariaDB)

| Parametro | Descrizione | Default |
|-----------|-------------|---------|
| `mariadb.auth.rootPassword` | Password root di MariaDB | `changeme-root` |
| `mariadb.auth.username` | Username del database applicazione | `example_user` |
| `mariadb.auth.password` | Password del database applicazione | `example_password` |
| `mariadb.auth.database` | Nome del database applicazione | `example_db` |
| `mariadb.primary.persistence.enabled` | Abilita persistenza per MariaDB | `true` |
| `mariadb.primary.persistence.size` | Dimensione storage MariaDB | `8Gi` |

## Esempi di configurazione

### Configurazione per sviluppo

```yaml
# values-dev.yaml
auth:
  enabled: false

ingress:
  hosts:
    - host: skill-matrix.dev.local
      paths:
        - path: /
          pathType: Prefix
  tls: []

mariadb:
  auth:
    rootPassword: "dev-root-password"
    username: "dev_user"
    password: "dev_password"
    database: "skill_matrix_dev"
```

### Configurazione per produzione

```yaml
# values-prod.yaml
appDeployment:
  replicas: 3
  skillMatrixApp:
    image:
      tag: "v1.0.0"
    resources:
      limits:
        cpu: 1000m
        memory: 1Gi
      requests:
        cpu: 500m
        memory: 512Mi

auth:
  enabled: true
  oidc:
    issuer: "https://auth.company.com/application/o/hr-skill-matrix/"
    clientId: "hr-skill-matrix-prod"
    clientSecret: "super-secret-production-key"
    redirectUri: "https://skills.company.com/auth/callback"

cors:
  origins:
    - "https://skills.company.com"
    - "https://admin.company.com"

ingress:
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/rate-limit: "100"
  hosts:
    - host: skills.company.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - hosts:
        - skills.company.com
      secretName: skills-company-com-tls

mariadb:
  auth:
    rootPassword: "super-secure-root-password"
    username: "skill_matrix_user"
    password: "super-secure-app-password"
    database: "skill_matrix_prod"
  primary:
    persistence:
      enabled: true
      size: 50Gi
      storageClass: "ssd"
```

## Gestione dei segreti

### Opzione 1: Tramite valori Helm (non raccomandato per produzione)

```bash
helm install hr-skill-matrix . \
  --set auth.oidc.clientSecret="your-secret"
```

### Opzione 2: Secret Kubernetes esistente

Se preferisci gestire i segreti separatamente:

```yaml
# Crea il secret manualmente
apiVersion: v1
kind: Secret
metadata:
  name: hr-skill-matrix-auth-credentials
type: Opaque
data:
  OIDC_CLIENT_SECRET: <base64-encoded-secret>
```

Poi disabilita la creazione automatica del secret modificando il template.

### Opzione 3: External Secrets Operator

```yaml
# external-secret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: hr-skill-matrix-auth
spec:
  secretStoreRef:
    name: vault-backend
    kind: SecretStore
  target:
    name: hr-skill-matrix-auth-credentials
  data:
  - secretKey: OIDC_CLIENT_SECRET
    remoteRef:
      key: hr-skill-matrix
      property: oidc_client_secret
```

## Upgrade

```bash
# Upgrade alla versione più recente
helm upgrade hr-skill-matrix . -f values-production.yaml

# Upgrade con nuovi valori
helm upgrade hr-skill-matrix . \
  --set appDeployment.skillMatrixApp.image.tag=v1.1.0
```

## Troubleshooting

### Verifica dello stato

```bash
# Verifica lo stato del deployment
kubectl get pods -l app=skill-matrix-app

# Verifica i logs
kubectl logs -l app=skill-matrix-app -f

# Verifica la configurazione
kubectl describe configmap
kubectl describe secret
```

### Problemi comuni

1. **Pod in CrashLoopBackOff**
   - Verifica le variabili d'ambiente
   - Controlla i logs per errori di configurazione
   - Verifica la connettività al database

2. **Errori di autenticazione**
   - Verifica che `OIDC_ISSUER` sia corretto
   - Controlla che `OIDC_REDIRECT_URI` corrisponda al dominio dell'ingress
   - Verifica che il client secret sia corretto

3. **Problemi di connessione database**
   - Verifica che MariaDB sia in running
   - Controlla le credenziali del database
   - Verifica la connettività di rete

### Debug dell'autenticazione

```bash
# Testa la configurazione OIDC
kubectl exec -it deployment/hr-skill-matrix-app-deployment -- curl http://localhost:8000/auth/config

# Testa la discovery OIDC
curl https://your-auth-provider/.well-known/openid_configuration
```

## Sicurezza

### Raccomandazioni per la produzione

1. **Non utilizzare credenziali di default**
2. **Abilitare TLS per tutti i servizi**
3. **Utilizzare un sistema di gestione segreti dedicato**
4. **Configurare Network Policies**
5. **Abilitare Pod Security Standards**
6. **Limitare le risorse dei container**
7. **Configurare health checks appropriati**

### Network Policies esempio

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: hr-skill-matrix-netpol
spec:
  podSelector:
    matchLabels:
      app: skill-matrix-app
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-system
  egress:
  - to:
    - podSelector:
        matchLabels:
          app.kubernetes.io/name: mariadb
  - to: []
    ports:
    - protocol: TCP
      port: 443  # HTTPS per OIDC
    - protocol: TCP
      port: 53   # DNS
    - protocol: UDP
      port: 53   # DNS
```

## Monitoraggio

### Prometheus metrics

L'applicazione espone metriche Prometheus di default. Per abilitare lo scraping:

```yaml
# values.yaml
appDeployment:
  skillMatrixApp:
    annotations:
      prometheus.io/scrape: "true"
      prometheus.io/port: "8000"
      prometheus.io/path: "/metrics"
```

### Health checks

```yaml
# Aggiungi health checks al deployment
livenessProbe:
  httpGet:
    path: /api/health
    port: 8000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /api/health
    port: 8000
  initialDelaySeconds: 5
  periodSeconds: 5
```
