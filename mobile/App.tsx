import 'react-native-get-random-values';

import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { supabase, configuredRestaurantId } from './src/lib/supabase';
import { DeliveryView } from './src/screens/DeliveryView';
import { KitchenView } from './src/screens/KitchenView';
import { ManagerView } from './src/screens/manager/ManagerView';
import { RoleId, StaffSession } from './src/types/staff';
import { extractRestaurantName } from './src/utils/orderHelpers';
import { isWithinWorkHours, getWorkScheduleMessage } from './src/utils/workScheduleHelpers';

const colors = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  dark: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  accent: '#2563EB',
  accentLight: '#3B82F6',
  success: '#16A34A',
  danger: '#DC2626',
  gradientStart: '#1E40AF',
  gradientEnd: '#3B82F6',
};

const STAFF_EMAIL_DOMAIN = '@madak.internal';

// Normalise le slug du restaurant pour l'utiliser dans l'email
const normalizeRestaurantSlug = (slug: string): string => {
  return slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
};

// Génère le domaine email basé sur le slug du restaurant
const getRestaurantEmailDomain = (restaurantSlug: string): string => {
  const normalized = normalizeRestaurantSlug(restaurantSlug);
  return `@madak-${normalized}.internal`;
};

// Convertit un username en email, en essayant d'abord le format avec restaurant si disponible
const usernameToEmail = async (value: string, restaurantId: string | null = null): Promise<string> => {
  const normalizedUsername = value.trim().toLowerCase().replace(/\s+/g, '');
  
  // Si un restaurantId est configuré, récupérer le slug et utiliser le nouveau format
  if (restaurantId) {
    try {
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('slug')
        .eq('id', restaurantId)
        .single();
      
      if (restaurant?.slug) {
        return `${normalizedUsername}${getRestaurantEmailDomain(restaurant.slug)}`;
      }
    } catch (err) {
      // Silently fall back to old format
    }
  }
  
  // Format ancien pour la compatibilité
  return `${normalizedUsername}${STAFF_EMAIL_DOMAIN}`;
};

const roles = [
  { id: 'cook', label: 'Cuisine' },
  { id: 'delivery', label: 'Livraison' },
  { id: 'manager', label: 'Gestion' },
] as const;

const getRoleLabel = (roleId: string) => roles.find((role) => role.id === roleId)?.label ?? roleId;

