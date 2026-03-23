-- =============================================================================
-- CubeFSRS: Enable oosync incremental sync support
-- Adds sync metadata columns, shared sync change log, and change-tracking
-- triggers required by the oosync worker for incremental pull/push behavior.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_now_iso()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
    SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

CREATE TABLE IF NOT EXISTS public.sync_change_log (
    table_name TEXT PRIMARY KEY,
    changed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_change_log_changed_at
    ON public.sync_change_log (changed_at);

CREATE OR REPLACE FUNCTION public.sync_change_log_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
    INSERT INTO public.sync_change_log (table_name, changed_at)
    VALUES (TG_TABLE_NAME, public.sync_now_iso())
    ON CONFLICT (table_name) DO UPDATE
        SET changed_at = EXCLUDED.changed_at;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

ALTER TABLE public.sync_change_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'sync_change_log'
          AND policyname = 'Allow authenticated users full access to sync_change_log'
    ) THEN
        CREATE POLICY "Allow authenticated users full access to sync_change_log"
            ON public.sync_change_log
            TO authenticated
            USING (true)
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'sync_change_log'
          AND policyname = 'Allow service_role full access to sync_change_log'
    ) THEN
        CREATE POLICY "Allow service_role full access to sync_change_log"
            ON public.sync_change_log
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END;
$$;

GRANT ALL ON FUNCTION public.sync_now_iso() TO anon;
GRANT ALL ON FUNCTION public.sync_now_iso() TO authenticated;
GRANT ALL ON FUNCTION public.sync_now_iso() TO service_role;

GRANT ALL ON FUNCTION public.sync_change_log_update() TO anon;
GRANT ALL ON FUNCTION public.sync_change_log_update() TO authenticated;
GRANT ALL ON FUNCTION public.sync_change_log_update() TO service_role;

GRANT ALL ON TABLE public.sync_change_log TO anon;
GRANT ALL ON TABLE public.sync_change_log TO authenticated;
GRANT ALL ON TABLE public.sync_change_log TO service_role;

ALTER TABLE cubefsrs.alg_category
    ADD COLUMN IF NOT EXISTS sync_version INTEGER DEFAULT 1 NOT NULL,
    ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP DEFAULT now() NOT NULL,
    ADD COLUMN IF NOT EXISTS device_id TEXT;

ALTER TABLE cubefsrs.alg_subset
    ADD COLUMN IF NOT EXISTS sync_version INTEGER DEFAULT 1 NOT NULL,
    ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP DEFAULT now() NOT NULL,
    ADD COLUMN IF NOT EXISTS device_id TEXT;

ALTER TABLE cubefsrs.alg_case
    ADD COLUMN IF NOT EXISTS sync_version INTEGER DEFAULT 1 NOT NULL,
    ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP DEFAULT now() NOT NULL,
    ADD COLUMN IF NOT EXISTS device_id TEXT;

ALTER TABLE cubefsrs.user_alg_annotation
    ADD COLUMN IF NOT EXISTS sync_version INTEGER DEFAULT 1 NOT NULL,
    ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP DEFAULT now() NOT NULL,
    ADD COLUMN IF NOT EXISTS device_id TEXT;

ALTER TABLE cubefsrs.user_alg_selection
    ADD COLUMN IF NOT EXISTS sync_version INTEGER DEFAULT 1 NOT NULL,
    ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP DEFAULT now() NOT NULL,
    ADD COLUMN IF NOT EXISTS device_id TEXT;

ALTER TABLE cubefsrs.fsrs_card_state
    ADD COLUMN IF NOT EXISTS sync_version INTEGER DEFAULT 1 NOT NULL,
    ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP DEFAULT now() NOT NULL,
    ADD COLUMN IF NOT EXISTS device_id TEXT;

ALTER TABLE cubefsrs.practice_time_entry
    ADD COLUMN IF NOT EXISTS sync_version INTEGER DEFAULT 1 NOT NULL,
    ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP DEFAULT now() NOT NULL,
    ADD COLUMN IF NOT EXISTS device_id TEXT;

ALTER TABLE cubefsrs.user_settings
    ADD COLUMN IF NOT EXISTS sync_version INTEGER DEFAULT 1 NOT NULL,
    ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP DEFAULT now() NOT NULL,
    ADD COLUMN IF NOT EXISTS device_id TEXT;

UPDATE cubefsrs.alg_category
SET last_modified_at = COALESCE(created_at::timestamp, now())
WHERE last_modified_at IS NULL;

UPDATE cubefsrs.alg_subset
SET last_modified_at = now()
WHERE last_modified_at IS NULL;

UPDATE cubefsrs.alg_case
SET last_modified_at = COALESCE(updated_at::timestamp, created_at::timestamp, now())
WHERE last_modified_at IS NULL;

UPDATE cubefsrs.user_alg_annotation
SET last_modified_at = COALESCE(updated_at::timestamp, now())
WHERE last_modified_at IS NULL;

UPDATE cubefsrs.user_alg_selection
SET last_modified_at = now()
WHERE last_modified_at IS NULL;

UPDATE cubefsrs.fsrs_card_state
SET last_modified_at = COALESCE(updated_at::timestamp, now())
WHERE last_modified_at IS NULL;

UPDATE cubefsrs.practice_time_entry
SET last_modified_at = COALESCE(reviewed_at::timestamp, now())
WHERE last_modified_at IS NULL;

UPDATE cubefsrs.user_settings
SET last_modified_at = COALESCE(updated_at::timestamp, now())
WHERE last_modified_at IS NULL;

