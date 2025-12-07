-- Migration: Amélioration de la structure work_schedule pour supporter l'activation/désactivation explicite des jours
-- Cette migration met à jour les données existantes pour utiliser la nouvelle structure

-- Nouvelle structure suggérée pour work_schedule:
-- {
--   "monday": { "enabled": true, "start": "09:00", "end": "17:00" },
--   "tuesday": { "enabled": true, "start": "09:00", "end": "17:00" },
--   "wednesday": { "enabled": false, "start": null, "end": null },
--   ...
-- }
-- 
-- Avantages:
-- 1. Tous les jours sont toujours présents dans le JSON
-- 2. Le champ "enabled" indique clairement si le jour est activé
-- 3. Plus facile à gérer dans l'interface utilisateur
-- 4. Distinction claire entre "désactivé" et "non défini"

-- Mise à jour des données existantes pour migrer vers la nouvelle structure
-- Les jours existants avec start/end valides sont marqués comme enabled: true
-- Les jours absents ou avec start/end null sont marqués comme enabled: false
UPDATE public.staff_users
SET work_schedule = (
  SELECT jsonb_object_agg(
    day_key,
    CASE
      WHEN day_value IS NULL THEN jsonb_build_object('enabled', false, 'start', null, 'end', null)
      WHEN (day_value->>'start') IS NOT NULL 
       AND (day_value->>'end') IS NOT NULL 
       AND (day_value->>'start') != '' 
       AND (day_value->>'end') != '' THEN
        jsonb_build_object(
          'enabled', true,
          'start', day_value->>'start',
          'end', day_value->>'end'
        )
      ELSE jsonb_build_object('enabled', false, 'start', null, 'end', null)
    END
  )
  FROM jsonb_each(
    COALESCE(
      work_schedule,
      '{}'::jsonb
    ) || jsonb_build_object(
      'monday', COALESCE(work_schedule->'monday', 'null'::jsonb),
      'tuesday', COALESCE(work_schedule->'tuesday', 'null'::jsonb),
      'wednesday', COALESCE(work_schedule->'wednesday', 'null'::jsonb),
      'thursday', COALESCE(work_schedule->'thursday', 'null'::jsonb),
      'friday', COALESCE(work_schedule->'friday', 'null'::jsonb),
      'saturday', COALESCE(work_schedule->'saturday', 'null'::jsonb),
      'sunday', COALESCE(work_schedule->'sunday', 'null'::jsonb)
    )
  ) AS days(day_key, day_value)
)
WHERE work_schedule IS NOT NULL;

-- Pour les employés sans horaire, initialiser avec tous les jours désactivés
UPDATE public.staff_users
SET work_schedule = jsonb_build_object(
  'monday', jsonb_build_object('enabled', false, 'start', null, 'end', null),
  'tuesday', jsonb_build_object('enabled', false, 'start', null, 'end', null),
  'wednesday', jsonb_build_object('enabled', false, 'start', null, 'end', null),
  'thursday', jsonb_build_object('enabled', false, 'start', null, 'end', null),
  'friday', jsonb_build_object('enabled', false, 'start', null, 'end', null),
  'saturday', jsonb_build_object('enabled', false, 'start', null, 'end', null),
  'sunday', jsonb_build_object('enabled', false, 'start', null, 'end', null)
)
WHERE work_schedule IS NULL AND work_schedule_enabled = true;

-- Mise à jour du commentaire pour refléter la nouvelle structure
COMMENT ON COLUMN public.staff_users.work_schedule IS 
  'Horaires de travail par jour de la semaine. Format JSONB avec clés: monday, tuesday, wednesday, thursday, friday, saturday, sunday. Chaque jour contient: enabled (boolean), start (time HH:MM ou null), end (time HH:MM ou null). Si enabled est false ou si start/end sont null, le jour est considéré comme non travaillé.';

