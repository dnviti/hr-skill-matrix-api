from fastapi import APIRouter, Request, HTTPException, status, Depends
from fastapi.responses import RedirectResponse, JSONResponse, Response
from typing import Dict, Any
import httpx
from urllib.parse import urlencode
from ..auth import auth_service, UserInfo, get_current_user

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
    
    print(f"🚀 Redirect a Authentik: {auth_url}")
    print(f"🔍 Authorization URL dal discovery: {auth_service.config.oidc_auth_url}")
    
    return RedirectResponse(url=auth_url, status_code=status.HTTP_302_FOUND)


@router.get("/callback")
async def auth_callback(code: str = None, state: str = None, error: str = None):
    """Gestisce il callback di autenticazione da Authentik"""
    print(f"Callback ricevuto - code: {'presente' if code else 'assente'}, state: {state}, error: {error}")
    
    if not auth_service.config.oidc_enabled:
        print("OIDC non abilitato")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Autenticazione OIDC non abilitata"}
        )
    
    if error:
        print(f"Errore da Authentik: {error}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Errore di autenticazione: {error}"
        )
    
    if not code:
        print("Codice di autorizzazione mancante")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Codice di autorizzazione mancante"
        )
    
    try:
        print("Inizio scambio code -> token...")
        
        # Scambia il codice con un token
        token_data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": auth_service.config.oidc_redirect_uri,
            "client_id": auth_service.config.oidc_client_id,
            "client_secret": auth_service.config.oidc_client_secret,
        }
        
        print(f"Chiamando token endpoint: {auth_service.config.oidc_token_url}")
        
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
            
            print(f"🔄 Creando pagina HTML di redirect verso: {redirect_url}")
            
            # Crea una pagina HTML che salva il token e fa redirect alla home
            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>Login Completato</title>
                <meta http-equiv="refresh" content="2;url={redirect_url}">
                <script>
                    console.log('🔄 Callback page loaded');
                    
                    // Salva il token nel localStorage
                    localStorage.setItem('access_token', '{access_token}');
                    localStorage.setItem('id_token', '{id_token}');
                    localStorage.setItem('user_info', JSON.stringify({user_info.dict()}));
                    
                    console.log('✅ Token salvati nel localStorage');
                    console.log('Login completato per:', '{user_info.email}');
                    
                    // Redirect immediato
                    setTimeout(function() {{
                        console.log('🔄 Redirecting to: {redirect_url}');
                        window.location.replace('{redirect_url}');
                    }}, 1500);
                    
                    // Backup redirect
                    window.addEventListener('load', function() {{
                        setTimeout(function() {{
                            if (window.location.href.indexOf('callback') !== -1) {{
                                console.log('🔄 Backup redirect executing...');
                                window.location.href = '{redirect_url}';
                            }}
                        }}, 3000);
                    }});
                </script>
            </head>
            <body>
                <div style="text-align: center; margin-top: 100px; font-family: Arial, sans-serif;">
                    <h2>🎉 Login completato!</h2>
                    <p>Benvenuto/a <strong>{user_info.name or user_info.email}</strong></p>
                    <p>Redirect alla home in corso...</p>
                    <div style="margin-top: 20px;">
                        <div style="display: inline-block; width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    </div>
                    <p style="margin-top: 20px; font-size: 12px; color: #666;">
                        Se il redirect non funziona automaticamente, <a href="{redirect_url}" style="color: #3498db; text-decoration: none; font-weight: bold;">clicca qui per andare alla home</a>
                    </p>
                </div>
                <style>
                    @keyframes spin {{
                        0% {{ transform: rotate(0deg); }}
                        100% {{ transform: rotate(360deg); }}
                    }}
                </style>
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
