/**
 * Utilitaires pour vérifier les horaires de travail des employés
 */

type DaySchedule = {
  enabled?: boolean; // Si présent, indique si le jour est activé
  start: string | null; // Format "HH:MM"
  end: string | null; // Format "HH:MM"
};

type WorkSchedule = {
  monday?: DaySchedule;
  tuesday?: DaySchedule;
  wednesday?: DaySchedule;
  thursday?: DaySchedule;
  friday?: DaySchedule;
  saturday?: DaySchedule;
  sunday?: DaySchedule;
};

/**
 * Vérifie si l'heure actuelle est dans les horaires de travail.
 *
 * Important:
 * - On utilise l'heure locale de l'appareil (téléphone / navigateur).
 * - Cela évite les différences de support de `timeZone` entre le web et React Native.
 * - Assurez‑vous que le fuseau horaire de l'appareil correspond à celui du restaurant.
 *
 * @param workSchedule - L'horaire de travail (format JSONB)
 * @returns true si l'employé est dans ses heures de travail, false sinon
 */
export function isWithinWorkHours(workSchedule: WorkSchedule | null | undefined): boolean {
  if (!workSchedule) {
    return true; // Pas d'horaire = connexion libre
  }

  // Utiliser l'heure locale de l'appareil
  const localTime = new Date();

  // Noms des jours en anglais (comme dans le JSON)
  const dayNames: (keyof WorkSchedule)[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];

  const currentDay = dayNames[localTime.getDay()];
  const daySchedule = workSchedule[currentDay];

  // Si le jour n'est pas défini, l'employé ne travaille pas
  if (!daySchedule) {
    return false;
  }

  // Vérifier le champ enabled (nouvelle structure)
  if (typeof daySchedule.enabled === 'boolean') {
    // Si enabled est explicitement false, le jour est désactivé
    if (daySchedule.enabled === false) {
      return false;
    }
    // Si enabled est true, on vérifie les heures
    if (daySchedule.enabled === true) {
      // Si start ou end sont null ou absents, on considère que c'est un jour non travaillé
      if (!daySchedule.start || !daySchedule.end) {
        return false;
      }
    }
  } else {
    // Rétrocompatibilité : si enabled n'existe pas, on vérifie si start/end sont présents
    // Si start ou end sont null ou absents, on considère que c'est un jour non travaillé
    if (!daySchedule.start || !daySchedule.end) {
      return false;
    }
  }

  // Parser les heures de début et fin
  const [startHour, startMin] = daySchedule.start.split(':').map(Number);
  const [endHour, endMin] = daySchedule.end.split(':').map(Number);

  // Convertir en minutes depuis minuit pour faciliter la comparaison
  const currentHour = localTime.getHours();
  const currentMin = localTime.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMin;
  const startTimeMinutes = startHour * 60 + startMin;
  const endTimeMinutes = endHour * 60 + endMin;

  // Vérifier si l'heure actuelle est dans la plage [start, end)
  // Note: on utilise < end (pas <=) pour exclure l'heure de fin
  return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes < endTimeMinutes;
}

/**
 * Génère un message d'erreur décrivant les horaires de travail
 * @param workSchedule - L'horaire de travail
 * @returns Message formaté avec les horaires
 */
export function getWorkScheduleMessage(workSchedule: WorkSchedule | null | undefined): string {
  if (!workSchedule) {
    return '';
  }

  const dayLabels: Record<keyof WorkSchedule, string> = {
    monday: 'Lundi',
    tuesday: 'Mardi',
    wednesday: 'Mercredi',
    thursday: 'Jeudi',
    friday: 'Vendredi',
    saturday: 'Samedi',
    sunday: 'Dimanche',
  };

  const activeDays: string[] = [];

  (Object.keys(workSchedule) as Array<keyof WorkSchedule>).forEach((day) => {
    const schedule = workSchedule[day];
    // Vérifier si le jour est activé (nouvelle structure avec enabled)
    const isDayEnabled = typeof schedule?.enabled === 'boolean' 
      ? schedule.enabled === true 
      : schedule?.start && schedule?.end; // Rétrocompatibilité
    if (isDayEnabled && schedule?.start && schedule?.end) {
      activeDays.push(`${dayLabels[day]}: ${schedule.start} - ${schedule.end}`);
    }
  });

  if (activeDays.length === 0) {
    return 'Aucun horaire de travail défini.';
  }

  return `Horaires de travail:\n${activeDays.join('\n')}`;
}

