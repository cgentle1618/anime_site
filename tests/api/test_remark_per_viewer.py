"""Decision 12: a remark belongs to its author.

The two halves of this change have to land together, and these tests are what
make that non-negotiable: the first fails without the relaxed index, the rest
fail without the per-request read. Landing only the index would turn a loud
refusal into a silent one - today the database refuses a second account's
remark outright; after a half-fix it would be accepted and then invisible,
which is a data-loss shape rather than a limitation.
"""

from app import models
from app.services.domain.remark_field import upsert_remark


def test_two_accounts_may_each_hold_a_remark_on_one_entry(
    db_session, admin_user, plain_user, sample_anime
):
    """Without the relaxed index this raises IntegrityError on the second
    insert - ix_note_one_remark_per_owner was per-owner, not
    per-owner-per-author."""
    upsert_remark(db_session, "anime", sample_anime.system_id, "mine", admin_user.id)
    upsert_remark(
        db_session, "anime", sample_anime.system_id, "theirs", plain_user.id
    )
    db_session.flush()

    assert (
        db_session.query(models.Note)
        .filter(
            models.Note.media_id == sample_anime.system_id,
            models.Note.section == "remark",
        )
        .count()
        == 2
    )


def test_each_viewer_reads_back_their_own(
    db_session, admin_client, user_client, admin_user, plain_user, sample_anime
):
    upsert_remark(db_session, "anime", sample_anime.system_id, "mine", admin_user.id)
    upsert_remark(
        db_session, "anime", sample_anime.system_id, "theirs", plain_user.id
    )
    db_session.flush()

    path = f"/api/anime/{sample_anime.system_id}"
    assert admin_client.get(path).json()["remark"] == "mine"
    assert user_client.get(path).json()["remark"] == "theirs"


def test_a_viewer_with_no_remark_reads_null_not_someone_elses(
    db_session, user_client, admin_user, sample_anime
):
    """The failure mode a class-level column_property produced: one person's
    private assessment shown to everybody."""
    upsert_remark(db_session, "anime", sample_anime.system_id, "mine", admin_user.id)
    db_session.flush()

    body = user_client.get(f"/api/anime/{sample_anime.system_id}").json()
    assert body["remark"] is None


def test_the_list_endpoint_is_per_viewer_too(
    db_session, admin_client, user_client, admin_user, sample_anime
):
    """One IN query for the page, not one per entry - and the same filter."""
    upsert_remark(db_session, "anime", sample_anime.system_id, "mine", admin_user.id)
    db_session.flush()

    def remark_for(c):
        rows = c.get("/api/anime/").json()
        return next(
            r["remark"]
            for r in rows
            if r["system_id"] == str(sample_anime.system_id)
        )

    assert remark_for(admin_client) == "mine"
    assert remark_for(user_client) is None


def test_a_guest_reads_no_remark(client, db_session, admin_user, sample_anime):
    upsert_remark(db_session, "anime", sample_anime.system_id, "mine", admin_user.id)
    db_session.flush()

    body = client.get(f"/api/anime/{sample_anime.system_id}").json()
    assert body["remark"] is None


def test_a_tier_is_per_viewer_as_well(
    db_session, admin_client, user_client, admin_user, sample_franchise
):
    """A franchise carries a remark too, through a different owner column."""
    upsert_remark(
        db_session, "franchise", sample_franchise.system_id, "mine", admin_user.id
    )
    db_session.flush()

    path = f"/api/franchise/{sample_franchise.system_id}"
    assert admin_client.get(path).json()["remark"] == "mine"
    assert user_client.get(path).json()["remark"] is None


def test_writing_does_not_disturb_the_other_authors_row(
    db_session, admin_user, plain_user, sample_anime
):
    """upsert_remark must find THIS author's row, not the first one."""
    upsert_remark(db_session, "anime", sample_anime.system_id, "mine", admin_user.id)
    upsert_remark(
        db_session, "anime", sample_anime.system_id, "theirs", plain_user.id
    )
    upsert_remark(
        db_session, "anime", sample_anime.system_id, "mine, edited", admin_user.id
    )
    db_session.flush()

    rows = {
        row.author_id: row.content
        for row in db_session.query(models.Note).filter(
            models.Note.media_id == sample_anime.system_id,
            models.Note.section == "remark",
        )
    }
    assert rows == {admin_user.id: "mine, edited", plain_user.id: "theirs"}


def test_clearing_removes_only_this_authors_row(
    db_session, admin_user, plain_user, sample_anime
):
    upsert_remark(db_session, "anime", sample_anime.system_id, "mine", admin_user.id)
    upsert_remark(
        db_session, "anime", sample_anime.system_id, "theirs", plain_user.id
    )
    upsert_remark(db_session, "anime", sample_anime.system_id, "", admin_user.id)
    db_session.flush()

    rows = [
        row.author_id
        for row in db_session.query(models.Note).filter(
            models.Note.media_id == sample_anime.system_id,
            models.Note.section == "remark",
        )
    ]
    assert rows == [plain_user.id]
