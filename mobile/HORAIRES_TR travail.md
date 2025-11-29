# Gestion des horaires de travail pour les employés

## Colonnes à ajouter dans la table `staff_users`

Pour permettre à certains livreurs et cuisiniers de se connecter seulement pendant leurs heures de travail, vous devez ajouter les colonnes suivantes :

### 1. `work_schedule_enabled` (boolean)
- **Type**: `boolean NOT NULL DEFAULT false`
- **Description**: Active ou désactive la restriction par horaire pour cet employé
- **Valeur par défaut**: `false` (aucune restriction)
- **Utilisation**: Si `true`, l'employé ne pourra se connecter que pendant ses heures de travail

### 2. `work_schedule` (jsonb)
- **Type**: `jsonb`
- **Description**: Stocke les horaires de travail par jour de la semaine
- **Format**: Objet JSON avec les jours de la semaine comme clés

## Structure du JSON `work_schedule`

```json
{
  "monday": {
    "start": "09:00",
    "end": "17:00"
  },
  "tuesday": {
    "start": "09:00",
    "end": "17:00"
  },
  "wednesday": {
    "start": "09:00",
    "end": "17:00"
  },
  "thursday": {
    "start": "09:00",
    "end": "17:00"
  },
  "friday": {
    "start": "09:00",
    "end": "17:00"
  },
  "saturday": {
    "start": "10:00",
    "end": "18:00"
  }
}
```

**Note** : Les jours non travaillés peuvent être omis du JSON. Si un jour est présent mais que `start` ou `end` sont `null`, le jour est considéré comme non travaillé.

## Exemple d'utilisation

### Activer les horaires pour un employé

```sql
UPDATE staff_users
SET 
  work_schedule_enabled = true,
  work_schedule = '{
    "monday": {"start": "09:00", "end": "17:00"},
    "tuesday": {"start": "09:00", "end": "17:00"},
    "wednesday": {"start": "09:00", "end": "17:00"},
    "thursday": {"start": "09:00", "end": "17:00"},
    "friday": {"start": "09:00", "end": "17:00"}
  }'::jsonb
WHERE id = 'uuid-de-l-employe';
```

### Désactiver les horaires (connexion libre)

```sql
UPDATE staff_users
SET work_schedule_enabled = false
WHERE id = 'uuid-de-l-employe';
```

## Logique de vérification à implémenter

Dans votre code de connexion (fonction `fetchStaffProfile` dans `App.tsx`), vous devrez ajouter une vérification :

1. Vérifier si `work_schedule_enabled = true`
2. Si oui, vérifier que l'heure actuelle (dans le fuseau horaire du restaurant) correspond à un créneau de travail
3. Si non, rejeter la connexion avec un message approprié

### Exemple de fonction de vérification (à implémenter)

```typescript
function isWithinWorkHours(
  workSchedule: any,
  currentTime: Date,
  timezone: string = 'America/Toronto'
): boolean {
  if (!workSchedule) return true; // Pas d'horaire = connexion libre
  
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDay = dayNames[currentTime.getDay()];
  const daySchedule = workSchedule[currentDay];
  
  if (!daySchedule || !daySchedule.start || !daySchedule.end) {
    return false; // Pas de travail ce jour-là
  }
  
  const [startHour, startMin] = daySchedule.start.split(':').map(Number);
  const [endHour, endMin] = daySchedule.end.split(':').map(Number);
  
  const currentHour = currentTime.getHours();
  const currentMin = currentTime.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMin;
  const startTimeMinutes = startHour * 60 + startMin;
  const endTimeMinutes = endHour * 60 + endMin;
  
  return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes < endTimeMinutes;
}
```

## Notes importantes

- Les heures doivent être stockées dans le fuseau horaire du restaurant (colonne `timezone` dans la table `restaurants`)
- Seuls les rôles `cook` et `delivery` devraient avoir cette restriction (les `manager` peuvent se connecter à tout moment)
- Si `work_schedule_enabled = false`, l'employé peut se connecter à tout moment (comportement actuel)

