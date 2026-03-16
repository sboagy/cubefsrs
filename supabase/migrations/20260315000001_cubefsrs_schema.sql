-- =============================================================================
-- CubeFSRS: Initial Schema Migration
-- Schema: cubefsrs (separate from public / tunetrees)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS cubefsrs;

-- ──────────────────────────────────────────────────────────────────────────────
-- GLOBAL ALGORITHM CATALOG
-- Global rows: user_id = NULL (admin-seeded from defaultAlgs.json)
-- User custom rows: user_id = <uuid>
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE cubefsrs.alg_category (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug       TEXT NOT NULL,                          -- e.g. "oll", "pll"
    user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = global
    name       TEXT NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(slug, user_id)
);

CREATE TABLE cubefsrs.alg_subset (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL,                         -- e.g. "oll-all"
    category_id UUID NOT NULL REFERENCES cubefsrs.alg_category(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = global
    name        TEXT NOT NULL,
    sort_order  INT DEFAULT 0,
    UNIQUE(slug, user_id)
);

CREATE TABLE cubefsrs.alg_case (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug       TEXT NOT NULL,                          -- e.g. "oll-01", "pll-ua"
    subset_id  UUID NOT NULL REFERENCES cubefsrs.alg_subset(id) ON DELETE CASCADE,
    user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = global
    name       TEXT NOT NULL,
    alg        TEXT NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(slug, user_id)
);

-- User-specific annotations on global cases (recognition, mnemonic, notes).
-- One row per (user, case). User custom cases store annotations directly in alg_case.
CREATE TABLE cubefsrs.user_alg_annotation (
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    case_id     UUID NOT NULL REFERENCES cubefsrs.alg_case(id) ON DELETE CASCADE,
    recognition TEXT,
    mnemonic    TEXT,
    notes       TEXT,
    updated_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, case_id)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- USER PRACTICE DATA (all synced)
-- ──────────────────────────────────────────────────────────────────────────────

-- Which cases each user has selected for practice
CREATE TABLE cubefsrs.user_alg_selection (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES cubefsrs.alg_case(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, case_id)
);

-- Per-user FSRS card state (one row per user+case)
CREATE TABLE cubefsrs.fsrs_card_state (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    case_id        UUID NOT NULL REFERENCES cubefsrs.alg_case(id) ON DELETE CASCADE,
    due            BIGINT NOT NULL,       -- epoch millis (ts-fsrs format)
    stability      FLOAT,
    difficulty     FLOAT,
    elapsed_days   INT,
    scheduled_days INT,
    reps           INT DEFAULT 0,
    lapses         INT DEFAULT 0,
    state          INT DEFAULT 0,         -- ts-fsrs State enum: 0=New,1=Learning,2=Review,3=Relearning
    last_review    BIGINT,
    updated_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, case_id)
);

