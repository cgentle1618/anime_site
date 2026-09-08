"""Authentication and user schemas."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class Token(BaseModel):
    """Schema for the JWT access token returned on successful login."""

    access_token: str
    token_type: str


class UserBase(BaseModel):
    username: str


class UserCreate(UserBase):
    """Schema for creating a new user (requires plain text password)."""

    password: str


class UserOut(UserBase):
    """Schema for returning user data (excludes sensitive credentials)."""

    id: UUID
    role: str

    model_config = ConfigDict(from_attributes=True)
