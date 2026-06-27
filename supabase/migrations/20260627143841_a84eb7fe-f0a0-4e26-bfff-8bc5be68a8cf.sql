
-- Dedupe Evolution connection_configs: keep the row with non-empty label (configured via evolution-manager),
-- otherwise the oldest row per instance_name. Repoint conversations to the kept row before deleting.
WITH ranked AS (
  SELECT id,
         lower(config->>'instance_name') AS inst,
         ROW_NUMBER() OVER (
           PARTITION BY lower(config->>'instance_name')
           ORDER BY (CASE WHEN coalesce(label,'') <> '' THEN 0 ELSE 1 END),
                    (CASE WHEN config ? 'api_key' THEN 0 ELSE 1 END),
                    created_at ASC
         ) AS rn
  FROM connection_configs
  WHERE connection_id = 'evolution' AND config->>'instance_name' IS NOT NULL
),
keepers AS (SELECT inst, id FROM ranked WHERE rn = 1),
dupes AS (SELECT r.id AS dup_id, k.id AS keep_id
          FROM ranked r JOIN keepers k ON k.inst = r.inst
          WHERE r.rn > 1)
UPDATE conversations c
SET connection_config_id = d.keep_id
FROM dupes d
WHERE c.connection_config_id = d.dup_id;

-- Now delete duplicates
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY lower(config->>'instance_name')
           ORDER BY (CASE WHEN coalesce(label,'') <> '' THEN 0 ELSE 1 END),
                    (CASE WHEN config ? 'api_key' THEN 0 ELSE 1 END),
                    created_at ASC
         ) AS rn
  FROM connection_configs
  WHERE connection_id = 'evolution' AND config->>'instance_name' IS NOT NULL
)
DELETE FROM connection_configs WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS connection_configs_evolution_instance_unique
ON connection_configs (lower(config->>'instance_name'))
WHERE connection_id = 'evolution' AND config->>'instance_name' IS NOT NULL;
