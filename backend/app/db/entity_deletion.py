"""The one sanctioned way through the immutability triggers.

Everywhere else in this schema, the ledger cannot be deleted, and that is
enforced by Postgres rather than by application code: `mizan_app` holds DML
rights and no ownership, so it cannot disable a trigger no matter what the API
asks it to do. A bug in a route cannot destroy a journal entry.

Deleting a whole restaurant needs a way past that, and there were two options.
Handing the API an admin connection would have given every route the power to
disable any trigger on any table. This instead is a single function, owned by
the schema owner, which `mizan_app` may execute and nothing else:

  - it takes an entity id and deletes that entity, letting `ON DELETE CASCADE`
    carry the rest away;
  - it cannot delete a journal entry, or a row of anything, on its own;
  - it re-enables every trigger before it returns, inside the same transaction,
    so a failure anywhere rolls the disabled window back with it.

The blast radius is therefore "an entire restaurant disappears" — which is
loud, and which someone notices — rather than "a number quietly changed",
which is the failure this schema is built to make impossible. That is the
trade being made, and it is worth writing down.

Triggers are found by querying `pg_trigger` for the DELETE bit rather than
listed. A list would already have been wrong: `journal_entries_restrict_update`
and the four `_append_only` audit triggers are declared `UPDATE OR DELETE`, and
`auth_audit_events` in particular *must* be included — its `entity_id` is
`ON DELETE SET NULL`, so the cascade performs an update on an append-only
table, which its own trigger would otherwise abort. Deleting any restaurant
anyone had ever logged into would fail.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Connection

DELETE_ENTITY_FUNCTION = "delete_entity_cascade"

#: `SET search_path` is not decoration. A SECURITY DEFINER function runs with
#: the owner's rights, so an unqualified name it resolves through a caller-
#: controlled search_path would run attacker-chosen code as the owner.
_CREATE_DELETE_ENTITY_FUNCTION = f"""
CREATE OR REPLACE FUNCTION {DELETE_ENTITY_FUNCTION}(p_entity_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    blocking record;
    removed bigint;
BEGIN
    FOR blocking IN
        SELECT c.relname AS table_name, t.tgname AS trigger_name
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal
          AND n.nspname = 'public'
          AND (t.tgtype & 8) <> 0
    LOOP
        EXECUTE format(
            'ALTER TABLE %I DISABLE TRIGGER %I',
            blocking.table_name, blocking.trigger_name
        );
    END LOOP;

    DELETE FROM entities WHERE id = p_entity_id;
    GET DIAGNOSTICS removed = ROW_COUNT;

    FOR blocking IN
        SELECT c.relname AS table_name, t.tgname AS trigger_name
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal
          AND n.nspname = 'public'
          AND (t.tgtype & 8) <> 0
    LOOP
        EXECUTE format(
            'ALTER TABLE %I ENABLE TRIGGER %I',
            blocking.table_name, blocking.trigger_name
        );
    END LOOP;

    RETURN removed;
END;
$$;
"""


def apply_entity_deletion_function(connection: Connection, *, app_role: str) -> None:
    """Install or refresh the function, granting execute to the app role alone."""
    connection.execute(text(_CREATE_DELETE_ENTITY_FUNCTION))
    # CREATE FUNCTION grants EXECUTE to PUBLIC by default, which for a
    # SECURITY DEFINER function means anyone who can reach the database can
    # delete a restaurant. Revoke first, then grant deliberately.
    connection.execute(
        text(f"REVOKE ALL ON FUNCTION {DELETE_ENTITY_FUNCTION}(uuid) FROM PUBLIC")
    )
    connection.execute(
        text(f"GRANT EXECUTE ON FUNCTION {DELETE_ENTITY_FUNCTION}(uuid) TO {app_role}")
    )


def entity_deletion_function_present(connection: Connection) -> bool:
    """True when the function exists and is SECURITY DEFINER."""
    return bool(
        connection.execute(
            text(
                """
                SELECT p.prosecdef
                FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = :name
                """
            ),
            {"name": DELETE_ENTITY_FUNCTION},
        ).scalar()
    )
