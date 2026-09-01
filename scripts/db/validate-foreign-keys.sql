-- PostgreSQL Foreign Key Validation Script
-- Validates all foreign key constraints have explicit ON DELETE behaviors
-- Run with: psql -d cooplumen -f scripts/validate-foreign-keys.sql

SELECT
  'VALIDATION REPORT: Foreign Key Constraints' AS report_header;

-- List all foreign key constraints and their ON DELETE behaviors
WITH foreign_keys AS (
  SELECT
    tc.table_schema,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    tc.constraint_name,
    rc.update_rule,
    rc.delete_rule,
    CASE rc.delete_rule
      WHEN 'CASCADE' THEN 'CASCADE: Child rows deleted when parent is deleted'
      WHEN 'SET NULL' THEN 'SET NULL: Foreign key set to NULL when parent is deleted'
      WHEN 'RESTRICT' THEN 'RESTRICT: Prevents deletion of parent if child exists'
      WHEN 'NO ACTION' THEN 'NO ACTION: Same as RESTRICT but deferred'
      WHEN 'SET DEFAULT' THEN 'SET DEFAULT: Foreign key set to default value'
      ELSE 'UNKNOWN'
    END AS delete_behavior_description
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
    AND tc.table_schema = ccu.table_schema
  JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
    AND tc.table_schema = rc.constraint_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
)
SELECT
  table_name AS "Child Table",
  column_name AS "Foreign Key Column",
  foreign_table_name AS "Parent Table",
  delete_rule AS "ON DELETE",
  delete_behavior_description AS "Behavior"
FROM foreign_keys
ORDER BY table_name, column_name;

-- Check for foreign keys without explicit ON DELETE (defaults to NO ACTION/RESTRICT)
SELECT
  'WARNING: Foreign keys using default NO ACTION/RESTRICT behavior:' AS warning_header;

WITH default_behavior_keys AS (
  SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    rc.delete_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
    AND tc.table_schema = ccu.table_schema
  JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
    AND tc.table_schema = rc.constraint_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND rc.delete_rule IN ('NO ACTION', 'RESTRICT')
)
SELECT
  table_name AS "Table",
  column_name AS "Foreign Key",
  foreign_table_name AS "References Table",
  delete_rule AS "ON DELETE",
  'Consider adding explicit ON DELETE CASCADE or SET NULL' AS "Recommendation"
FROM default_behavior_keys
ORDER BY table_name, column_name;

-- Summary statistics
WITH fk_stats AS (
  SELECT
    rc.delete_rule,
    COUNT(*) as count
  FROM information_schema.table_constraints tc
  JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
    AND tc.table_schema = rc.constraint_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
  GROUP BY rc.delete_rule
)
SELECT
  'SUMMARY: Total foreign keys by ON DELETE behavior' AS summary_header;

SELECT
  delete_rule AS "ON DELETE Behavior",
  count AS "Count",
  ROUND(100.0 * count / SUM(count) OVER (), 1) AS "Percentage"
FROM fk_stats
ORDER BY count DESC;

-- Validation check for missing indexes on foreign keys (performance optimization)
SELECT
  'PERFORMANCE CHECK: Foreign keys that may need indexing:' AS perf_header;

WITH foreign_keys_without_indexes AS (
  SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    'Missing index on foreign key column' AS issue
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  LEFT JOIN pg_indexes pi
    ON pi.tablename = tc.table_name
    AND pi.schemaname = tc.table_schema
    AND (pi.indexdef LIKE '%' || kcu.column_name || '%'
         OR pi.indexdef LIKE '%' || tc.table_name || '_' || kcu.column_name || '%')
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND pi.indexname IS NULL
  GROUP BY tc.table_name, kcu.column_name, ccu.table_name
)
SELECT
  table_name AS "Table",
  column_name AS "Foreign Key Column",
  foreign_table_name AS "References",
  issue AS "Issue"
FROM foreign_keys_without_indexes
ORDER BY table_name, column_name;