-- Practice timing history
-- Retention limit configurable in user_settings.practice_time_limit (-1 = unlimited)
CREATE TABLE cubefsrs.practice_time_entry (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    case_id     UUID NOT NULL REFERENCES cubefsrs.alg_case(id) ON DELETE CASCADE,
    ms          INT NOT NULL,
    reviewed_at TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- USER SETTINGS & SESSION STATE (synced, except ui_settings which stays in localStorage)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE cubefsrs.user_settings (
    user_id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Practice flow (synced)
    current_category_id   UUID REFERENCES cubefsrs.alg_category(id) ON DELETE SET NULL,
    current_case_id       UUID REFERENCES cubefsrs.alg_case(id) ON DELETE SET NULL,
    order_mode            TEXT DEFAULT 'fsrs',       -- 'sequential'|'random'|'fsrs'
    lib_options           JSONB DEFAULT '{}',         -- randomAUF, randomOrder, etc.
    fsrs_params           JSONB DEFAULT '{}',         -- retention, max_interval, fuzz, short_term
    practice_time_limit   INT DEFAULT -1,             -- max time entries per case (-1 = unlimited)
    -- NOTE: UI-only prefs (dark mode, backview, gyroAnimation, visualization)
    --       are NOT stored here — they live in localStorage only.
    updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- updated_at auto-update triggers
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cubefsrs.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER alg_case_updated_at
    BEFORE UPDATE ON cubefsrs.alg_case
    FOR EACH ROW EXECUTE FUNCTION cubefsrs.set_updated_at();

CREATE TRIGGER user_alg_annotation_updated_at
    BEFORE UPDATE ON cubefsrs.user_alg_annotation
    FOR EACH ROW EXECUTE FUNCTION cubefsrs.set_updated_at();

CREATE TRIGGER fsrs_card_state_updated_at
    BEFORE UPDATE ON cubefsrs.fsrs_card_state
    FOR EACH ROW EXECUTE FUNCTION cubefsrs.set_updated_at();

CREATE TRIGGER user_settings_updated_at
    BEFORE UPDATE ON cubefsrs.user_settings
    FOR EACH ROW EXECUTE FUNCTION cubefsrs.set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE cubefsrs.alg_category       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cubefsrs.alg_subset         ENABLE ROW LEVEL SECURITY;
ALTER TABLE cubefsrs.alg_case           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cubefsrs.user_alg_annotation ENABLE ROW LEVEL SECURITY;
ALTER TABLE cubefsrs.user_alg_selection  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cubefsrs.fsrs_card_state     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cubefsrs.practice_time_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE cubefsrs.user_settings       ENABLE ROW LEVEL SECURITY;

-- alg_category: global rows (user_id IS NULL) readable by all authenticated users;
-- user rows readable/writable only by owner.
CREATE POLICY "alg_category_select" ON cubefsrs.alg_category
    FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "alg_category_insert" ON cubefsrs.alg_category
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "alg_category_update" ON cubefsrs.alg_category
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "alg_category_delete" ON cubefsrs.alg_category
    FOR DELETE USING (user_id = auth.uid());

-- alg_subset: same as alg_category
CREATE POLICY "alg_subset_select" ON cubefsrs.alg_subset
    FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "alg_subset_insert" ON cubefsrs.alg_subset
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "alg_subset_update" ON cubefsrs.alg_subset
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "alg_subset_delete" ON cubefsrs.alg_subset
    FOR DELETE USING (user_id = auth.uid());

-- alg_case: same as alg_category
CREATE POLICY "alg_case_select" ON cubefsrs.alg_case
    FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "alg_case_insert" ON cubefsrs.alg_case
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "alg_case_update" ON cubefsrs.alg_case
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "alg_case_delete" ON cubefsrs.alg_case
    FOR DELETE USING (user_id = auth.uid());

-- user_alg_annotation: owned entirely by user
CREATE POLICY "user_alg_annotation_select" ON cubefsrs.user_alg_annotation
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_alg_annotation_insert" ON cubefsrs.user_alg_annotation
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_alg_annotation_update" ON cubefsrs.user_alg_annotation
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_alg_annotation_delete" ON cubefsrs.user_alg_annotation
    FOR DELETE USING (user_id = auth.uid());

-- user_alg_selection
CREATE POLICY "user_alg_selection_select" ON cubefsrs.user_alg_selection
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_alg_selection_insert" ON cubefsrs.user_alg_selection
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_alg_selection_delete" ON cubefsrs.user_alg_selection
    FOR DELETE USING (user_id = auth.uid());

-- fsrs_card_state
CREATE POLICY "fsrs_card_state_select" ON cubefsrs.fsrs_card_state
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "fsrs_card_state_insert" ON cubefsrs.fsrs_card_state
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "fsrs_card_state_update" ON cubefsrs.fsrs_card_state
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "fsrs_card_state_delete" ON cubefsrs.fsrs_card_state
    FOR DELETE USING (user_id = auth.uid());

-- practice_time_entry
CREATE POLICY "practice_time_entry_select" ON cubefsrs.practice_time_entry
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "practice_time_entry_insert" ON cubefsrs.practice_time_entry
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "practice_time_entry_delete" ON cubefsrs.practice_time_entry
    FOR DELETE USING (user_id = auth.uid());

-- user_settings
CREATE POLICY "user_settings_select" ON cubefsrs.user_settings
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_settings_insert" ON cubefsrs.user_settings
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_settings_update" ON cubefsrs.user_settings
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_settings_delete" ON cubefsrs.user_settings
    FOR DELETE USING (user_id = auth.uid());