CREATE OR REPLACE FUNCTION cubefsrs.set_last_modified_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.last_modified_at IS NULL OR NEW.last_modified_at = OLD.last_modified_at THEN
        NEW.last_modified_at = now();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alg_category_last_modified_at ON cubefsrs.alg_category;
CREATE TRIGGER alg_category_last_modified_at
    BEFORE UPDATE ON cubefsrs.alg_category
    FOR EACH ROW EXECUTE FUNCTION cubefsrs.set_last_modified_at();

DROP TRIGGER IF EXISTS alg_subset_last_modified_at ON cubefsrs.alg_subset;
CREATE TRIGGER alg_subset_last_modified_at
    BEFORE UPDATE ON cubefsrs.alg_subset
    FOR EACH ROW EXECUTE FUNCTION cubefsrs.set_last_modified_at();

DROP TRIGGER IF EXISTS alg_case_last_modified_at ON cubefsrs.alg_case;
CREATE TRIGGER alg_case_last_modified_at
    BEFORE UPDATE ON cubefsrs.alg_case
    FOR EACH ROW EXECUTE FUNCTION cubefsrs.set_last_modified_at();

DROP TRIGGER IF EXISTS user_alg_annotation_last_modified_at ON cubefsrs.user_alg_annotation;
CREATE TRIGGER user_alg_annotation_last_modified_at
    BEFORE UPDATE ON cubefsrs.user_alg_annotation
    FOR EACH ROW EXECUTE FUNCTION cubefsrs.set_last_modified_at();

DROP TRIGGER IF EXISTS user_alg_selection_last_modified_at ON cubefsrs.user_alg_selection;
CREATE TRIGGER user_alg_selection_last_modified_at
    BEFORE UPDATE ON cubefsrs.user_alg_selection
    FOR EACH ROW EXECUTE FUNCTION cubefsrs.set_last_modified_at();

DROP TRIGGER IF EXISTS fsrs_card_state_last_modified_at ON cubefsrs.fsrs_card_state;
CREATE TRIGGER fsrs_card_state_last_modified_at
    BEFORE UPDATE ON cubefsrs.fsrs_card_state
    FOR EACH ROW EXECUTE FUNCTION cubefsrs.set_last_modified_at();

DROP TRIGGER IF EXISTS practice_time_entry_last_modified_at ON cubefsrs.practice_time_entry;
CREATE TRIGGER practice_time_entry_last_modified_at
    BEFORE UPDATE ON cubefsrs.practice_time_entry
    FOR EACH ROW EXECUTE FUNCTION cubefsrs.set_last_modified_at();

DROP TRIGGER IF EXISTS user_settings_last_modified_at ON cubefsrs.user_settings;
CREATE TRIGGER user_settings_last_modified_at
    BEFORE UPDATE ON cubefsrs.user_settings
    FOR EACH ROW EXECUTE FUNCTION cubefsrs.set_last_modified_at();

DROP TRIGGER IF EXISTS alg_category_sync_change_log ON cubefsrs.alg_category;
CREATE TRIGGER alg_category_sync_change_log
    AFTER INSERT OR DELETE OR UPDATE ON cubefsrs.alg_category
    FOR EACH ROW EXECUTE FUNCTION public.sync_change_log_update();

DROP TRIGGER IF EXISTS alg_subset_sync_change_log ON cubefsrs.alg_subset;
CREATE TRIGGER alg_subset_sync_change_log
    AFTER INSERT OR DELETE OR UPDATE ON cubefsrs.alg_subset
    FOR EACH ROW EXECUTE FUNCTION public.sync_change_log_update();

DROP TRIGGER IF EXISTS alg_case_sync_change_log ON cubefsrs.alg_case;
CREATE TRIGGER alg_case_sync_change_log
    AFTER INSERT OR DELETE OR UPDATE ON cubefsrs.alg_case
    FOR EACH ROW EXECUTE FUNCTION public.sync_change_log_update();

DROP TRIGGER IF EXISTS user_alg_annotation_sync_change_log ON cubefsrs.user_alg_annotation;
CREATE TRIGGER user_alg_annotation_sync_change_log
    AFTER INSERT OR DELETE OR UPDATE ON cubefsrs.user_alg_annotation
    FOR EACH ROW EXECUTE FUNCTION public.sync_change_log_update();

DROP TRIGGER IF EXISTS user_alg_selection_sync_change_log ON cubefsrs.user_alg_selection;
CREATE TRIGGER user_alg_selection_sync_change_log
    AFTER INSERT OR DELETE OR UPDATE ON cubefsrs.user_alg_selection
    FOR EACH ROW EXECUTE FUNCTION public.sync_change_log_update();

DROP TRIGGER IF EXISTS fsrs_card_state_sync_change_log ON cubefsrs.fsrs_card_state;
CREATE TRIGGER fsrs_card_state_sync_change_log
    AFTER INSERT OR DELETE OR UPDATE ON cubefsrs.fsrs_card_state
    FOR EACH ROW EXECUTE FUNCTION public.sync_change_log_update();

DROP TRIGGER IF EXISTS practice_time_entry_sync_change_log ON cubefsrs.practice_time_entry;
CREATE TRIGGER practice_time_entry_sync_change_log
    AFTER INSERT OR DELETE OR UPDATE ON cubefsrs.practice_time_entry
    FOR EACH ROW EXECUTE FUNCTION public.sync_change_log_update();

DROP TRIGGER IF EXISTS user_settings_sync_change_log ON cubefsrs.user_settings;
CREATE TRIGGER user_settings_sync_change_log
    AFTER INSERT OR DELETE OR UPDATE ON cubefsrs.user_settings
    FOR EACH ROW EXECUTE FUNCTION public.sync_change_log_update();