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

import { supabase } from './src/lib/supabase';
import { DeliveryView } from './src/screens/DeliveryView';
import { KitchenView } from './src/screens/KitchenView';
import { ManagerView } from './src/screens/ManagerView';
import { RoleId, StaffSession } from './src/types/staff';
import { extractRestaurantName } from './src/utils/orderHelpers';
import { isWithinWorkHours, getWorkScheduleMessage } from './src/utils/workScheduleHelpers';

const colors = {
  background: '#F5F6FB',
  surface: '#FFFFFF',
  dark: '#1B1C1F',
  muted: '#6B7280',
  border: '#E5E7EB',
  accent: '#2563EB',
  success: '#16A34A',
  danger: '#DC2626',
};

const STAFF_EMAIL_DOMAIN = '@madak.internal';
const usernameToEmail = (value: string) =>
  `${value.trim().toLowerCase().replace(/\s+/g, '')}${STAFF_EMAIL_DOMAIN}`;

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
      const pseudoEmail = usernameToEmail(username);
      const { error } = await supabase.auth.signInWithPassword({
        email: pseudoEmail,
        password,
      });

      if (error) {
        throw error;
      }

      const { data: sessionUser } = await supabase.auth.getUser();
      const userId = sessionUser.user?.id;

      if (!userId) {
        throw new Error('Impossible de récupérer votre compte.');
      }

      const staffRecord = await fetchStaffProfile(userId);

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
      const message =
        err instanceof Error
          ? err.message
          : "La connexion a échoué. Vérifiez vos accès ou réessayez plus tard.";

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
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.shellCard}>
              <View style={styles.hero}>
                <Text style={styles.heroTitle}>MadakOMS</Text>
                <Text style={styles.heroSubtitle}>
                  Application interne pour accepter, cuisiner et livrer en temps réel.
                </Text>
              </View>

              <View style={styles.formCard}>
                <Text style={styles.cardEyebrow}>Connexion</Text>
                <Text style={styles.cardTitle}>Identifiez-vous</Text>
                <Text style={styles.cardSubtitle}>
                  Utilisez vos accès gérés par le responsable pour rejoindre la cuisine, la livraison
                  ou la gestion.
                </Text>

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
                  <View style={styles.passwordLabelRow}>
                    <Text style={styles.inputLabel}>Mot de passe</Text>
                    <TouchableOpacity>
                      <Text style={styles.linkText}>Mot de passe oublié ?</Text>
                    </TouchableOpacity>
                  </View>
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
    padding: 24,
  },
  shellCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 20,
    gap: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 18 },
    elevation: 5,
  },
  hero: {
    backgroundColor: colors.dark,
    borderRadius: 24,
    padding: 24,
    gap: 16,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
  },
  heroSubtitle: {
    color: '#E5E7EB',
    fontSize: 15,
    marginTop: 6,
    lineHeight: 22,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    gap: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  cardEyebrow: {
    color: colors.muted,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.dark,
  },
  cardSubtitle: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: colors.background,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: colors.accent,
  },
  segmentText: {
    color: colors.muted,
    fontWeight: '600',
  },
  segmentTextSelected: {
    color: '#FFFFFF',
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    color: colors.dark,
    fontWeight: '600',
    fontSize: 14,
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    backgroundColor: '#FFFFFF',
    color: colors.dark,
  },
  feedback: {
    borderRadius: 14,
    padding: 14,
  },
  feedbackSuccess: {
    backgroundColor: '#ECFDF5',
  },
  feedbackError: {
    backgroundColor: '#FEF2F2',
  },
  feedbackText: {
    fontSize: 14,
    fontWeight: '600',
  },
  feedbackTextSuccess: {
    color: colors.success,
  },
  feedbackTextError: {
    color: colors.danger,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  helperTextWrapper: {
    marginTop: 8,
  },
  helperText: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
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

