"""Cross-entity isolation — Restaurant A data must never leak to Restaurant B (Decisions §2)."""

import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import ProgrammingError

from app.db.session import entity_context
from app.features.entities.models import EntitySetting
from app.features.entities.schema import EntitySettingCreate
from app.features.entities import service


def test_restaurant_a_setting_invisible_to_restaurant_b(
    db_session, restaurant_a, restaurant_b
) -> None:
    """Core isolation proof: B cannot read A's scoped rows via ORM."""
    with entity_context(db_session, restaurant_a.id):
        db_session.add(
            EntitySetting(key="payroll_secret", value="A-only-compensation-data")
        )
        db_session.commit()

    with entity_context(db_session, restaurant_b.id):
        visible = list(db_session.scalars(select(EntitySetting)))
        assert visible == []
        assert (
            db_session.scalar(
                select(EntitySetting).where(EntitySetting.key == "payroll_secret")
            )
            is None
        )


def test_restaurant_a_setting_invisible_via_raw_sql_under_b_context(
    db_session, restaurant_a, restaurant_b
) -> None:
    """PostgreSQL RLS blocks raw SQL reads across entities."""
    with entity_context(db_session, restaurant_a.id):
        db_session.add(EntitySetting(key="bank_token", value="secret-a"))
        db_session.commit()

    with entity_context(db_session, restaurant_b.id):
        rows = db_session.execute(
            text("SELECT key, value FROM entity_settings WHERE key = 'bank_token'")
        ).all()
        assert rows == []


def test_cannot_insert_other_entity_row_under_wrong_context(
    db_session, restaurant_a, restaurant_b
) -> None:
    """RLS WITH CHECK rejects raw SQL writes for another entity."""
    setting_id = uuid.uuid4()
    with entity_context(db_session, restaurant_b.id):
        with pytest.raises(ProgrammingError):
            db_session.execute(
                text(
                    """
                    INSERT INTO entity_settings (id, entity_id, key, value, created_at)
                    VALUES (:id, :entity_id, :key, :value, NOW())
                    """
                ),
                {
                    "id": str(setting_id),
                    "entity_id": str(restaurant_a.id),
                    "key": "cross_write",
                    "value": "must fail",
                },
            )
    db_session.rollback()


def test_service_layer_scoped_lists(db_session, restaurant_a, restaurant_b) -> None:
    service.create_entity_setting(
        db_session,
        restaurant_a.id,
        EntitySettingCreate(key="delivery_enabled", value="true"),
    )
    service.create_entity_setting(
        db_session,
        restaurant_b.id,
        EntitySettingCreate(key="delivery_enabled", value="false"),
    )

    a_settings = service.list_entity_settings(db_session, restaurant_a.id)
    b_settings = service.list_entity_settings(db_session, restaurant_b.id)

    assert len(a_settings) == 1
    assert a_settings[0].value == "true"
    assert len(b_settings) == 1
    assert b_settings[0].value == "false"


def test_api_cross_entity_settings_isolation(
    client, restaurant_a, restaurant_b, db_session
) -> None:
    """HTTP API: settings created for A are not returned when listing as B."""
    create_a = client.post(
        f"/entities/{restaurant_a.id}/settings",
        json={"key": "vat_rate", "value": "20"},
    )
    assert create_a.status_code == 201

    list_b = client.get(f"/entities/{restaurant_b.id}/settings")
    assert list_b.status_code == 200
    assert list_b.json() == []


def test_query_without_entity_context_sees_no_scoped_rows(
    db_session, restaurant_a
) -> None:
    """Unscoped session cannot read entity-owned business data."""
    with entity_context(db_session, restaurant_a.id):
        db_session.add(EntitySetting(key="scoped", value="1"))
        db_session.commit()

    db_session.execute(text("SELECT set_config('app.current_entity_id', '', false)"))
    rows = list(db_session.scalars(select(EntitySetting)))
    assert rows == []
