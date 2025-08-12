from fastapi import APIRouter, Request, HTTPException, status, Depends
from fastapi.responses import RedirectResponse, JSONResponse, Response
from typing import Dict, Any
import httpx
import logging
from urllib.parse import urlencode
from ..auth import auth_service, UserInfo, get_current_user
from pydantic import BaseModel
from typing import Optional

# Logger per il router di autenticazione
logger = logging.getLogger("skill-matrix.auth")

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/login")
async def login(redirect_uri: str = None):
    """Inizia il flusso di autenticazione OIDC"""
    if not auth_service.config.oidc_enabled:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Autenticazione OIDC non abilitata"}
        )
    
    # Assicura che il discovery sia stato fatto per avere gli URL corretti
    await auth_service.ensure_discovery_initialized()
    
    # Salva l'URL di redirect in un cookie o parametro state (per semplicità usiamo state)
    state_value = "random_state_value"
    if redirect_uri:
        # In produzione dovresti validare l'URL e usare una sessione sicura
        state_value = f"redirect:{redirect_uri}"
    
    # Parametri per l'autorizzazione OAuth2
    params = {
        "client_id": auth_service.config.oidc_client_id,
        "response_type": "code",
        "scope": "openid email profile",
        "redirect_uri": auth_service.config.oidc_redirect_uri,
        "state": state_value
    }
    
    auth_url = f"{auth_service.config.oidc_auth_url}?{urlencode(params)}"
    
    logger.info(f"Redirect a provider OIDC")
    logger.debug(f"Authorization URL: {auth_service.config.oidc_auth_url}")
    
    return RedirectResponse(url=auth_url, status_code=status.HTTP_302_FOUND)


@router.get("/callback")
async def auth_callback(code: str = None, state: str = None, error: str = None):
    """Gestisce il callback di autenticazione da Authentik"""
    logger.debug(f"Callback - code: {'✓' if code else '✗'}, state: {state}, error: {error}")
    
    if not auth_service.config.oidc_enabled:
        logger.warning("OIDC non abilitato")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Autenticazione OIDC non abilitata"}
        )
    
    if error:
        logger.error(f"Errore da provider OIDC: {error}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Errore di autenticazione: {error}"
        )
    
    if not code:
        logger.warning("Codice di autorizzazione mancante")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Codice di autorizzazione mancante"
        )
    
    try:
        logger.debug("Scambio code -> token...")
        
        # Scambia il codice con un token
        token_data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": auth_service.config.oidc_redirect_uri,
            "client_id": auth_service.config.oidc_client_id,
            "client_secret": auth_service.config.oidc_client_secret,
        }
        
        logger.debug(f"Chiamando token endpoint: {auth_service.config.oidc_token_url}")
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                auth_service.config.oidc_token_url,
                data=token_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10.0
            )
            
            print(f"🔄 Token response status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"❌ Errore token response: {response.text}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Errore dal provider OIDC: {response.text}"
                )
                
            response.raise_for_status()
            
            tokens = response.json()
            print(f"🔄 Token ricevuti: access_token={'✓' if tokens.get('access_token') else '✗'}, id_token={'✓' if tokens.get('id_token') else '✗'}")
            
            access_token = tokens.get("access_token")
            id_token = tokens.get("id_token")
            
            if not access_token or not id_token:
                print(f"❌ Token mancanti nel response: {tokens}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Token di accesso o ID token mancante"
                )
            
            print("🔄 Verifica ID token...")
            # Verifica l'ID token e ottieni le informazioni dell'utente
            user_info = await auth_service.verify_token(id_token)
            print(f"✅ Token verificato per utente: {user_info.email}")
            
            # Gestisci il redirect post-login - sempre alla home
            redirect_url = "/"
            if state and state.startswith("redirect:"):
                # Estrai l'URL di redirect dal parametro state
                custom_redirect = state[9:]  # Rimuovi "redirect:"
                # In produzione, valida che l'URL sia sicuro (stesso dominio, etc.)
                # Per ora usiamo sempre la home per sicurezza
                if custom_redirect.startswith("/") and not custom_redirect.startswith("//"):
                    redirect_url = custom_redirect
            
            logger.debug(f"Creando pagina HTML di redirect verso: {redirect_url}")
            
            # Crea una pagina HTML che salva il token e fa redirect istantaneo alla home
            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>Login Completato</title>
                <meta http-equiv="refresh" content="0;url={redirect_url}">
                <style>
                    body {{
                        margin: 0;
                        padding: 0;
                        background: #1a1a1a;
                        color: #e0e0e0;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        opacity: 0;
                        transition: opacity 0.3s ease;
                    }}
                    .container {{
                        text-align: center;
                        padding: 2rem;
                    }}
                    .spinner {{
                        width: 24px;
                        height: 24px;
                        border: 2px solid #333;
                        border-top: 2px solid #4f46e5;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin: 1rem auto;
                    }}
                    @keyframes spin {{
                        0% {{ transform: rotate(0deg); }}
                        100% {{ transform: rotate(360deg); }}
                    }}
                    @media (prefers-color-scheme: light) {{
                        body {{
                            background: #f8f9fa;
                            color: #333;
                        }}
                        .spinner {{
                            border: 2px solid #e0e0e0;
                            border-top: 2px solid #4f46e5;
                        }}
                    }}
                </style>
                <script>
                    // Salva il token nel localStorage
                    localStorage.setItem('access_token', '{access_token}');
                    localStorage.setItem('id_token', '{id_token}');
                    localStorage.setItem('user_info', JSON.stringify({user_info.dict()}));
                    
                    // Mostra la pagina con una fade-in soft
                    window.addEventListener('load', function() {{
                        document.body.style.opacity = '1';
                    }});
                    
                    // Redirect immediato ma soft
                    setTimeout(function() {{
                        window.location.replace('{redirect_url}');
                    }}, 150);
                </script>
            </head>
            <body>
                <div class="container">
                    <p>Accesso completato...</p>
                    <div class="spinner"></div>
                </div>
            </body>
            </html>
            """
            
            print("✅ Ritornando pagina HTML di callback")
            return Response(content=html_content, media_type="text/html")
            
    except httpx.HTTPError as e:
        print(f"❌ HTTPError nel callback: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Errore nella comunicazione con il provider OIDC: {str(e)}"
        )
    except Exception as e:
        print(f"❌ Errore generico nel callback: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Errore durante l'autenticazione: {str(e)}"
        )


@router.get("/userinfo")
async def get_user_info(current_user: UserInfo = Depends(get_current_user)):
    """Restituisce le informazioni dell'utente corrente"""
    return current_user


