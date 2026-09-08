"""
Unit tests for services/security.py

Tests password hashing and JWT creation/verification logic.
"""

from datetime import timedelta

import jwt
import pytest
from freezegun import freeze_time

from app.services.security import (
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    get_password_hash,
    verify_password,
)


class TestGetPasswordHash:
    def test_output_is_not_plaintext(self):
        hashed = get_password_hash("mysecret")
        assert hashed != "mysecret"

    def test_output_looks_like_bcrypt(self):
        hashed = get_password_hash("mysecret")
        assert hashed.startswith("$2b$") or hashed.startswith("$2a$")

    def test_two_hashes_of_same_password_differ(self):
        h1 = get_password_hash("same")
        h2 = get_password_hash("same")
        assert h1 != h2  # bcrypt uses random salts


class TestVerifyPassword:
    def test_correct_password_returns_true(self):
        hashed = get_password_hash("correct")
        assert verify_password("correct", hashed) is True

    def test_wrong_password_returns_false(self):
        hashed = get_password_hash("correct")
        assert verify_password("wrong", hashed) is False

    def test_empty_password_returns_false(self):
        hashed = get_password_hash("notempty")
        assert verify_password("", hashed) is False

    def test_invalid_hash_returns_false(self):
        assert verify_password("any", "not-a-bcrypt-hash") is False


class TestCreateAccessToken:
    def test_returns_string(self):
        token = create_access_token({"sub": "admin", "role": "admin"})
        assert isinstance(token, str)

    def test_payload_decoded_correctly(self):
        token = create_access_token({"sub": "admin", "role": "admin"})
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["sub"] == "admin"
        assert payload["role"] == "admin"

    def test_exp_claim_is_set(self):
        token = create_access_token({"sub": "admin"})
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert "exp" in payload

    def test_custom_expiry_respected(self):
        short_token = create_access_token({"sub": "admin"}, expires_delta=timedelta(minutes=1))
        long_token = create_access_token({"sub": "admin"}, expires_delta=timedelta(hours=24))

        short_payload = jwt.decode(short_token, SECRET_KEY, algorithms=[ALGORITHM])
        long_payload = jwt.decode(long_token, SECRET_KEY, algorithms=[ALGORITHM])

        assert long_payload["exp"] > short_payload["exp"]

    @freeze_time("2024-01-01 00:00:00")
    def test_expired_token_raises_exception(self):
        # Create a token that expires in 1 second
        token = create_access_token({"sub": "admin"}, expires_delta=timedelta(seconds=1))

        # Travel 10 seconds into the future
        with freeze_time("2024-01-01 00:00:10"):
            with pytest.raises(jwt.ExpiredSignatureError):
                jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

    def test_tampered_token_raises_exception(self):
        token = create_access_token({"sub": "admin"})
        tampered = token[:-5] + "XXXXX"
        with pytest.raises(jwt.PyJWTError):
            jwt.decode(tampered, SECRET_KEY, algorithms=[ALGORITHM])
