from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
import os
from dotenv import load_dotenv

# Carica le variabili d'ambiente
load_dotenv()

# 1. Importa i router delle API
from .routers import resources, skills, business_units
from .database import engine, Base

# Crea le tabelle nel database
Base.metadata.create_all(bind=engine)

# Inizializzazione condizionale dell'app
APP_ENV = os.getenv("APP_ENV", "dev")
fastapi_kwargs = {
    "title": "VarGroup Skill Matrix API",
    "description": "Backend unificato per la gestione delle competenze.",
    "version": "3.0.0",
}
if APP_ENV == "prod":
    fastapi_kwargs["docs_url"] = None
    fastapi_kwargs["redoc_url"] = None

app = FastAPI(**fastapi_kwargs)

# Configurazione CORS
origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Includi i router dell'API
app.include_router(resources.router)
app.include_router(skills.router)
app.include_router(business_units.router)

# --- MODIFICA CHIAVE: NUOVO METODO PER SERVIRE IL FRONTEND ---

# Definisci il percorso della cartella 'static' che contiene index.html
static_files_dir = os.path.join(os.path.dirname(__file__), "static")

# Crea una classe personalizzata per servire sempre index.html quando un file non viene trovato.
# Questo è essenziale per il corretto funzionamento delle Single Page Applications.
class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        try:
            # Prova a servire il file richiesto (es. /favicon.ico)
            return await super().get_response(path, scope)
        except (StarletteHTTPException, FileNotFoundError):
            # Se il file non viene trovato (errore 404), servi l'index.html
            # Questo permette al routing del frontend di funzionare correttamente.
            return FileResponse(os.path.join(str(self.directory), "index.html"))

@app.get("/api/health", tags=["Health Check"])
def health_check():
    """Endpoint di health check per verificare che l'API sia attiva."""
    return {"status": "ok"}

# Monta la cartella statica alla radice dell'applicazione.
# Questa riga deve essere DOPO l'inclusione dei router API.
# Qualsiasi richiesta che non corrisponde a un'API verrà gestita da qui.
app.mount("/", SPAStaticFiles(directory=static_files_dir, html=True), name="static")
