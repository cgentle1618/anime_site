"""The character_casting table."""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


@pytest.fixture
def anime(db_session, sample_franchise):
    a = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Test Anime",
    )
    db_session.add(a)
    db_session.commit()
    return a


@pytest.fixture
def manga(db_session, sample_franchise):
    m = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        manga_name_en="Test Manga",
    )
    db_session.add(m)
    db_session.commit()
    return m


@pytest.fixture
def person(db_session):
    p = models.Person(name_jp="花澤香菜")
    db_session.add(p)
    db_session.commit()
    return p


@pytest.fixture
def character(db_session):
    c = models.Character(name_en="Ichika")
    db_session.add(c)
    db_session.commit()
    return c


def test_one_casting_per_character_per_entry(db_session, anime, character):
    for _ in range(2):
        db_session.add(
            models.CharacterCasting(
                character_id=character.system_id,
                media_type="anime",
                entry_id=anime.system_id,
            )
        )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_a_manga_casting_cannot_name_a_seiyuu(db_session, manga, character, person):
    """
    ck_casting_voice_scope. Characters reach the four ACG types; seiyuu reach
    only anime and anime-movie. Nobody voices anyone in a manga.
    """
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id,
            media_type="manga",
            entry_id=manga.system_id,
            person_id=person.system_id,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_a_manga_casting_without_a_seiyuu_is_fine(db_session, manga, character):
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id,
            media_type="manga",
            entry_id=manga.system_id,
        )
    )
    db_session.flush()


def test_deleting_the_seiyuu_keeps_the_casting(db_session, anime, character, person):
    """
    Decision H. media_credit CASCADEs on person delete because the credit IS
    the person's link to the work. A casting is the CHARACTER's link to the
    work, so deleting the seiyuu must not delete Ichika from the anime.
    """
    casting = models.CharacterCasting(
        character_id=character.system_id,
        media_type="anime",
        entry_id=anime.system_id,
        person_id=person.system_id,
    )
    db_session.add(casting)
    db_session.commit()

    db_session.delete(person)
    db_session.commit()
    db_session.expire_all()

    survivor = db_session.get(models.CharacterCasting, casting.system_id)
    assert survivor is not None
    assert survivor.person_id is None


def test_deleting_the_character_removes_the_casting(db_session, anime, character):
    casting = models.CharacterCasting(
        character_id=character.system_id,
        media_type="anime",
        entry_id=anime.system_id,
    )
    db_session.add(casting)
    db_session.commit()
    casting_id = casting.system_id

    db_session.delete(character)
    db_session.commit()

    assert db_session.get(models.CharacterCasting, casting_id) is None
