-- refresh_catalog_seed_query.sql
--
-- Assembles the full 01_global_catalog.sql content as a single TEXT value.
-- Executed by refresh_catalog_seed.sh via:
--   psql --tuples-only --no-align -f refresh_catalog_seed_query.sql
--
-- Only global (user_id IS NULL) rows are exported, ordered canonically so
-- the output diff is stable across runs.

SELECT
  '-- =============================================================================' || E'\n' ||
  '-- CubeFSRS: Global Algorithm Catalog Seed'                                       || E'\n' ||
  '-- Refreshed from local Supabase by supabase/scripts/refresh_catalog_seed.sh'    || E'\n' ||
  '-- Run `npm run refresh-to-catalog-seed` to regenerate.'                         || E'\n' ||
  '-- =============================================================================' || E'\n' ||
  E'\n' ||
  format('-- Categories (%s rows) %s', cat.cnt, repeat(chr(9472), 33))              || E'\n' ||
  'INSERT INTO cubefsrs.alg_category (id, slug, user_id, name, sort_order)'         || E'\n' ||
  'VALUES'                                                                           || E'\n' ||
  cat.vals                                                                           || E'\n' ||
  'ON CONFLICT (id) DO NOTHING;'                                                    || E'\n' ||
  E'\n' ||
  format('-- Subsets (%s rows) %s', sub.cnt, repeat(chr(9472), 36))                 || E'\n' ||
  'INSERT INTO cubefsrs.alg_subset (id, slug, category_id, user_id, name, sort_order)' || E'\n' ||
  'VALUES'                                                                           || E'\n' ||
  sub.vals                                                                           || E'\n' ||
  'ON CONFLICT (id) DO NOTHING;'                                                    || E'\n' ||
  E'\n' ||
  format('-- Cases (%s rows) %s', cas.cnt, repeat(chr(9472), 39))                   || E'\n' ||
  'INSERT INTO cubefsrs.alg_case (id, slug, subset_id, user_id, name, alg, sort_order)' || E'\n' ||
  'VALUES'                                                                           || E'\n' ||
  cas.vals                                                                           || E'\n' ||
  'ON CONFLICT (id) DO NOTHING;'                                                    || E'\n'
FROM
  -- Categories
  (SELECT
     COUNT(*)::int AS cnt,
     string_agg(
       format('  (%s, %s, %s, %s, %s)',
         quote_literal(id::text),
         quote_literal(slug),
         CASE WHEN user_id IS NULL THEN 'NULL' ELSE quote_literal(user_id::text) END,
         quote_literal(name),
         sort_order
       ),
       E',\n' ORDER BY sort_order
     ) AS vals
   FROM cubefsrs.alg_category
   WHERE user_id IS NULL
  ) AS cat,

  -- Subsets (ordered by parent category then subset)
  (SELECT
     COUNT(*)::int AS cnt,
     string_agg(
       format('  (%s, %s, %s, %s, %s, %s)',
         quote_literal(s.id::text),
         quote_literal(s.slug),
         quote_literal(s.category_id::text),
         CASE WHEN s.user_id IS NULL THEN 'NULL' ELSE quote_literal(s.user_id::text) END,
         quote_literal(s.name),
         s.sort_order
       ),
       E',\n' ORDER BY c.sort_order, s.sort_order
     ) AS vals
   FROM cubefsrs.alg_subset s
   JOIN cubefsrs.alg_category c ON c.id = s.category_id
   WHERE s.user_id IS NULL
  ) AS sub,

  -- Cases (ordered by category → subset → case)
  (SELECT
     COUNT(*)::int AS cnt,
     string_agg(
       format('  (%s, %s, %s, %s, %s, %s, %s)',
         quote_literal(a.id::text),
         quote_literal(a.slug),
         quote_literal(a.subset_id::text),
         CASE WHEN a.user_id IS NULL THEN 'NULL' ELSE quote_literal(a.user_id::text) END,
         quote_literal(a.name),
         quote_literal(a.alg),
         a.sort_order
       ),
       E',\n' ORDER BY c.sort_order, s.sort_order, a.sort_order
     ) AS vals
   FROM cubefsrs.alg_case a
   JOIN cubefsrs.alg_subset s ON s.id = a.subset_id
   JOIN cubefsrs.alg_category c ON c.id = s.category_id
   WHERE a.user_id IS NULL
  ) AS cas;
