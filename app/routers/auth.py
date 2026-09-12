"""
routers/auth.py
Handles the generation and destruction of secure authentication sessions.
Uses JWTs stored in HTTP-Only cookies to protect against XSS attacks.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import settings
from app.dependencies import get_db
from app.services.rbac.modes import (
    ResolvedMode,
    default_mode_id,
    held_modes,
    resolve_mode,
    switch_requires_password,
)
from app.services.rbac.permissions import PERM_MANAGE_CATALOG
from app.services.rbac.resolver import GUEST_FALLBACK, resolve_viewer
from app.services.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    verify_password,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", summary="Authenticate User and Set Cookie")
def login_for_access_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Validates user credentials against the database.
    If valid, generates a JWT and sets it as an HTTP-Only, Lax SameSite cookie.
    """
    # 1. Fetch user from database
    user = (
        db.query(models.User).filter(models.User.username == form_data.username).first()
    )

    # 2. Verify existence and password match
    if not user or not verify_password(form_data.password, user.hashed_password):
        logger.warning(f"Failed login attempt for username: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Create the JWT token payload
    #
    # `mode` names a CHOICE, not a grant: whether this account may still use
    # the mode is re-resolved from the database on every request, the same way
    # the decorative `role` claim above is. It carries the mode's uuid rather
    # than its key so that renaming a mode does not invalidate live sessions.
    #
    # An account with no default mode mints an empty claim, which resolves to
    # the empty object set - the correct answer for an account nobody has
    # granted a mode, not a case to special-case around.
    token_data = {
        "sub": user.username,
        "role": user.role,
        "mode": str(default_mode_id(db, user) or ""),
    }
    access_token = create_access_token(data=token_data)

    # 4. Set the cookie
    # httponly=True prevents JavaScript (document.cookie) from reading the token
    # max_age is in seconds (ACCESS_TOKEN_EXPIRE_MINUTES * 60 seconds = X hours)
    response.set_cookie(
        key="access_token",
        value=f"Bearer {access_token}",
        httponly=True,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
        # Follows APP_ENV, not the request scheme. Behind a tunnel the scheme
        # is only trustworthy if proxy headers are configured correctly, and a
        # missing header would silently produce an insecure cookie over HTTPS -
        # the failure this flag exists to prevent. Django's
        # SESSION_COOKIE_SECURE and Rails' config.force_ssl are per-environment
        # settings for the same reason. Read per request, not at import, so a
        # test can move the setting.
        secure=not settings.is_development,
    )

    logger.info(f"Successful login for user: {user.username}")
    return {"message": "Successfully logged in", "role": user.role}


def _user_for(db: Session, viewer):
    """The account row behind a resolved viewer, or None for a guest.

    /me resolves a Viewer rather than a User, and held_modes needs the row.
    One lookup on a route the SPA calls once per mount.
    """
    if not viewer.username:
        return None
    return (
        db.query(models.User).filter(models.User.username == viewer.username).first()
    )


@router.get("/me", summary="Get Current Auth Status")
def get_me(request: Request, db: Session = Depends(get_db)):
    """
    Returns the current viewer's auth status. Used by React AuthContext on mount.

    This is the one place the SPA learns what it may show, so it carries the
    whole permission set, not just the admin flag. `is_admin` and `username`
    keep their old meaning and shape - every existing consumer of useAuth()
    reads those and must not break.

    Never raises. An anonymous or unresolvable caller is the guest role, which
    is a real row with real grants, so the SPA gets a usable answer either way.
    """
    try:
        viewer = resolve_viewer(request, db)
    except Exception:
        logger.exception("Failed to resolve viewer; falling back to guest")
        viewer = GUEST_FALLBACK

    return {
        # Means "may edit the catalogue", not "is an administrator". The SPA's
        # 394 isAdmin call sites gate edit buttons, notes editors and tracker
        # controls, which is exactly manage.catalog - so a super account
        # correctly gains them. The three authorization pages ask for
        # admin.authz instead; see App.jsx.
        "is_admin": viewer.has(PERM_MANAGE_CATALOG),
        "username": viewer.username,
        "role": viewer.role_name,
        "is_root": viewer.is_root,
        # TWO AXES, ONE LIST, deliberately. The role half answers "what may
        # this account DO"; the field_group.* half answers "which fields of a
        # reachable entry may this SESSION see" and comes from the active
        # access mode minus its denials. They are merged here, and ONLY here,
        # because the SPA has hundreds of has("field_group.<key>") calls that
        # predate the split - preserving this shape is what makes Phase B cost
        # the frontend nothing. The server never merges the two anywhere else.
        #
        # The literal prefix is deliberate too: field_group_perm() was deleted
        # in Phase B precisely so a stale call site becomes an ImportError,
        # and re-introducing a helper for one call site would invite back the
        # thing the deletion was meant to prevent.
        "permissions": sorted(
            set(viewer.permissions)
            | {f"field_group.{key}" for key in viewer.field_groups}
        ),
        # Content labels are NOT published. They scope whole entries
        # server-side, the browser never needs them, and listing them would
        # tell a narrowed session exactly what it is being kept from.
        #
        # The list of modes this account HOLDS, each flagged with whether
        # switching to it needs the password, belongs to the switcher - which
        # is Phase D. There is no switcher yet, so there is nothing here to
        # feed it.
        "mode": {
            "id": str(viewer.mode_id) if viewer.mode_id else None,
            "key": viewer.mode_key,
        },
        # What the switcher needs: which modes are available, and what each
        # would COST. `requires_password` is the subset test from decision 3,
        # computed server-side precisely so the SPA never has to model it.
        # A guest gets an empty list - no account, nothing to switch between.
        "modes": held_modes(
            db,
            _user_for(db, viewer),
            ResolvedMode(
                viewer.mode_id,
                viewer.mode_key,
                viewer.visible_label_ids,
                viewer.field_groups,
            ),
        ),
    }


@router.post("/access-mode", summary="Switch the active access mode")
def switch_access_mode(
    payload: schemas.AccessModeSwitch,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Change which objects this session may reach, without logging out.

    Narrowing is instant; widening asks for the password again (decision 3),
    so a browser left logged in at a narrow mode is actually narrow. The test
    is a set comparison and it is the SAME function /api/auth/me uses to
    advertise the cost - the endpoint that ENFORCES the rule must not be able
    to disagree with the payload that ADVERTISES it.

    THE REISSUED COOKIE KEEPS THE ORIGINAL `exp`. Minting a fresh 24-hour
    token here would make toggling between two modes an unlimited
    session-extension oracle, and the lifetime is flat with no refresh flow
    and no revocation, so that would be the whole of it. The cookie's max_age
    is the REMAINING seconds for the same reason - a switch must not resurrect
    a token that has already expired.
    """
    viewer = resolve_viewer(request, db)
    user = _user_for(db, viewer)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to change access mode.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    grant = (
        db.query(models.UserAccessMode)
        .filter(
            models.UserAccessMode.user_id == user.id,
            models.UserAccessMode.mode_id == payload.mode_id,
        )
        .first()
    )
    # 404, and deliberately the same answer a mode that does not exist gets:
    # which modes exist is not this caller's business, and it is NOT a
    # password problem - answering `requires_password` here would invite the
    # SPA to prompt for something that cannot help.
    if grant is None:
        raise HTTPException(status_code=404, detail="Access mode not found.")

    target = resolve_mode(db, user, payload.mode_id)
    current = ResolvedMode(
        viewer.mode_id,
        viewer.mode_key,
        viewer.visible_label_ids,
        viewer.field_groups,
    )

    if switch_requires_password(current, target):
        if not payload.password or not verify_password(
            payload.password, user.hashed_password
        ):
            # Returned, not raised: HTTPException cannot carry a body field
            # beside `detail`, and `requires_password` has to reach the SPA so
            # it prompts rather than guessing which switches are free.
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "detail": "Widening an access mode needs your password.",
                    "requires_password": True,
                },
            )

    claims = viewer.token_payload or {}
    expires_at = datetime.fromtimestamp(claims["exp"], tz=timezone.utc)
    token = create_access_token(
        {"sub": user.username, "role": user.role, "mode": str(payload.mode_id)},
        expires_at=expires_at,
    )
    remaining = int((expires_at - datetime.now(timezone.utc)).total_seconds())
    response.set_cookie(
        key="access_token",
        value=f"Bearer {token}",
        httponly=True,
        max_age=max(remaining, 0),
        samesite="lax",
        secure=not settings.is_development,
    )
    return {"mode": {"id": str(target.mode_id), "key": target.mode_key}}


@router.post("/logout", summary="Logout User and Clear Cookie")
def logout_user():
    """Clears the HttpOnly access token cookie to properly log out the admin."""
    response = JSONResponse(content={"message": "Successfully logged out"})
    response.delete_cookie(key="access_token", path="/", httponly=True, samesite="lax")
    return response
