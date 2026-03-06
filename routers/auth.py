"""
routers/auth.py
Handles the generation and destruction of secure authentication sessions.
Uses JWTs stored in HTTP-Only cookies to protect against XSS attacks.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

import models
from dependencies import get_db
from services.security import verify_password, create_access_token

# Initialize the router
router = APIRouter(prefix="/auth", tags=["Authentication"])


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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Create the JWT token payload
    token_data = {"sub": user.username, "role": user.role}
    access_token = create_access_token(data=token_data)

    # 4. Set the secure cookie
    # httponly=True prevents JavaScript (document.cookie) from reading the token
    # max_age is in seconds (1440 minutes * 60 seconds = 24 hours)
    response.set_cookie(
        key="access_token",
        value=f"Bearer {access_token}",
        httponly=True,
        max_age=1440 * 60,
        samesite="lax",
        secure=False,  # NOTE: Set to True in production if using HTTPS!
    )

    return {"message": "Successfully logged in", "role": user.role}


@router.post("/logout", summary="Destroy Authentication Session")
def logout(response: Response):
    """Clears the HTTP-Only cookie to log the user out."""
    response.delete_cookie(key="access_token", path="/", httponly=True, samesite="lax")
    return {"message": "Successfully logged out"}
