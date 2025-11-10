\set ON_ERROR_STOP on
\pset pager off

\if :{?old_id}
\else
\echo 'ERROR: Provide -v old_id=<uuid> when invoking this script (e.g. psql ... -v old_id=0000-...).'
\quit 1
\endif

\set new_id_raw 550e8400-e29b-41d4-a716-446655440000
\set new_id_literal '''' :new_id_raw ''''
\set old_id_literal '''' :old_id ''''

\echo '=== Starting tenant ID migration ==='
\echo ' Source (old_id): ' :old_id
\echo ' Target (new_id): ' :new_id_raw

BEGIN;
SET LOCAL row_security = off;
SET LOCAL session_replication_role = replica;
SET LOCAL app.migration.old_id = :old_id_literal;
SET LOCAL app.migration.new_id = :new_id_literal;

DO $migration$
DECLARE
    src_id uuid := current_setting('app.migration.old_id')::uuid;
    dst_id uuid := current_setting('app.migration.new_id')::uuid;
    rec record;
    stmt text;
    updated_count bigint;
BEGIN
    IF src_id = dst_id THEN
        RAISE EXCEPTION 'old_id must differ from target (%).', dst_id;
    END IF;

    PERFORM 1 FROM tenants WHERE id = dst_id;
    IF FOUND THEN
        RAISE EXCEPTION 'Target tenant_id % already exists. Aborting.', dst_id;
    END IF;

    PERFORM 1 FROM tenants WHERE id = src_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source tenant_id % does not exist.', src_id;
    END IF;

    FOR rec IN
        SELECT table_schema, table_name
        FROM information_schema.columns
        WHERE column_name = 'tenant_id'
          AND table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name
    LOOP
        stmt := format(
            'UPDATE %I.%I SET tenant_id = $1 WHERE tenant_id = $2',
            rec.table_schema,
            rec.table_name
        );
        EXECUTE stmt USING dst_id, src_id;
        GET DIAGNOSTICS updated_count = ROW_COUNT;
        IF updated_count > 0 THEN
            RAISE NOTICE 'Updated % rows in %.%', updated_count, rec.table_schema, rec.table_name;
        END IF;
    END LOOP;

    UPDATE tenants SET id = dst_id WHERE id = src_id;
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    IF updated_count <> 1 THEN
        RAISE EXCEPTION 'Expected to update 1 tenant row, updated % instead.', updated_count;
    END IF;

    RAISE NOTICE 'Tenant ID migration completed.';
END
$migration$;

COMMIT;

\echo '=== Tenant record ==='
SELECT id, slug, name FROM tenants WHERE id = :new_id_literal;

\echo 'Done.'
