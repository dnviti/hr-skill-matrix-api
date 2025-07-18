# VarGroup Skill Matrix API

Questo progetto fornisce un backend unificato per la gestione delle competenze, delle risorse umane e delle business unit. Offre API per creare, leggere, aggiornare ed eliminare (CRUD) queste entità, insieme a un'interfaccia frontend per una facile interazione.

## ✨ Caratteristiche

  * **Gestione Risorse**: Aggiungi, visualizza ed elimina dipendenti.
  * **Gestione Skill**: Crea e gestisci un elenco di competenze professionali.
  * **Gestione Business Unit**: Organizza le risorse in diverse business unit.
  * **Assegnazione Competenze**: Assegna competenze specifiche alle risorse con un livello di proficiency.
  * **Ricerca Avanzata**: Filtra le risorse in base a competenze, livello e business unit.
  * **Statistiche**: Visualizza dati aggregati come le competenze più diffuse e la distribuzione delle risorse.
  * **Frontend Integrato**: Una Single Page Application (SPA) per interagire con l'API.
  * **Containerizzazione Docker**: Semplifica il deployment sia in sviluppo che in produzione.
  * **CI/CD con GitHub Actions**: Build e push automatici dell'immagine Docker.

-----

## 🛠️ Tecnologie Utilizzate

  * **Backend**:
      * Python 3
      * FastAPI
      * SQLAlchemy
      * Uvicorn
      * Pydantic
  * **Database**:
      * SQLite (per sviluppo)
      * MariaDB (per produzione)
  * **Frontend**:
      * HTML, CSS, JavaScript
      * Tailwind CSS
      * Chart.js
  * **Deployment**:
      * Docker & Docker Compose
      * GitHub Actions

-----

## 🚀 Guida all'Avvio

### Prerequisiti

  * Docker e Docker Compose installati sulla tua macchina.
  * Git per clonare il repository.
  * Un editor di codice come VS Code.

### Installazione

1.  **Clona il repository**:

    ```bash
    git clone https://github.com/dnviti/hr-skill-matrix-api.git
    cd hr-skill-matrix-api
    ```

2.  **Crea i file di ambiente**:

      * Crea un file chiamato `.env.dev` per lo sviluppo:

        ```env
        APP_ENV=dev
        DATABASE_URL=sqlite:///./data/skill_matrix_dev.db
        ```

      * Crea un file chiamato `.env.prod` per la produzione. Sostituisci i valori con password sicure:

        ```env
        APP_ENV=prod
        DATABASE_URL=mysql+mysqlconnector://user:password@db/skill_matrix
        DB_ROOT_PASSWORD=supersecretrootpassword
        DB_DATABASE=skill_matrix
        DB_USER=user
        DB_PASSWORD=password
        ```

-----

## 🏃 Esecuzione dell'Applicazione

Puoi avviare l'applicazione in due modalità: **sviluppo** o **produzione**.

### Modalità Sviluppo 🛠️

Questa modalità utilizza un database **SQLite** e abilita il ricaricamento automatico del codice a ogni modifica.

Per avviare l'ambiente di sviluppo, esegui:

```bash
docker-compose --profile dev up --build
```

L'applicazione sarà disponibile all'indirizzo [http://localhost:8000](https://www.google.com/search?q=http://localhost:8000).

  * **API Docs**: [http://localhost:8000/docs](https://www.google.com/search?q=http://localhost:8000/docs)
  * Il database SQLite verrà salvato nella cartella `data/`.

### Modalità Produzione 🏭

Questa modalità utilizza un database **MariaDB** ed è ottimizzata per la stabilità. Include anche **Watchtower** per aggiornare automaticamente l'immagine Docker quando ne viene pubblicata una nuova.

Per avviare l'ambiente di produzione, esegui:

```bash
docker-compose --profile prod up --build -d
```

L'applicazione sarà disponibile all'indirizzo [http://localhost:8000](https://www.google.com/search?q=http://localhost:8000).

  * In produzione, la documentazione interattiva dell'API (`/docs`, `/redoc`) è disabilitata per motivi di sicurezza.
  * I dati di MariaDB sono persistenti grazie a un volume Docker.

-----

## ☁️ Deployment con Docker & GitHub Actions

Il progetto è configurato per la Continuous Integration/Continuous Deployment (CI/CD).

  * **Dockerfile**: Definisce l'ambiente per l'applicazione, installa le dipendenze da `requirements.txt` e avvia il server Uvicorn.
  * **docker-compose.yaml**:
      * Definisce due profili: `dev` e `prod`.
      * Il profilo `prod` include il database MariaDB e un servizio Watchtower per gli aggiornamenti automatici.
      * Utilizza un `healthcheck` per garantire che l'app si avvii solo dopo che il database è pronto.
  * **GitHub Actions (`.github/workflows/docker-build.yml`)**:
      * Questo workflow si attiva a ogni `push` sul branch `main`.
      * Effettua il build dell'immagine Docker e la carica su GitHub Container Registry (GHCR).
      * Watchtower, configurato nel `docker-compose.yaml` di produzione, rileverà la nuova immagine e aggiornerà automaticamente il container in esecuzione.

-----

## 📁 Struttura del Progetto

```
.
├── .github/workflows/      # Workflow di GitHub Actions
│   └── docker-build.yml
├── app/
│   ├── routers/            # Moduli delle API (endpoints)
│   │   ├── business_units.py
│   │   ├── resources.py
│   │   └── skills.py
│   ├── static/             # Frontend (HTML, CSS, JS)
│   │   ├── index.html
│   │   ├── style.css
│   │   └── main.js
│   ├── __init__.py
│   ├── crud.py             # Funzioni di interazione con il DB
│   ├── database.py         # Configurazione e sessione del DB
│   ├── main.py             # Entrypoint dell'applicazione FastAPI
│   └── models.py           # Modelli SQLAlchemy e Pydantic
├── .gitignore
├── .vscode/
│   └── launch.json
├── docker-compose.yaml
├── Dockerfile
└── requirements.txt        # Dipendenze Python
```