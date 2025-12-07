# Intégration SMS - Notification automatique lors du changement de statut de commande

## Contexte

Notre système de commandes envoie automatiquement des SMS aux clients lors des changements de statut (commande approuvée, prête, en route, etc.). 

**Problème actuel :** Quand le statut d'une commande est modifié directement dans la base de données depuis l'application mobile, les SMS ne sont pas envoyés automatiquement.

**Solution :** Après chaque changement de statut dans la base de données, appeler une API Next.js qui enverra le SMS approprié au client.

## Ce qu'il faut faire

Après avoir mis à jour le statut d'une commande dans la base de données (Supabase), appeler l'API suivante pour déclencher l'envoi du SMS :

### Endpoint

```
POST https://votre-domaine.com/api/orders/{orderId}/send-status-sms
```

**Remplacez `{orderId}` par l'ID de la commande (UUID)**

### Exemple d'implémentation

#### Flutter/Dart

```dart
Future<void> updateOrderStatusAndSendSMS({
  required String orderId,
  required String newStatus,
}) async {
  try {
    // 1. Mettre à jour le statut dans Supabase
    final response = await supabase
        .from('orders')
        .update({'status': newStatus})
        .eq('id', orderId)
        .execute();

    if (response.hasError) {
      throw Exception('Erreur lors de la mise à jour: ${response.error}');
    }

    // 2. Appeler l'API pour envoyer le SMS
    final smsResponse = await http.post(
      Uri.parse('https://votre-domaine.com/api/orders/$orderId/send-status-sms'),
      headers: {
        'Content-Type': 'application/json',
      },
    );

    if (smsResponse.statusCode == 200) {
      final result = json.decode(smsResponse.body);
      print('SMS envoyé avec succès: ${result['sid']}');
    } else {
      // Ne pas bloquer le processus si l'envoi SMS échoue
      print('Avertissement: SMS non envoyé (${smsResponse.statusCode})');
      print('Réponse: ${smsResponse.body}');
    }
  } catch (e) {
    // Gérer l'erreur mais ne pas bloquer la mise à jour du statut
    print('Erreur lors de l\'envoi du SMS: $e');
    // Le statut a quand même été mis à jour, donc on continue
  }
}
```

#### React Native/JavaScript