export default function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleId>('cook');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [screen, setScreen] = useState<'login' | 'kitchen' | 'delivery' | 'manager'>('login');
  const [staffSession, setStaffSession] = useState<StaffSession | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [workScheduleData, setWorkScheduleData] = useState<{
    enabled: boolean;
    schedule: any;
    timezone: string;
    role: string;
  } | null>(null);

  const fetchStaffProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('staff_users')
      .select('id,role,is_active,restaurant_id,work_schedule_enabled,work_schedule,restaurant:restaurants(name,timezone)')
      .eq('auth_user_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error("Impossible de vérifier votre rôle, réessayez.");
    }

    if (!data) {
      throw new Error('Ce compte ne possède pas de profil interne.');
    }

    if (!data.is_active) {
      throw new Error('Ce compte est désactivé. Contactez un gestionnaire.');
    }

    // Vérifier les horaires de travail si activés
    // Les managers peuvent toujours se connecter
    if (data.work_schedule_enabled && data.role !== 'manager') {
      const withinHours = isWithinWorkHours(data.work_schedule);
      
      if (!withinHours) {
        const scheduleMessage = getWorkScheduleMessage(data.work_schedule);
        throw new Error(
          `Vous ne pouvez vous connecter que pendant vos heures de travail.\n\n${scheduleMessage}`
        );
      }
    }

    return data;
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setFeedback({ type: 'error', message: "Entrez votre nom d'utilisateur et mot de passe." });
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      // Essayer d'abord avec le format basé sur le restaurant si configuré
      let pseudoEmail = await usernameToEmail(username, configuredRestaurantId);
      let { error } = await supabase.auth.signInWithPassword({
        email: pseudoEmail,
        password,
      });

      // Si l'authentification échoue et qu'on a utilisé le nouveau format, essayer l'ancien format
      if (error && configuredRestaurantId) {
        const normalizedUsername = username.trim().toLowerCase().replace(/\s+/g, '');
        const oldFormatEmail = `${normalizedUsername}${STAFF_EMAIL_DOMAIN}`;
        const { error: oldFormatError } = await supabase.auth.signInWithPassword({
          email: oldFormatEmail,
          password,
        });
        
        if (!oldFormatError) {
          // L'ancien format a fonctionné, continuer avec
          error = null;
        } else {
          // Les deux formats ont échoué, utiliser l'erreur originale
          throw error;
        }
      } else if (error) {
        throw error;
      }

      const { data: sessionUser } = await supabase.auth.getUser();
      const userId = sessionUser.user?.id;

      if (!userId) {
        throw new Error('Impossible de récupérer votre compte.');
      }

      const staffRecord = await fetchStaffProfile(userId);

      // Vérifier que l'utilisateur appartient au restaurant configuré
      if (configuredRestaurantId) {
        const configuredId = configuredRestaurantId.trim();
        const staffRestaurantId = String(staffRecord.restaurant_id).trim();
        
        if (configuredId !== staffRestaurantId) {
          await supabase.auth.signOut();
          throw new Error(
            'Identifiants invalides. Vérifiez votre nom d\'utilisateur et mot de passe.'
          );
        }
      }

      if (staffRecord.role !== selectedRole) {
        await supabase.auth.signOut();
        throw new Error(
          `Ce compte correspond à l'équipe "${getRoleLabel(
            staffRecord.role
          )}". Sélectionnez cet onglet pour vous connecter.`
        );
      }

      const restaurant = staffRecord.restaurant as any;

      // Stocker les informations d'horaire pour la vérification périodique
      setWorkScheduleData({
        enabled: staffRecord.work_schedule_enabled || false,
        schedule: staffRecord.work_schedule,
        timezone: 'local-device',
        role: staffRecord.role,
      });

      setStaffSession({
        role: staffRecord.role as RoleId,
        restaurantId: staffRecord.restaurant_id,
        restaurantName: extractRestaurantName(restaurant),
        staffUserId: staffRecord.id,
      });
      setScreen(
        staffRecord.role === 'delivery'
          ? 'delivery'
          : staffRecord.role === 'manager'
          ? 'manager'
          : 'kitchen'
      );
      setFeedback(null);
    } catch (err) {
      let message: string;
      
      if (err instanceof Error) {
        // Traduire les messages d'erreur de Supabase
        const errorMessage = err.message.toLowerCase();
        if (errorMessage.includes('invalid login credentials') || errorMessage.includes('invalid credentials')) {
          message = 'Identifiants invalides. Vérifiez votre nom d\'utilisateur et mot de passe.';
        } else {
          message = err.message;
        }
      } else {
        message = "La connexion a échoué. Vérifiez vos accès ou réessayez plus tard.";
      }

      setFeedback({ type: 'error', message });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setStaffSession(null);
    setWorkScheduleData(null);
    setScreen('login');
    setPassword('');
    setUsername('');
    setSelectedRole('cook');
    setHydrating(false);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const hydrate = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user?.id;
        if (userId) {
          const staffRecord = await fetchStaffProfile(userId);
          if (!isMounted) {
            return;
          }

          // Vérifier que l'utilisateur appartient au restaurant configuré
          if (configuredRestaurantId) {
            const configuredId = configuredRestaurantId.trim();
            const staffRestaurantId = String(staffRecord.restaurant_id).trim();
            
            if (configuredId !== staffRestaurantId) {
              // Déconnecter l'utilisateur si le restaurant ne correspond pas
              await supabase.auth.signOut();
              if (isMounted) {
                setFeedback({
                  type: 'error',
                  message: 'Votre session a expiré. Veuillez vous reconnecter.',
                });
              }
              return;
            }
          }

          const restaurant = staffRecord.restaurant as any;

          // Stocker les informations d'horaire pour la vérification périodique
          setWorkScheduleData({
            enabled: staffRecord.work_schedule_enabled || false,
            schedule: staffRecord.work_schedule,
            timezone: 'local-device',
            role: staffRecord.role,
          });

          setStaffSession({
            role: staffRecord.role as RoleId,
            restaurantId: staffRecord.restaurant_id,
            restaurantName: extractRestaurantName(restaurant),
            staffUserId: staffRecord.id,
          });
          setSelectedRole(staffRecord.role as RoleId);
          setScreen(
            staffRecord.role === 'delivery'
              ? 'delivery'
              : staffRecord.role === 'manager'
              ? 'manager'
              : 'kitchen'
          );
        }
      } catch (err) {
        console.warn(err);
      } finally {
        if (isMounted) {
          setHydrating(false);
        }
      }
    };

    hydrate();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setStaffSession(null);
        setWorkScheduleData(null);
        setScreen('login');
      }
    });

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, [fetchStaffProfile]);

  // Vérification périodique des horaires de travail pendant la session
  useEffect(() => {
    if (!staffSession || !workScheduleData) {
      return;
    }

    // Les managers peuvent toujours rester connectés
    if (workScheduleData.role === 'manager') {
      return;
    }

    // Si les horaires ne sont pas activés, pas de vérification
    if (!workScheduleData.enabled) {
      return;
    }

    // Vérifier régulièrement si l'employé est toujours dans ses heures
    const checkInterval = setInterval(async () => {
      const withinHours = isWithinWorkHours(workScheduleData.schedule);

      if (!withinHours) {
        // Déconnecter l'utilisateur si hors des heures de travail
        const scheduleMessage = getWorkScheduleMessage(workScheduleData.schedule);
        setFeedback({
          type: 'error',
          message: `Vos heures de travail sont terminées. Vous avez été déconnecté.\n\n${scheduleMessage}`,
        });
        await handleLogout();
      }
    }, 15000); // Vérifier environ toutes les 15 secondes

    return () => {
      clearInterval(checkInterval);
    };
  }, [staffSession, workScheduleData, handleLogout]);

  let content: ReactNode;

  if (screen === 'kitchen' && staffSession) {
    content = <KitchenView staff={staffSession} onLogout={handleLogout} />;
  } else if (screen === 'delivery' && staffSession) {
    content = <DeliveryView staff={staffSession} onLogout={handleLogout} />;
  } else if (screen === 'manager' && staffSession) {
    content = <ManagerView staff={staffSession} onLogout={handleLogout} />;
  } else if (hydrating) {
    content = (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.hydratingContainer}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.orderEmptyCopy}>Chargement…</Text>
        </View>
      </SafeAreaView>
    );
  } else {
    content = (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          style={styles.safeArea}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.container}>
              <View style={styles.hero}>
                <View style={styles.logoContainer}>
                  <View style={styles.logoCircle}>
                    <Text style={styles.logoText}>M</Text>
                  </View>
                </View>
                <Text style={styles.heroTitle}>MadakOMS</Text>
                <Text style={styles.heroSubtitle}>
                  Application interne pour accepter, cuisiner et livrer en temps réel
                </Text>
              </View>

              <View style={styles.formCard}>
                <View style={styles.formHeader}>
                  <Text style={styles.cardEyebrow}>CONNEXION</Text>
                <Text style={styles.cardTitle}>Identifiez-vous</Text>
                <Text style={styles.cardSubtitle}>
                    Utilisez vos accès gérés par le responsable pour rejoindre la cuisine, la livraison ou la gestion
                </Text>
                </View>

                <View style={styles.segmentedControl}>
                  {roles.map((role) => {
                    const isSelected = selectedRole === role.id;
                    return (
                      <TouchableOpacity
                        key={role.id}
                        onPress={() => setSelectedRole(role.id)}
                        style={[styles.segment, isSelected && styles.segmentSelected]}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[styles.segmentText, isSelected && styles.segmentTextSelected]}
                        >
                          {role.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Nom d’utilisateur</Text>
                  <TextInput
                    value={username}
                    onChangeText={setUsername}
                    keyboardType="default"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="chef-cuisine"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    textContentType="username"
                  />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Mot de passe</Text>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor={colors.muted}
                    secureTextEntry
                    style={styles.input}
                    textContentType="password"
                  />
                </View>

                {feedback && (
                  <View
                    style={[
                      styles.feedback,
                      feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError,
                    ]}
                  >
                    <Text
                      style={[
                        styles.feedbackText,
                        feedback.type === 'success'
                          ? styles.feedbackTextSuccess
                          : styles.feedbackTextError,
                      ]}
                    >
                      {feedback.message}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                  onPress={handleLogin}
                  activeOpacity={0.85}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Se connecter</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.helperTextWrapper}>
                  <Text style={styles.helperText}>
                    Besoin d’un accès ? Demandez au gestionnaire de vous inviter via Supabase.
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return <SafeAreaProvider>{content}</SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 40,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  container: {
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    gap: 24,
  },
  hero: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  logoContainer: {
    marginBottom: 16,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  heroTitle: {
    color: colors.dark,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 28,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formHeader: {
    marginBottom: 8,
    gap: 8,
  },
  cardEyebrow: {
    color: colors.accent,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.dark,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
    marginTop: 4,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 14,
    backgroundColor: colors.background,
    padding: 5,
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  segmentSelected: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  segmentText: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 14,
  },
  segmentTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  inputGroup: {
    gap: 10,
    marginBottom: 4,
  },
  inputLabel: {
    color: colors.dark,
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 2,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  linkText: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 13,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    color: colors.dark,
    fontWeight: '500',
  },
  feedback: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    marginTop: 4,
  },
  feedbackSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#BBF7D0',
  },
  feedbackError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  feedbackText: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  feedbackTextSuccess: {
    color: colors.success,
  },
  feedbackTextError: {
    color: colors.danger,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 17,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0.1,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  helperTextWrapper: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  helperText: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  hydratingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  orderEmptyCopy: {
    color: colors.muted,
    fontSize: 14,
  },
});

