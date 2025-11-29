-- Migration: Ajout des colonnes pour gérer les horaires de travail des employés
-- Permet de restreindre la connexion aux heures de travail pour certains livreurs et cuisiniers

-- Colonne pour activer/désactiver la restriction par horaire
ALTER TABLE public.staff_users 
ADD COLUMN work_schedule_enabled boolean NOT NULL DEFAULT false;

-- Colonne pour stocker les horaires de travail (format JSONB)
-- Structure suggérée:
-- {
--   "monday": { "start": "09:00", "end": "17:00" },
--   "tuesday": { "start": "09:00", "end": "17:00" },
--   "wednesday": { "start": "09:00", "end": "17:00" },
--   "thursday": { "start": "09:00", "end": "17:00" },
--   "friday": { "start": "09:00", "end": "17:00" },
--   "saturday": { "start": "10:00", "end": "18:00" }
-- }
-- Note: Les jours non travaillés peuvent être omis ou avoir start/end à null
ALTER TABLE public.staff_users 
ADD COLUMN work_schedule jsonb;

-- Commentaires pour documentation
COMMENT ON COLUMN public.staff_users.work_schedule_enabled IS 
  'Si true, l''employé ne peut se connecter que pendant ses heures de travail définies dans work_schedule';

COMMENT ON COLUMN public.staff_users.work_schedule IS 
  'Horaires de travail par jour de la semaine. Format JSONB avec clés: monday, tuesday, wednesday, thursday, friday, saturday, sunday. Chaque jour contient: start (time HH:MM), end (time HH:MM). Si start ou end sont null/absents, le jour est considéré comme non travaillé.';