```javascript
async function updateOrderStatusAndSendSMS(orderId, newStatus) {
  try {
    // 1. Mettre à jour le statut dans Supabase
    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    if (updateError) {
      throw new Error(`Erreur lors de la mise à jour: ${updateError.message}`);
    }

    // 2. Appeler l'API pour envoyer le SMS
    const response = await fetch(
      `https://votre-domaine.com/api/orders/${orderId}/send-status-sms`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      const result = await response.json();
      console.log('SMS envoyé avec succès:', result.sid);
    } else {
      // Ne pas bloquer le processus si l'envoi SMS échoue
      const error = await response.json().catch(() => ({}));
      console.warn('Avertissement: SMS non envoyé', error);
    }
  } catch (error) {
    // Gérer l'erreur mais ne pas bloquer la mise à jour du statut
    console.error('Erreur lors de l\'envoi du SMS:', error);
    // Le statut a quand même été mis à jour, donc on continue
  }
}
```

#### Swift/iOS

```swift
func updateOrderStatusAndSendSMS(orderId: String, newStatus: String) async {
    do {
        // 1. Mettre à jour le statut dans Supabase
        let updateResponse = try await supabase
            .from("orders")
            .update(["status": newStatus])
            .eq("id", value: orderId)
            .execute()
        
        // 2. Appeler l'API pour envoyer le SMS
        guard let url = URL(string: "https://votre-domaine.com/api/orders/\(orderId)/send-status-sms") else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
            if let result = try? JSONDecoder().decode([String: Any].self, from: data) {
                print("SMS envoyé avec succès: \(result["sid"] ?? "N/A")")
            }
        } else {
            // Ne pas bloquer le processus si l'envoi SMS échoue
            print("Avertissement: SMS non envoyé (code: \((response as? HTTPURLResponse)?.statusCode ?? 0))")
        }
    } catch {
        // Gérer l'erreur mais ne pas bloquer la mise à jour du statut
        print("Erreur lors de l'envoi du SMS: \(error.localizedDescription)")
        // Le statut a quand même été mis à jour, donc on continue
    }
}
```

#### Kotlin/Android

```kotlin
suspend fun updateOrderStatusAndSendSMS(orderId: String, newStatus: String) {
    try {
        // 1. Mettre à jour le statut dans Supabase
        supabase.from("orders")
            .update(mapOf("status" to newStatus)) {
                filter {
                    eq("id", orderId)
                }
            }
            .decodeSingle<Order>()
        
        // 2. Appeler l'API pour envoyer le SMS
        val client = HttpClient(CIO) {
            install(ContentNegotiation) {
                json()
            }
        }
        
        val response = client.post("https://votre-domaine.com/api/orders/$orderId/send-status-sms") {
            contentType(ContentType.Application.Json)
        }
        
        if (response.status == HttpStatusCode.OK) {
            val result = response.body<Map<String, Any>>()
            println("SMS envoyé avec succès: ${result["sid"]}")
        } else {
            // Ne pas bloquer le processus si l'envoi SMS échoue
            println("Avertissement: SMS non envoyé (code: ${response.status})")
        }
        
        client.close()
    } catch (e: Exception) {
        // Gérer l'erreur mais ne pas bloquer la mise à jour du statut
        println("Erreur lors de l'envoi du SMS: ${e.message}")
        // Le statut a quand même été mis à jour, donc on continue
    }
}
```

## Points importants

### 1. Ordre des opérations
- **D'abord** : Mettre à jour le statut dans Supabase
- **Ensuite** : Appeler l'API SMS (de manière asynchrone si possible)

### 2. Gestion des erreurs
- **Ne pas bloquer** la mise à jour du statut si l'envoi SMS échoue
- L'envoi SMS est une fonctionnalité secondaire, la mise à jour du statut est prioritaire
- Logger les erreurs pour le débogage

### 3. Statuts qui déclenchent un SMS

Les SMS sont envoyés pour ces transitions :

**Livraison (delivery) :**
- `received` → `preparing` : "Commande approuvée"
- `ready` → `enroute` : "Livreur en route"

**Cueillette (pickup) :**
- `received` → `preparing` : "Commande approuvée"
- `preparing` → `ready` : "Commande prête"

**Note :** Si le statut ne correspond à aucun de ces cas, l'API retournera un succès mais n'enverra pas de SMS (c'est normal).

### 4. Réponse de l'API

**Succès (200) :**
```json
{
  "success": true,
  "message": "SMS envoyé avec succès",
  "sid": "SM...",
  "sentTo": "+18192474616",
  "orderNumber": 92
}
```

**Pas de SMS nécessaire (200) :**
```json
{
  "success": true,
  "message": "Aucun SMS configuré pour ce statut",
  "status": "completed",
  "fulfillment": "delivery"
}
```

**Erreur (400/404/500) :**
```json
{
  "error": "Message d'erreur",
  "details": "..."
}
```

### 5. URL de l'API

**Développement local :**
```
http://localhost:3000/api/orders/{orderId}/send-status-sms
```

**Production :**
```
https://votre-domaine.com/api/orders/{orderId}/send-status-sms
```

**Important :** Remplacez `votre-domaine.com` par votre domaine réel.

## Où intégrer dans le code

Appelez cette fonction **à chaque fois** que vous modifiez le statut d'une commande, par exemple :

- Quand l'utilisateur appuie sur "Approuver la commande"
- Quand l'utilisateur appuie sur "Commande prête"
- Quand l'utilisateur appuie sur "En route"
- Toute autre action qui change le statut de `received`, `preparing`, `ready`, ou `enroute`

## Exemple d'utilisation complète

```dart
// Exemple Flutter
void onApproveOrder(String orderId) async {
  // Afficher un loader
  showLoading();
  
  try {
    // Mettre à jour le statut et envoyer le SMS
    await updateOrderStatusAndSendSMS(
      orderId: orderId,
      newStatus: 'preparing',
    );
    
    // Afficher un message de succès
    showSuccess('Commande approuvée et client notifié');
  } catch (e) {
    // Afficher une erreur
    showError('Erreur: $e');
  } finally {
    hideLoading();
  }
}
```

## Questions ?

Si vous avez des questions ou besoin de clarifications, n'hésitez pas à demander. L'objectif est que chaque changement de statut déclenche automatiquement l'envoi du SMS approprié au client.

