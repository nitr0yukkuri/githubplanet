CREATE TABLE IF NOT EXISTS planet_language_snapshots (
    github_id BIGINT NOT NULL REFERENCES planets(github_id) ON DELETE CASCADE,
    captured_at TIMESTAMPTZ NOT NULL,
    main_language TEXT,
    planet_color TEXT,
    language_percentages JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (github_id, captured_at)
);

-- 比率を保存すると、リポジトリの総バイト数が増えただけの更新で同じ構成を重複記録しない。
CREATE OR REPLACE FUNCTION planet_language_percentages(language_stats JSONB)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
    WITH language_bytes AS (
        SELECT key AS language, value::numeric AS bytes
        FROM jsonb_each_text(COALESCE(language_stats, '{}'::jsonb))
        WHERE value ~ '^[0-9]+([.][0-9]+)?$'
          AND value::numeric > 0
    ), totals AS (
        SELECT SUM(bytes) AS total_bytes
        FROM language_bytes
    )
    SELECT COALESCE(
        jsonb_object_agg(language_bytes.language, to_jsonb(ROUND(language_bytes.bytes * 100 / totals.total_bytes, 2))),
        '{}'::jsonb
    )
    FROM language_bytes
    CROSS JOIN totals
    WHERE totals.total_bytes > 0
$$;

-- 導入前の最新値を起点として残し、それ以前の履歴を推測して作らない。
INSERT INTO planet_language_snapshots (
    github_id,
    captured_at,
    main_language,
    planet_color,
    language_percentages
)
SELECT
    github_id,
    COALESCE(last_updated, NOW()),
    main_language,
    planet_color,
    planet_language_percentages(language_stats)
FROM planets
ON CONFLICT (github_id, captured_at) DO NOTHING;

-- 旧試作で保存していた履歴が存在する環境では、切り替え時に言語構成を引き継ぐ。
DO $$
BEGIN
    IF to_regclass('public.planet_snapshots') IS NOT NULL THEN
        EXECUTE $copy$
            WITH converted_snapshots AS (
                SELECT
                    github_id,
                    captured_at,
                    main_language,
                    planet_color,
                    planet_language_percentages(language_stats) AS language_percentages
                FROM public.planet_snapshots
            ), compared_snapshots AS (
                SELECT
                    converted_snapshots.*,
                    LAG(main_language) OVER account_history AS previous_language,
                    LAG(planet_color) OVER account_history AS previous_color,
                    LAG(language_percentages) OVER account_history AS previous_percentages,
                    LAG(captured_at) OVER account_history AS previous_capture
                FROM converted_snapshots
                WINDOW account_history AS (PARTITION BY github_id ORDER BY captured_at)
            )
            INSERT INTO planet_language_snapshots (
                github_id,
                captured_at,
                main_language,
                planet_color,
                language_percentages
            )
            SELECT
                github_id,
                captured_at,
                main_language,
                planet_color,
                language_percentages
            FROM compared_snapshots
            WHERE previous_capture IS NULL
               OR previous_language IS DISTINCT FROM main_language
               OR previous_color IS DISTINCT FROM planet_color
               OR previous_percentages IS DISTINCT FROM language_percentages
            ON CONFLICT (github_id, captured_at) DO NOTHING
        $copy$;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION capture_planet_language_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    percentages JSONB;
    latest_snapshot planet_language_snapshots%ROWTYPE;
BEGIN
    percentages := planet_language_percentages(NEW.language_stats);

    SELECT *
    INTO latest_snapshot
    FROM planet_language_snapshots
    WHERE github_id = NEW.github_id
    ORDER BY captured_at DESC
    LIMIT 1;

    -- 比率・主言語・色が同じなら、TTL更新のたびに同じ履歴を増やさない。
    IF FOUND
        AND latest_snapshot.main_language IS NOT DISTINCT FROM NEW.main_language
        AND latest_snapshot.planet_color IS NOT DISTINCT FROM NEW.planet_color
        AND latest_snapshot.language_percentages = percentages THEN
        RETURN NEW;
    END IF;

    INSERT INTO planet_language_snapshots (
        github_id,
        captured_at,
        main_language,
        planet_color,
        language_percentages
    )
    VALUES (
        NEW.github_id,
        COALESCE(NEW.last_updated, NOW()),
        NEW.main_language,
        NEW.planet_color,
        percentages
    )
    ON CONFLICT (github_id, captured_at) DO UPDATE SET
        main_language = EXCLUDED.main_language,
        planet_color = EXCLUDED.planet_color,
        language_percentages = EXCLUDED.language_percentages;

    RETURN NEW;
END;
$$;

CREATE TRIGGER capture_planet_language_snapshot_after_insert
AFTER INSERT ON planets
FOR EACH ROW
EXECUTE FUNCTION capture_planet_language_snapshot();

CREATE TRIGGER capture_planet_language_snapshot_after_language_change
AFTER UPDATE OF planet_color, main_language, language_stats ON planets
FOR EACH ROW
EXECUTE FUNCTION capture_planet_language_snapshot();
