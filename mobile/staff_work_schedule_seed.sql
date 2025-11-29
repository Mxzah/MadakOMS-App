-- Seed: Exemples d'horaires de travail pour les employés
-- Ce script contient des exemples d'horaires de travail que vous pouvez utiliser
-- pour tester le système de restriction par horaire

-- ============================================================================
-- EXEMPLE 1: Horaire de jour (Lundi-Vendredi, 9h-17h)
-- ============================================================================
-- Pour un cuisinier ou livreur qui travaille en journée, semaine seulement
UPDATE public.staff_users
SET 
  work_schedule_enabled = true,
  work_schedule = '{
    "monday": { "start": "09:00", "end": "17:00" },
    "tuesday": { "start": "09:00", "end": "17:00" },
    "wednesday": { "start": "09:00", "end": "17:00" },
    "thursday": { "start": "09:00", "end": "17:00" },
    "friday": { "start": "09:00", "end": "17:00" }
  }'::jsonb
WHERE username = 'chef-jour' OR username = 'livreur-jour';
-- Remplacez 'chef-jour' ou 'livreur-jour' par les vrais usernames de vos employés

-- ============================================================================
-- EXEMPLE 2: Horaire de soir (Lundi-Dimanche, 17h-23h)
-- ============================================================================
-- Pour un cuisinier ou livreur qui travaille en soirée, tous les jours
UPDATE public.staff_users
SET 
  work_schedule_enabled = true,
  work_schedule = '{
    "monday": { "start": "17:00", "end": "23:00" },
    "tuesday": { "start": "17:00", "end": "23:00" },
    "wednesday": { "start": "17:00", "end": "23:00" },
    "thursday": { "start": "17:00", "end": "23:00" },
    "friday": { "start": "17:00", "end": "23:00" },
    "saturday": { "start": "17:00", "end": "23:00" },
    "sunday": { "start": "17:00", "end": "23:00" }
  }'::jsonb
WHERE username = 'chef-soir' OR username = 'livreur-soir';

-- ============================================================================
-- EXEMPLE 3: Horaire week-end seulement (Samedi-Dimanche, 10h-20h)
-- ============================================================================
-- Pour un employé qui travaille uniquement le week-end
UPDATE public.staff_users
SET 
  work_schedule_enabled = true,
  work_schedule = '{
    "saturday": { "start": "10:00", "end": "20:00" },
    "sunday": { "start": "10:00", "end": "20:00" }
  }'::jsonb
WHERE username = 'chef-weekend' OR username = 'livreur-weekend';

-- ============================================================================
-- EXEMPLE 4: Horaire complet restaurant (Tous les jours, horaires variables)
-- ============================================================================
-- Pour un employé qui travaille tous les jours avec des horaires différents selon le jour
UPDATE public.staff_users
SET 
  work_schedule_enabled = true,
  work_schedule = '{
    "monday": { "start": "10:00", "end": "22:00" },
    "tuesday": { "start": "10:00", "end": "22:00" },
    "wednesday": { "start": "10:00", "end": "22:00" },
    "thursday": { "start": "10:00", "end": "22:00" },
    "friday": { "start": "10:00", "end": "23:00" },
    "saturday": { "start": "10:00", "end": "23:00" },
    "sunday": { "start": "11:00", "end": "21:00" }
  }'::jsonb
WHERE username = 'chef-complet' OR username = 'livreur-complet';

-- ============================================================================
-- EXEMPLE 5: Horaire partiel (3 jours par semaine)
-- ============================================================================
-- Pour un employé qui travaille seulement certains jours
UPDATE public.staff_users
SET 
  work_schedule_enabled = true,
  work_schedule = '{
    "monday": { "start": "12:00", "end": "20:00" },
    "wednesday": { "start": "12:00", "end": "20:00" },
    "friday": { "start": "12:00", "end": "20:00" }
  }'::jsonb
WHERE username = 'chef-partiel' OR username = 'livreur-partiel';

-- ============================================================================
-- EXEMPLE 6: Horaire matin (Lundi-Vendredi, 6h-14h)
-- ============================================================================
-- Pour un employé qui travaille tôt le matin (préparation, petit-déjeuner)
UPDATE public.staff_users
SET 
  work_schedule_enabled = true,
  work_schedule = '{
    "monday": { "start": "06:00", "end": "14:00" },
    "tuesday": { "start": "06:00", "end": "14:00" },
    "wednesday": { "start": "06:00", "end": "14:00" },
    "thursday": { "start": "06:00", "end": "14:00" },
    "friday": { "start": "06:00", "end": "14:00" }
  }'::jsonb
WHERE username = 'chef-matin' OR username = 'livreur-matin';

-- ============================================================================
-- EXEMPLE 7: Horaire avec pause midi (Lundi-Vendredi, 9h-13h et 14h-18h)
-- ============================================================================
-- Note: Pour gérer une pause, vous devrez créer deux créneaux séparés
-- ou utiliser un seul créneau qui couvre toute la période (9h-18h)
-- Cette version utilise un créneau continu
UPDATE public.staff_users
SET 
  work_schedule_enabled = true,
  work_schedule = '{
    "monday": { "start": "09:00", "end": "18:00" },
    "tuesday": { "start": "09:00", "end": "18:00" },
    "wednesday": { "start": "09:00", "end": "18:00" },
    "thursday": { "start": "09:00", "end": "18:00" },
    "friday": { "start": "09:00", "end": "18:00" }
  }'::jsonb
WHERE username = 'chef-pause' OR username = 'livreur-pause';

-- ============================================================================
-- EXEMPLE 8: Désactiver les horaires pour un employé
-- ============================================================================
-- Pour permettre à un employé de se connecter à tout moment
UPDATE public.staff_users
SET 
  work_schedule_enabled = false,
  work_schedule = null
WHERE username = 'manager' OR username = 'admin';
-- Les managers peuvent toujours se connecter (vérifié dans le code)

-- ============================================================================
-- INSTRUCTIONS D'UTILISATION
-- ============================================================================
-- 1. Remplacez les usernames dans les clauses WHERE par les vrais usernames
--    de vos employés dans la table staff_users
-- 2. Ajustez les horaires selon vos besoins
-- 3. Exécutez les commandes UPDATE une par une ou toutes ensemble
-- 4. Pour vérifier les horaires d'un employé:
--    SELECT username, work_schedule_enabled, work_schedule 
--    FROM staff_users 
--    WHERE username = 'nom-utilisateur';

-- ============================================================================
-- REQUÊTE POUR VOIR TOUS LES EMPLOYÉS AVEC HORAIRES ACTIVÉS
-- ============================================================================
-- SELECT 
--   id,
--   username,
--   role,
--   work_schedule_enabled,
--   work_schedule
-- FROM staff_users
-- WHERE work_schedule_enabled = true
-- ORDER BY role, username;

