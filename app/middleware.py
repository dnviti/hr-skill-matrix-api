from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import re
import logging
from typing import List
from urllib.parse import urlencode
from .auth import auth_service

# Logger per il middleware
logger = logging.getLogger("skill-matrix.middleware")


class GlobalAuthMiddleware(BaseHTTPMiddleware):
    """Middleware globale per l'autenticazione di tutta l'applicazione"""
    
    def __init__(self, app, public_paths: List[str] = None):
        super().__init__(app)
        # Percorsi pubblici che non richiedono autenticazione
        self.public_paths = public_paths or [
            # Health checks
            r"^/api/health.*",
            # Autenticazione
            r"^/auth/.*",
            # OpenAPI docs (solo in dev)
            r"^/docs.*",
            r"^/redoc.*",
            r"^/openapi\.json$",
            # Static files (frontend)
            r"^/static/.*",
            r"^/favicon\.ico$",
            r"^/$",  # Root path per servire il frontend
            # Altri asset statici
            r"^/.*\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$"
        ]
        
        # Compila le regex per performance
        self.compiled_patterns = [re.compile(pattern) for pattern in self.public_paths]
    
    def is_public_path(self, path: str) -> bool:
        """Verifica se il percorso è pubblico"""
        return any(pattern.match(path) for pattern in self.compiled_patterns)
    
    def is_api_request(self, request: Request) -> bool:
        """Verifica se è una richiesta API (per restituire JSON) o web (per redirect)"""
        # Se il path inizia con /api/ è una richiesta API
        if request.url.path.startswith("/api/"):
            return True
        
        # Se l'header Accept contiene application/json è una richiesta API
        accept_header = request.headers.get("accept", "")
        if "application/json" in accept_header and "text/html" not in accept_header:
            return True
            
        # Se c'è l'header Authorization è probabilmente una richiesta API
        if request.headers.get("authorization"):
            return True
            
        return False
    
    async def dispatch(self, request: Request, call_next) -> Response:
        """Middleware che controlla l'autenticazione per ogni richiesta"""
        
        # Log solo per debug, non per ogni richiesta in produzione
        logger.debug(f"{request.method} {request.url.path}")
        
        # Se l'autenticazione OIDC è disabilitata, lascia passare tutto
        if not auth_service.config.oidc_enabled:
            logger.debug("OIDC disabilitato, passthrough")
            return await call_next(request)
        
        # Controlla se il percorso è pubblico
        if self.is_public_path(request.url.path):
            logger.debug(f"Percorso pubblico: {request.url.path}")
            return await call_next(request)
        
        logger.debug(f"Percorso protetto, richiede autenticazione")
        
        # Per tutti gli altri percorsi, richiedi autenticazione
        try:
            # Estrai il token dall'header Authorization
            authorization = request.headers.get("Authorization")
            if not authorization or not authorization.startswith("Bearer "):
                logger.debug(f"Token mancante o malformato")
                # Nessun token - decide se fare redirect o restituire JSON
                if self.is_api_request(request):
                    # Richiesta API - restituisci JSON
                    return JSONResponse(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        content={
                            "detail": "Token di autenticazione richiesto",
                            "error": "missing_authorization_header",
                            "login_url": "/auth/login"
                        },
                        headers={"WWW-Authenticate": "Bearer"}
                    )
                else:
                    # Richiesta web - redirect al login
                    # Salva l'URL originale per il redirect post-login
                    original_url = str(request.url)
                    login_params = {
                        "redirect_uri": original_url
                    }
                    login_url = f"/auth/login?{urlencode(login_params)}"
                    return RedirectResponse(url=login_url, status_code=status.HTTP_302_FOUND)
            
            # Estrai il token
            token = authorization.split(" ", 1)[1]
            
            logger.debug("Verifica token in corso...")
            # Verifica il token
            user_info = await auth_service.verify_token(token)
            logger.info(f"Utente autenticato: {user_info.email}")
            
            # Aggiungi le informazioni dell'utente alla richiesta per uso nei router
            request.state.current_user = user_info
            
            # Procedi con la richiesta
            return await call_next(request)
            
        except HTTPException as e:
            logger.warning(f"HTTPException: {e.status_code} - {e.detail}")
            # Se c'è un errore di autenticazione
            if self.is_api_request(request):
                # Richiesta API - restituisci JSON
                return JSONResponse(
                    status_code=e.status_code,
                    content={
                        "detail": e.detail,
                        "error": "authentication_failed",
                        "login_url": "/auth/login"
                    },
                    headers={"WWW-Authenticate": "Bearer"}
                )
            else:
                # Richiesta web - redirect al login
                return RedirectResponse(url="/auth/login", status_code=status.HTTP_302_FOUND)
                
        except Exception as e:
            logger.error(f"Errore del middleware di autenticazione: {str(e)}")
            # Errore generico
            if self.is_api_request(request):
                return JSONResponse(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    content={
                        "detail": f"Errore del server durante l'autenticazione: {str(e)}",
                        "error": "server_error"
                    }
                )
            else:
                # Anche per errori generici, redirect al login
                return RedirectResponse(url="/auth/login", status_code=status.HTTP_302_FOUND)
