from fastapi import Request, HTTPException
from .auth import UserInfo, auth_service


def get_current_user_from_request(request: Request) -> UserInfo:
    """Ottieni l'utente corrente dalla richiesta (impostato dal middleware)"""
    if hasattr(request.state, 'current_user'):
        return request.state.current_user
    
    # Fallback per modalità dev o se il middleware non è attivo
    if not auth_service.config.oidc_enabled:
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
    
    # Se arriviamo qui, c'è un problema
    raise HTTPException(
        status_code=401,
        detail="Utente non autenticato"
    )


def get_current_admin_user_from_request(request: Request) -> UserInfo:
    """Ottieni l'utente corrente e verifica che sia admin"""
    user = get_current_user_from_request(request)
    
    print(f"Controllo admin per utente: {user.email}")
    print(f"Gruppi utente: {user.groups}")
    print(f"Ruoli utente: {user.roles}")
    
    # Verifica se è admin
    admin_groups = ["admin", "administrators", "hr-admin"]
    admin_roles = ["admin", "administrator", "hr-admin"]
    
    is_admin = (
        any(group.lower() in admin_groups for group in user.groups) or
        any(role.lower() in admin_roles for role in user.roles)
    )
    
    print(f"È admin? {is_admin}")
    
    if not is_admin:
        print(f"Accesso negato per {user.email} - non è admin")
        raise HTTPException(
            status_code=403,
            detail="Accesso negato: privilegi di amministratore richiesti"
        )
    
    print(f"Accesso admin confermato per {user.email}")
    return user