class LogoutRequest(BaseModel):
    id_token_hint: Optional[str] = None

@router.post("/logout")
async def logout(request: Request, body: LogoutRequest):
    """Gestisce il logout in modo sicuro, invalidando la sessione OIDC."""
    if not auth_service.config.oidc_enabled:
        return JSONResponse(content={"message": "Logout completato (modalità dev)"})

    await auth_service.ensure_discovery_initialized()
    
    # L'URL di fine sessione standard OIDC
    end_session_endpoint = auth_service.config.oidc_end_session_url
    if not end_session_endpoint:
        logger.error("L'endpoint di fine sessione non è definito nel discovery OIDC.")
        return JSONResponse(status_code=500, content={"error": "Logout non configurato correttamente."})

    # L'URL a cui l'utente sarà reindirizzato dopo il logout
    # Deve essere registrato come "Post-logout Redirect URI" in Authentik
    post_logout_redirect_uri = str(request.base_url)

    params = {
        "id_token_hint": body.id_token_hint,
        "post_logout_redirect_uri": post_logout_redirect_uri,
        "client_id": auth_service.config.oidc_client_id, # Aggiunto per maggiore compatibilità
    }
    
    # Rimuovi parametri nulli
    params = {k: v for k, v in params.items() if v is not None}

    logout_url = f"{end_session_endpoint}?{urlencode(params)}"
    
    logger.info(f"Logout URL generato: {logout_url}")
    
    return JSONResponse(content={
        "message": "Logout in corso",
        "logout_url": logout_url
    })


@router.get("/perform_logout")
async def perform_logout(request: Request, id_token_hint: Optional[str] = None):
    """
    Questo endpoint costruisce l'URL di logout OIDC e reindirizza l'utente.
    È un GET endpoint per semplificare il redirect dal frontend.
    """
    if not auth_service.config.oidc_enabled:
        return RedirectResponse(url="/")

    await auth_service.ensure_discovery_initialized()
    
    end_session_endpoint = auth_service.config.oidc_end_session_url
    if not end_session_endpoint:
        logger.error("L'endpoint di fine sessione non è definito nel discovery OIDC.")
        return RedirectResponse(url="/?error=logout_not_configured")

    post_logout_redirect_uri = str(request.base_url)

    params = {
        "id_token_hint": id_token_hint,
        "post_logout_redirect_uri": post_logout_redirect_uri,
        "client_id": auth_service.config.oidc_client_id,
    }
    
    params = {k: v for k, v in params.items() if v is not None}

    logout_url = f"{end_session_endpoint}?{urlencode(params)}"
    
    logger.info(f"Redirect per logout a: {logout_url}")
    
    return RedirectResponse(url=logout_url)


@router.get("/config")
async def get_auth_config():
    """Restituisce la configurazione di autenticazione per il frontend"""
    return {
        "oidc_enabled": auth_service.config.oidc_enabled,
        "login_url": "/auth/login" if auth_service.config.oidc_enabled else None,
        "logout_url": "/auth/logout" if auth_service.config.oidc_enabled else None,
    }

@router.get("/debug")
async def debug_auth_config():
    """Endpoint di debug per controllare la configurazione OIDC"""
    if not auth_service.config.oidc_enabled:
        return {"error": "OIDC non abilitato"}
    
    # Assicura che il discovery sia stato fatto
    await auth_service.ensure_discovery_initialized()
    
    # Ottieni anche la discovery response più recente
    discovery = await auth_service.get_oidc_discovery()
    
    return {
        "oidc_issuer": auth_service.config.oidc_issuer,
        "oidc_client_id": auth_service.config.oidc_client_id,
        "oidc_redirect_uri": auth_service.config.oidc_redirect_uri,
        "computed_urls": {
            "discovery_url": auth_service.config.oidc_discovery_url,
            "auth_url": auth_service.config.oidc_auth_url,
            "token_url": auth_service.config.oidc_token_url,
            "jwks_url": auth_service.config.oidc_jwks_url,
        },
        "discovery_initialized": auth_service._discovery_initialized,
        "discovery_response": discovery
    }
