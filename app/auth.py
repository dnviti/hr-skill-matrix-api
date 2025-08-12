import os
import httpx
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel
from authlib.integrations.httpx_client import AsyncOAuth2Client


class AuthConfig:
    """Configurazione per l'autenticazione OIDC con Authentik"""
    
    def __init__(self):
        # Configurazione OIDC/OAuth2
        self.oidc_enabled = os.getenv("OIDC_ENABLED", "false").lower() == "true"
        self.oidc_issuer = os.getenv("OIDC_ISSUER", "")  # es: https://auth.tuodominio.com/application/o/hr-skill-matrix/
        self.oidc_client_id = os.getenv("OIDC_CLIENT_ID", "")
        self.oidc_client_secret = os.getenv("OIDC_CLIENT_SECRET", "")
        self.oidc_redirect_uri = os.getenv("OIDC_REDIRECT_URI", "http://localhost:8000/auth/callback")
        
        # Configurazione JWT
        self.jwt_algorithm = os.getenv("JWT_ALGORITHM", "RS256")
        self.jwt_audience = os.getenv("JWT_AUDIENCE", self.oidc_client_id)
        
        # URLs derivate dall'issuer
        if self.oidc_issuer:
            self.oidc_discovery_url = f"{self.oidc_issuer.rstrip('/')}/.well-known/openid_configuration"
            self.oidc_auth_url = f"{self.oidc_issuer.rstrip('/')}/auth"
            self.oidc_token_url = f"{self.oidc_issuer.rstrip('/')}/token"
            self.oidc_userinfo_url = f"{self.oidc_issuer.rstrip('/')}/userinfo"
            self.oidc_jwks_url = f"{self.oidc_issuer.rstrip('/')}/jwks"
        
        # Cache per le chiavi pubbliche
        self._jwks_cache: Optional[Dict] = None
        self._jwks_cache_expiry: Optional[datetime] = None
        
    def validate_config(self):
        """Valida la configurazione OIDC"""
        if not self.oidc_enabled:
            return True
            
        missing_vars = []
        if not self.oidc_issuer:
            missing_vars.append("OIDC_ISSUER")
        if not self.oidc_client_id:
            missing_vars.append("OIDC_CLIENT_ID")
        if not self.oidc_client_secret:
            missing_vars.append("OIDC_CLIENT_SECRET")
            
        if missing_vars:
            raise ValueError(f"Variabili d'ambiente mancanti per OIDC: {', '.join(missing_vars)}")
        
        return True


class UserInfo(BaseModel):
    """Informazioni dell'utente autenticato"""
    sub: str  # Subject identifier
    email: str
    name: Optional[str] = None
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    preferred_username: Optional[str] = None
    groups: Optional[list] = []
    roles: Optional[list] = []


class AuthService:
    """Servizio per l'autenticazione OIDC"""
    
    def __init__(self):
        self.config = AuthConfig()
        self.config.validate_config()
        self.security = HTTPBearer(auto_error=False)
        
    async def get_jwks(self) -> Dict:
        """Recupera le chiavi pubbliche dal provider OIDC con cache"""
        if not self.config.oidc_enabled:
            return {}
            
        now = datetime.utcnow()
        
        # Usa la cache se ancora valida (cache per 1 ora)
        if (self._jwks_cache and 
            self._jwks_cache_expiry and 
            now < self._jwks_cache_expiry):
            return self._jwks_cache
            
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(self.config.oidc_jwks_url, timeout=10.0)
                response.raise_for_status()
                
                self._jwks_cache = response.json()
                self._jwks_cache_expiry = now + timedelta(hours=1)
                
                return self._jwks_cache
                
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Errore nel recupero delle chiavi JWKS: {str(e)}"
            )
    
    async def verify_token(self, token: str) -> UserInfo:
        """Verifica e decodifica un token JWT"""
        if not self.config.oidc_enabled:
            # Modalità di sviluppo - crea un utente fake
            return UserInfo(
                sub="dev-user",
                email="dev@example.com",
                name="Sviluppatore",
                given_name="Dev",
                family_name="User",
                preferred_username="dev",
                groups=["admin"],
                roles=["admin"]
            )
            
        try:
            # Decodifica l'header per ottenere il kid (key ID)
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get("kid")
            
            if not kid:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token JWT senza Key ID"
                )
            
            # Recupera le chiavi pubbliche
            jwks = await self.get_jwks()
            
            # Trova la chiave corretta
            key = None
            for jwk in jwks.get("keys", []):
                if jwk.get("kid") == kid:
                    key = jwk
                    break
                    
            if not key:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Chiave pubblica non trovata per il token"
                )
            
            # Verifica e decodifica il token
            payload = jwt.decode(
                token,
                key,
                algorithms=[self.config.jwt_algorithm],
                audience=self.config.jwt_audience,
                issuer=self.config.oidc_issuer
            )
            
            # Estrae le informazioni dell'utente
            user_info = UserInfo(
                sub=payload.get("sub"),
                email=payload.get("email", ""),
                name=payload.get("name"),
                given_name=payload.get("given_name"),
                family_name=payload.get("family_name"),
                preferred_username=payload.get("preferred_username"),
                groups=payload.get("groups", []),
                roles=payload.get("roles", [])
            )
            
            return user_info
            
        except JWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Token JWT non valido: {str(e)}"
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Errore nella verifica del token: {str(e)}"
            )
    
    async def get_current_user(self, credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))) -> UserInfo:
        """Dependency per ottenere l'utente corrente"""
        if not self.config.oidc_enabled:
            # Modalità sviluppo - ritorna utente fake
            return UserInfo(
                sub="dev-user",
                email="dev@example.com",
                name="Sviluppatore",
                given_name="Dev",
                family_name="User",
                preferred_username="dev",
                groups=["admin"],
                roles=["admin"]
            )
            
        if not credentials:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token di autenticazione richiesto",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return await self.verify_token(credentials.credentials)
    
    async def get_current_admin_user(self, current_user: UserInfo = None) -> UserInfo:
        """Dependency per verificare che l'utente sia admin"""
        if current_user is None:
            current_user = await self.get_current_user()
        if not self._is_admin(current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Accesso negato: privilegi di amministratore richiesti"
            )
        return current_user
    
    def _is_admin(self, user: UserInfo) -> bool:
        """Verifica se l'utente ha privilegi di amministratore"""
        admin_groups = ["admin", "administrators", "hr-admin"]
        admin_roles = ["admin", "administrator", "hr-admin"]
        
        # Verifica nei gruppi
        if any(group.lower() in admin_groups for group in user.groups):
            return True
            
        # Verifica nei ruoli
        if any(role.lower() in admin_roles for role in user.roles):
            return True
            
        return False
    
    def get_oauth2_client(self) -> AsyncOAuth2Client:
        """Crea un client OAuth2 per l'autenticazione"""
        if not self.config.oidc_enabled:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Autenticazione OIDC non abilitata"
            )
            
        return AsyncOAuth2Client(
            client_id=self.config.oidc_client_id,
            client_secret=self.config.oidc_client_secret,
            redirect_uri=self.config.oidc_redirect_uri
        )


# Istanza globale del servizio di autenticazione
auth_service = AuthService()

# Dependencies esportate per l'uso nei router
get_current_user = auth_service.get_current_user
get_current_admin_user = auth_service.get_current_admin_user
