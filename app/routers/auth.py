from fastapi import APIRouter, Request, HTTPException, status, Depends
from fastapi.responses import RedirectResponse, JSONResponse
from typing import Dict, Any
import httpx
from urllib.parse import urlencode
from ..auth import auth_service, UserInfo, get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/login")
async def login():
    """Inizia il flusso di autenticazione OIDC"""
    if not auth_service.config.oidc_enabled:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Autenticazione OIDC non abilitata"}
        )
    
    # Parametri per l'autorizzazione OAuth2
    params = {
        "client_id": auth_service.config.oidc_client_id,
        "response_type": "code",
        "scope": "openid email profile",
        "redirect_uri": auth_service.config.oidc_redirect_uri,
        "state": "random_state_value"  # In produzione usare un valore casuale sicuro
    }
    
    auth_url = f"{auth_service.config.oidc_auth_url}?{urlencode(params)}"
    
    return RedirectResponse(url=auth_url, status_code=status.HTTP_302_FOUND)


@router.get("/callback")
async def auth_callback(code: str = None, state: str = None, error: str = None):
    """Gestisce il callback di autenticazione da Authentik"""
    if not auth_service.config.oidc_enabled:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Autenticazione OIDC non abilitata"}
        )
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Errore di autenticazione: {error}"
        )
    
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Codice di autorizzazione mancante"
        )
    
    try:
        # Scambia il codice con un token
        token_data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": auth_service.config.oidc_redirect_uri,
            "client_id": auth_service.config.oidc_client_id,
            "client_secret": auth_service.config.oidc_client_secret,
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                auth_service.config.oidc_token_url,
                data=token_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10.0
            )
            response.raise_for_status()
            
            tokens = response.json()
            access_token = tokens.get("access_token")
            id_token = tokens.get("id_token")
            
            if not access_token or not id_token:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Token di accesso o ID token mancante"
                )
            
            # Verifica l'ID token e ottieni le informazioni dell'utente
            user_info = await auth_service.verify_token(id_token)
            
            # In una implementazione reale, potresti voler:
            # 1. Salvare/aggiornare l'utente nel database
            # 2. Creare una sessione
            # 3. Impostare un cookie sicuro
            
            # Per ora, restituiamo i token e le info utente
            return JSONResponse(content={
                "message": "Autenticazione completata con successo",
                "user": user_info.dict(),
                "access_token": access_token,
                "id_token": id_token,
                "token_type": "bearer"
            })
            
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Errore nella comunicazione con il provider OIDC: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Errore durante l'autenticazione: {str(e)}"
        )


@router.get("/userinfo")
async def get_user_info(current_user: UserInfo = Depends(get_current_user)):
    """Restituisce le informazioni dell'utente corrente"""
    return current_user


@router.get("/logout")
async def logout():
    """Gestisce il logout"""
    if not auth_service.config.oidc_enabled:
        return JSONResponse(content={"message": "Logout completato (modalità dev)"})
    
    # URL di logout di Authentik
    logout_url = f"{auth_service.config.oidc_issuer.rstrip('/')}/end-session/"
    
    # Parametri per il logout
    params = {
        "post_logout_redirect_uri": auth_service.config.oidc_redirect_uri.replace("/auth/callback", "/"),
    }
    
    logout_url_with_params = f"{logout_url}?{urlencode(params)}"
    
    return JSONResponse(content={
        "message": "Logout in corso",
        "logout_url": logout_url_with_params
    })


@router.get("/config")
async def get_auth_config():
    """Restituisce la configurazione di autenticazione per il frontend"""
    return {
        "oidc_enabled": auth_service.config.oidc_enabled,
        "login_url": "/auth/login" if auth_service.config.oidc_enabled else None,
        "logout_url": "/auth/logout" if auth_service.config.oidc_enabled else None,
    }
