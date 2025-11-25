import 'react-native-get-random-values';

import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { supabase } from './src/lib/supabase';

const colors = {
  background: '#F5F6FB',
  surface: '#FFFFFF',
  dark: '#1B1C1F',
  muted: '#6B7280',
  border: '#E5E7EB',
  accent: '#2563EB',
  accentDark: '#1E3A8A',
  success: '#16A34A',
  danger: '#DC2626',
};

type KitchenThemeName = 'light' | 'dark';

type KitchenThemeTokens = {
  background: string;
  surface: string;
  surfaceMuted: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  pillBg: string;
  pillActiveBg: string;
  pillActiveText: string;
};

const kitchenThemes: Record<KitchenThemeName, KitchenThemeTokens> = {
  light: {
    background: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceMuted: '#FFFFFF',
    textPrimary: colors.dark,
    textSecondary: colors.muted,
    border: colors.border,
    pillBg: '#FFFFFF',
    pillActiveBg: colors.accent,
    pillActiveText: '#FFFFFF',
  },
  dark: {
    background: '#0B1120',
    surface: '#111827',
    surfaceMuted: '#1E2534',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    border: '#1E2534',
    pillBg: '#1F2A3E',
    pillActiveBg: colors.accent,
    pillActiveText: '#FFFFFF',
  },
};

const STAFF_EMAIL_DOMAIN = '@madak.internal';
const usernameToEmail = (value: string) =>
  `${value.trim().toLowerCase().replace(/\s+/g, '')}${STAFF_EMAIL_DOMAIN}`;

const roles = [
  { id: 'cook', label: 'Cuisine' },
  { id: 'delivery', label: 'Livraison' },
  { id: 'manager', label: 'Gestion' },
] as const;

type RoleId = (typeof roles)[number]['id'];
const getRoleLabel = (roleId: string) => roles.find((role) => role.id === roleId)?.label ?? roleId;

type StaffSession = {
  role: RoleId;
  restaurantId: string;
  restaurantName: string;
};

type KitchenBoardStatus = 'received' | 'preparing' | 'ready';
type KitchenStatus = KitchenBoardStatus | 'completed' | 'cancelled' | 'enroute';

type KitchenOrder = {
  id: string;
  orderNumber: number | null;
  status: KitchenStatus;
  fulfillment: 'delivery' | 'pickup';
  placedAt: string;
  scheduledAt: string | null;
  pickupName?: string | null;
  pickupPhone?: string | null;
  deliveryAddress?: Record<string, any> | null;
  customer?: {
    first_name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    modifiers?: Array<{ modifier_name: string; option_name: string }>;
  }>;
};

const ORDER_DETAIL_SELECT = `
  id,
  order_number,
  status,
  fulfillment,
  placed_at,
  scheduled_at,
  pickup_name,
  pickup_phone,
  delivery_address,
  customers:customer_id (
    first_name,
    phone,
    email
  ),
  order_items (
    id,
    name,
    quantity,
    order_item_modifiers (
      modifier_name,
      option_name
    )
  )
`;

export default function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleId>('cook');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [screen, setScreen] = useState<'login' | 'kitchen'>('login');
  const [staffSession, setStaffSession] = useState<StaffSession | null>(null);
  const [hydrating, setHydrating] = useState(true);

  const fetchStaffProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('staff_users')
      .select('role,is_active,restaurant_id,restaurant:restaurants(name)')
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
          `Ce compte correspond à l’équipe “${getRoleLabel(
            staffRecord.role
          )}”. Sélectionnez cet onglet pour vous connecter.`
        );
      }

      setStaffSession({
        role: staffRecord.role as RoleId,
        restaurantId: staffRecord.restaurant_id,
        restaurantName: extractRestaurantName(staffRecord.restaurant),
      });
      setScreen('kitchen');
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
          if (!isMounted) return;
          setStaffSession({
            role: staffRecord.role as RoleId,
            restaurantId: staffRecord.restaurant_id,
            restaurantName: extractRestaurantName(staffRecord.restaurant),
          });
          setSelectedRole(staffRecord.role as RoleId);
          setScreen(staffRecord.role === 'cook' ? 'kitchen' : 'login');
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
        setScreen('login');
      }
    });

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, [fetchStaffProfile]);

  if (screen === 'kitchen' && staffSession) {
    return (
      <KitchenView
        staff={staffSession}
        onLogout={handleLogout}
      />
    );
  }

  if (hydrating) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.hydratingContainer}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.orderEmptyCopy}>Chargement…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
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
                      <Text style={[styles.segmentText, isSelected && styles.segmentTextSelected]}>
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
  historyWrapper: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  historyFiltersRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  dateFilterPill: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#ECEEF4',
    paddingVertical: 10,
    alignItems: 'center',
  },
  dateFilterPillActive: {
    backgroundColor: colors.dark,
  },
  dateFilterPillLabel: {
    fontWeight: '600',
    color: colors.muted,
  },
  dateFilterPillLabelActive: {
    color: '#FFFFFF',
  },
  historySearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  historySearchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    color: colors.dark,
  },
  historyClearButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.border,
  },
  historyClearButtonText: {
    fontWeight: '600',
    color: colors.dark,
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ECEEF4',
  },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyOrderNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  historyStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  historyStatusText: {
    fontWeight: '700',
  },
  historyMeta: {
    color: colors.muted,
    fontSize: 13,
    marginBottom: 4,
  },
  kitchenSafeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  kitchenHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  kitchenTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.dark,
  },
  kitchenSubtitle: {
    marginTop: 4,
    color: colors.muted,
  },
  kitchenActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  logoutButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.border,
  },
  logoutButtonText: {
    fontWeight: '600',
    color: colors.dark,
  },
  kitchenTabBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: '#ECEEF4',
    borderRadius: 18,
    padding: 4,
    gap: 4,
  },
  kitchenTabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
  },
  kitchenTabButtonActive: {
    backgroundColor: colors.accent,
  },
  kitchenTabLabel: {
    fontWeight: '600',
    color: colors.muted,
  },
  kitchenTabLabelActive: {
    color: '#FFFFFF',
  },
  kitchenContent: {
    flex: 1,
    marginTop: 16,
  },
  placeholderPane: {
    margin: 20,
    borderRadius: 20,
    padding: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.dark,
  },
  placeholderCopy: {
    color: colors.muted,
    textAlign: 'center',
  },
  settingsWrapper: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    gap: 18,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  settingsSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.dark,
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  settingsLabel: {
    fontWeight: '600',
    color: colors.dark,
    flex: 1,
  },
  settingsDescription: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
  pillSwitch: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.border,
  },
  pillSwitchActive: {
    backgroundColor: colors.accent,
  },
  pillSwitchText: {
    color: colors.dark,
    fontWeight: '600',
  },
  pillSwitchTextActive: {
    color: '#FFFFFF',
  },
  themeToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  logoutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  logoutTitle: {
    color: colors.dark,
    fontSize: 18,
    fontWeight: '700',
  },
  logoutSubtitle: {
    color: colors.muted,
    fontSize: 13,
  },
  logoutButtonLarge: {
    marginTop: 8,
    backgroundColor: '#F43F5E',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutButtonLargeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  appVersionText: {
    color: colors.muted,
    fontSize: 12,
  },
  ordersWrapper: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#ECEEF4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  filterPillActive: {
    backgroundColor: colors.dark,
  },
  filterPillLabel: {
    fontWeight: '600',
    color: colors.muted,
    flexShrink: 1,
    textAlign: 'center',
  },
  filterPillLabelActive: {
    color: '#FFFFFF',
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  orderHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  fulfillmentBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  fulfillmentText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  orderMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  orderMetaItem: {
    color: colors.muted,
    fontSize: 13,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  priorityPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  priorityPillLate: {
    backgroundColor: '#FEF3C7',
  },
  priorityPillLateDark: {
    backgroundColor: '#F97316',
  },
  priorityPillSoon: {
    backgroundColor: '#DBEAFE',
  },
  priorityPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.dark,
  },
  priorityPillTextDark: {
    color: '#FFFFFF',
  },
  listSectionHeader: {
    fontWeight: '700',
    color: colors.muted,
    marginVertical: 8,
  },
  orderEmptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  orderEmptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.dark,
  },
  orderEmptyCopy: {
    color: colors.muted,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    maxHeight: '85%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 50,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.border,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.dark,
  },
  modalSectionTitle: {
    marginTop: 16,
    marginBottom: 8,
    fontWeight: '700',
    color: colors.dark,
  },
  modalListItem: {
    marginBottom: 12,
  },
  modalListItemTitle: {
    fontWeight: '600',
    color: colors.dark,
  },
  modalListItemMeta: {
    color: colors.muted,
    marginTop: 4,
  },
  modalActionsRow: {
    marginTop: 20,
    gap: 12,
  },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.dark,
    fontWeight: '600',
  },
  destructiveButton: {
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#F87171',
    alignItems: 'center',
  },
  destructiveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modalPrimaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalPrimaryButtonDisabled: {
    opacity: 0.5,
  },
  modalPrimaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});

const kitchenTabs = [
  { id: 'orders', label: 'Commandes' },
  { id: 'history', label: 'Historique' },
  { id: 'settings', label: 'Réglages' },
] as const;

type KitchenTabId = (typeof kitchenTabs)[number]['id'];

function KitchenView({ staff, onLogout }: { staff: StaffSession; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<KitchenTabId>('orders');
  const [settings, setSettings] = useState({
    soundEnabled: true,
    theme: 'light' as 'light' | 'dark',
  });
  const kitchenTheme = kitchenThemes[settings.theme];
  const isDark = settings.theme === 'dark';

  const placeholderContent = useMemo(() => {
    if (activeTab === 'history') {
      return {
        title: 'Historique des commandes',
        copy: 'Cette section affichera bientôt la liste des commandes terminées et annulées.',
      };
    }
    return {
      title: 'Paramètres cuisine',
      copy: 'Configurez les notifications, les imprimantes et les préférences d’affichage dans une prochaine version.',
    };
  }, [activeTab]);

  return (
    <SafeAreaView style={[styles.kitchenSafeArea, { backgroundColor: kitchenTheme.background }]}>
      <StatusBar style={settings.theme === 'dark' ? 'light' : 'dark'} />
      <View
        style={[
          styles.kitchenHeader,
          {
            backgroundColor: kitchenTheme.surface,
          },
        ]}
      >
        <Text style={[styles.kitchenTitle, { color: kitchenTheme.textPrimary }]}>
          Cuisine — MadakOMS
        </Text>
        <Text style={[styles.kitchenSubtitle, { color: kitchenTheme.textSecondary }]}>
          Rôle: {getRoleLabel(staff.role)}
        </Text>
        <Text style={[styles.kitchenSubtitle, { color: kitchenTheme.textSecondary }]}>
          {staff.restaurantName}
        </Text>
      </View>

      <View
        style={[
          styles.kitchenTabBar,
          {
            backgroundColor: kitchenTheme.surfaceMuted,
            borderColor: isDark ? '#1E2534' : 'transparent',
          },
        ]}
      >
        {kitchenTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={[
                styles.kitchenTabButton,
                { backgroundColor: isActive ? kitchenTheme.pillActiveBg : 'transparent' },
              ]}
            >
              <Text
                style={[
                  styles.kitchenTabLabel,
                  { color: isActive ? kitchenTheme.pillActiveText : kitchenTheme.textSecondary },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.kitchenContent}>
        {activeTab === 'orders' ? (
          <OrdersTab restaurantId={staff.restaurantId} theme={kitchenTheme} isDark={isDark} />
        ) : activeTab === 'history' ? (
          <HistoryTab restaurantId={staff.restaurantId} theme={kitchenTheme} isDark={isDark} />
        ) : (
          <SettingsTab
            onLogout={onLogout}
            settings={settings}
            onChangeSettings={setSettings}
            theme={kitchenTheme}
            isDark={isDark}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const ORDER_FILTERS: Array<{ id: KitchenBoardStatus; label: string }> = [
  { id: 'received', label: 'Nouvelles' },
  { id: 'preparing', label: 'En préparation' },
  { id: 'ready', label: 'Prêtes' },
];

type OrdersTabProps = {
  restaurantId: string;
  theme: KitchenThemeTokens;
  isDark: boolean;
};

function OrdersTab({ restaurantId, theme, isDark }: OrdersTabProps) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<KitchenBoardStatus>('received');
  const [selectedOrder, setSelectedOrder] = useState<KitchenOrder | null>(null);
  const [mutatingOrderId, setMutatingOrderId] = useState<string | null>(null);

  const fetchOrders = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_DETAIL_SELECT)
        .eq('restaurant_id', restaurantId)
        .in('status', ['received', 'preparing', 'ready'])
        .order('placed_at', { ascending: true });

      if (error) {
        throw error;
      }

      const normalized = data?.map(mapOrderRowToKitchenOrder) ?? [];

      setOrders(normalized);
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error
          ? err.message
          : 'Impossible de charger les commandes. Vérifiez votre connexion.'
      );
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(() => fetchOrders({ silent: true }), 15000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const visibleOrders = useMemo(
    () => orders.filter((order) => order.status === statusFilter),
    [orders, statusFilter]
  );

  const totalByStatus = useMemo(() => {
    return ORDER_FILTERS.reduce<Record<KitchenBoardStatus, number>>((acc, filter) => {
      acc[filter.id] = orders.filter((order) => order.status === filter.id).length;
      return acc;
    }, { received: 0, preparing: 0, ready: 0 });
  }, [orders]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders({ silent: true });
  }, [fetchOrders]);

  const updateOrderStatus = useCallback(
    async (order: KitchenOrder, nextStatus: 'preparing' | 'ready' | 'cancelled') => {
      setMutatingOrderId(order.id);
      try {
        const { error } = await supabase
          .from('orders')
          .update({ status: nextStatus })
          .eq('id', order.id);

        if (error) {
          throw error;
        }

        await fetchOrders();
        setSelectedOrder(null);
        if (nextStatus === 'cancelled') {
          setStatusFilter('received');
        }
      } catch (err) {
        Alert.alert(
          'Erreur',
          err instanceof Error ? err.message : 'Impossible de mettre à jour la commande.'
        );
      } finally {
        setMutatingOrderId(null);
      }
    },
    [fetchOrders]
  );

  const handleCancel = useCallback(
    (order: KitchenOrder) => {
      Alert.alert(
        'Annuler la commande',
        'Êtes-vous certain de vouloir annuler cette commande ?',
        [
          { text: 'Non', style: 'cancel' },
          {
            text: 'Oui, annuler',
            style: 'destructive',
            onPress: () => updateOrderStatus(order, 'cancelled'),
          },
        ]
      );
    },
    [updateOrderStatus]
  );

  const renderOrder = ({ item }: { item: KitchenOrder }) => {
    const itemCount = item.items.reduce((sum, i) => sum + (i.quantity ?? 0), 0);
    const priorityFlags = getPriorityFlags(item);
    return (
      <Pressable
        style={[
          styles.orderCard,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
        onPress={() => setSelectedOrder(item)}
      >
        <View style={styles.orderHeaderRow}>
          <Text style={[styles.orderNumber, { color: theme.textPrimary }]}>
            #{item.orderNumber ?? '—'}
          </Text>
          <View
            style={[
              styles.fulfillmentBadge,
              { backgroundColor: item.fulfillment === 'delivery' ? colors.accent : colors.dark },
            ]}
          >
            <Text style={styles.fulfillmentText}>
              {item.fulfillment === 'delivery' ? 'Livraison' : 'Pickup'}
            </Text>
          </View>
        </View>

        <View style={styles.orderMetaRow}>
          <Text style={[styles.orderMetaItem, { color: theme.textSecondary }]}>
            Placée: {formatTime(item.placedAt)}
          </Text>
          {item.scheduledAt ? (
            <Text style={[styles.orderMetaItem, { color: theme.textSecondary }]}>
              Prévue: {formatTime(item.scheduledAt)}
            </Text>
          ) : null}
          <Text style={[styles.orderMetaItem, { color: theme.textSecondary }]}>
            {itemCount} articles
          </Text>
        </View>

        {priorityFlags.length > 0 && (
        <View style={styles.priorityRow}>
            {priorityFlags.map((flag) => (
              <View
                key={flag.label}
                style={[
                  styles.priorityPill,
                  flag.type === 'late' && (isDark ? styles.priorityPillLateDark : styles.priorityPillLate),
                  flag.type === 'soon' && styles.priorityPillSoon,
                ]}
              >
                <Text
                  style={[
                    styles.priorityPillText,
                    flag.type === 'late' && isDark
                      ? styles.priorityPillTextDark
                      : { color: theme.textPrimary },
                  ]}
                >
                  {flag.label}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Pressable>
    );
  };

  const primaryActionForOrder = (order: KitchenOrder) => {
    if (order.status === 'received') {
      return { label: 'Accepter et préparer', next: 'preparing' as const };
    }
    if (order.status === 'preparing') {
      return { label: 'Marquer prêt', next: 'ready' as const };
    }
    return null;
  };

  return (
    <View style={styles.ordersWrapper}>
      <View style={styles.filterPillsRow}>
        {ORDER_FILTERS.map((filter) => {
          const isActive = statusFilter === filter.id;
          return (
            <TouchableOpacity
              key={filter.id}
              onPress={() => setStatusFilter(filter.id)}
              style={[
                styles.filterPill,
                {
                  backgroundColor: isActive ? theme.pillActiveBg : theme.pillBg,
                  borderColor: isActive ? theme.pillActiveBg : theme.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterPillLabel,
                  { color: isActive ? theme.pillActiveText : theme.textSecondary },
                ]}
              >
                {filter.label} ({totalByStatus[filter.id]})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.orderEmptyState}>
          <ActivityIndicator color={colors.accent} />
          <Text
            style={[
              styles.orderEmptyCopy,
              { color: theme.textSecondary },
            ]}
          >
            Chargement des commandes…
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <View style={styles.orderEmptyState}>
              <Text style={[styles.orderEmptyTitle, { color: theme.textPrimary }]}>
                Rien à traiter
              </Text>
              <Text style={[styles.orderEmptyCopy, { color: theme.textSecondary }]}>
                Les commandes apparaîtront ici dès qu’elles seront{' '}
                {ORDER_FILTERS.find((f) => f.id === statusFilter)?.label?.toLowerCase() ??
                  'disponibles'}
                .
              </Text>
            </View>
          }
        />
      )}

      <Modal
        visible={Boolean(selectedOrder)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedOrder(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedOrder(null)}>
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.modalHandle} />
            {selectedOrder && (
              <>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
                  Commande #{selectedOrder.orderNumber ?? '—'}
                </Text>
                <Text style={[styles.orderMetaItem, { color: theme.textSecondary }]}>
                  {selectedOrder.fulfillment === 'delivery'
                    ? 'Livraison'
                    : 'Pickup'}{' '}
                  · Placée {formatTime(selectedOrder.placedAt)}
                </Text>

                <Text style={[styles.modalSectionTitle, { color: theme.textPrimary }]}>
                  Articles
                </Text>
                {selectedOrder.items.map((item) => (
                  <View key={item.id} style={styles.modalListItem}>
                    <Text style={[styles.modalListItemTitle, { color: theme.textPrimary }]}>
                      {item.quantity} × {item.name}
                    </Text>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <Text style={[styles.modalListItemMeta, { color: theme.textSecondary }]}>
                        {item.modifiers.map((mod) => mod.option_name).join(', ')}
                      </Text>
                    )}
                  </View>
                ))}

                <Text style={[styles.modalSectionTitle, { color: theme.textPrimary }]}>
                  Client
                </Text>
                <Text style={[styles.modalListItemTitle, { color: theme.textPrimary }]}>
                  {getCustomerName(selectedOrder)}
                </Text>
                <Text style={[styles.modalListItemMeta, { color: theme.textSecondary }]}>
                  {getCustomerPhone(selectedOrder)}
                </Text>
                <Text style={[styles.modalListItemMeta, { color: theme.textSecondary }]}>
                    {selectedOrder.customer?.email ?? '—'}
                </Text>
                {selectedOrder.fulfillment === 'delivery' && (
                  <Text style={[styles.modalListItemMeta, { color: theme.textSecondary }]}>
                    {formatAddress(selectedOrder.deliveryAddress)}
                  </Text>
                )}

                <View style={styles.modalActionsRow}>
                  {primaryActionForOrder(selectedOrder) && (
                    <TouchableOpacity
                      style={[
                        styles.modalPrimaryButton,
                        mutatingOrderId === selectedOrder.id && styles.modalPrimaryButtonDisabled,
                      ]}
                      onPress={() =>
                        updateOrderStatus(selectedOrder, primaryActionForOrder(selectedOrder)!.next)
                      }
                      disabled={mutatingOrderId === selectedOrder.id}
                    >
                      {mutatingOrderId === selectedOrder.id ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.modalPrimaryButtonText}>
                          {primaryActionForOrder(selectedOrder)!.label}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.secondaryButton,
                      {
                        backgroundColor: isDark ? '#000000' : '#FFFFFF',
                        borderColor: isDark ? '#475569' : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedOrder(null)}
                  >
                    <Text
                      style={[
                        styles.secondaryButtonText,
                        { color: isDark ? '#FFFFFF' : colors.dark },
                      ]}
                    >
                      Fermer
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.destructiveButton}
                    onPress={() => handleCancel(selectedOrder)}
                  >
                    <Text style={styles.destructiveButtonText}>Annuler</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const formatTime = (isoString: string | null) => {
  if (!isoString) {
    return '—';
  }
  const date = new Date(isoString);
  return date.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
};

const getPriorityFlags = (order: KitchenOrder) => {
  const flags: Array<{ label: string; type: 'late' | 'soon' }> = [];
  const now = Date.now();
  const placed = new Date(order.placedAt).getTime();
  const scheduled = order.scheduledAt ? new Date(order.scheduledAt).getTime() : null;

  const lateThreshold = order.fulfillment === 'delivery' ? 15 : 10; // minutes
  if ((order.status === 'received' || order.status === 'preparing') && now - placed > lateThreshold * 60000) {
    flags.push({ label: 'Retard', type: 'late' });
  }

  if (scheduled && scheduled - now < 15 * 60000 && scheduled > now) {
    flags.push({ label: 'Prévu bientôt', type: 'soon' });
  }

  return flags;
};

const formatAddress = (address?: Record<string, any> | null) => {
  if (!address) return '';
  const parts = [address.line1, address.city, address.postal_code].filter(Boolean);
  return parts.join(', ');
};

const getCustomerName = (order: KitchenOrder) => {
  if (order.fulfillment === 'pickup') {
    return order.pickupName || order.customer?.first_name || 'Client';
  }
  return (
    order.deliveryAddress?.name ||
    order.customer?.first_name ||
    'Client'
  );
};

const getCustomerPhone = (order: KitchenOrder) => {
  if (order.fulfillment === 'pickup') {
    return order.pickupPhone || order.customer?.phone || '—';
  }
  return order.deliveryAddress?.phone || order.customer?.phone || '—';
};

const mapOrderRowToKitchenOrder = (row: any): KitchenOrder => {
  const customerRaw = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  return {
    id: row.id,
    orderNumber: row.order_number ?? null,
    status: row.status as KitchenStatus,
    fulfillment: row.fulfillment,
    placedAt: row.placed_at,
    scheduledAt: row.scheduled_at,
    pickupName: row.pickup_name,
    pickupPhone: row.pickup_phone,
    deliveryAddress: row.delivery_address,
    customer: customerRaw
      ? {
          first_name: customerRaw.first_name,
          phone: customerRaw.phone,
          email: customerRaw.email,
        }
      : null,
    items:
      row.order_items?.map((item: any) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        modifiers: item.order_item_modifiers ?? [],
      })) ?? [],
  };
};

const extractRestaurantName = (
  restaurantField: { name?: string } | null | Array<{ name?: string }>
) => {
  if (Array.isArray(restaurantField)) {
    return restaurantField[0]?.name ?? 'Restaurant';
  }
  return restaurantField?.name ?? 'Restaurant';
};

type HistoryOrder = {
  id: string;
  orderNumber: number | null;
  status: string;
  fulfillment: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  placedAt: string;
};

function HistoryTab({
  restaurantId,
  theme,
  isDark,
}: {
  restaurantId: string;
  theme: KitchenThemeTokens;
  isDark: boolean;
}) {
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<'today' | 'week'>('today');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<KitchenOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const baseQuery = supabase
        .from('orders')
        .select(
          `
          id,
          order_number,
          status,
          fulfillment,
          updated_at,
          completed_at,
          cancelled_at,
          placed_at
        `
        )
        .eq('restaurant_id', restaurantId)
        .order('updated_at', { ascending: false })
        .limit(100);

      if (search.trim()) {
        const number = Number(search.trim());
        if (!Number.isNaN(number)) {
          baseQuery.eq('order_number', number);
        } else {
          setOrders([]);
          setLoading(false);
          return;
        }
      } else {
        const start = new Date();
        if (range === 'today') {
          start.setHours(0, 0, 0, 0);
        } else {
          start.setDate(start.getDate() - 7);
        }
        baseQuery.gte('updated_at', start.toISOString());
      }

      baseQuery.in('status', ['completed', 'cancelled', 'preparing', 'ready', 'enroute']);

      const { data, error } = await baseQuery;
      if (error) throw error;

      const mapped =
        data?.map((row) => ({
          id: row.id,
          orderNumber: row.order_number ?? null,
          status: row.status,
          fulfillment: row.fulfillment,
          updatedAt: row.updated_at,
          completedAt: row.completed_at,
          cancelledAt: row.cancelled_at,
          placedAt: row.placed_at,
        })) ?? [];

      setOrders(mapped);
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error
          ? err.message
          : "Impossible d'afficher l'historique pour le moment."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId, range, search]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchHistory();
  }, [fetchHistory]);

  const historyFilters = [
    { id: 'today', label: "Aujourd'hui" },
    { id: 'week', label: '7 derniers jours' },
  ] as const;

  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders;
    return orders.filter((order) => `${order.orderNumber ?? ''}`.includes(search.trim()));
  }, [orders, search]);

  const openHistoryOrder = useCallback(
    async (orderId: string) => {
      setDetailLoading(true);
      try {
        const { data, error } = await supabase
          .from('orders')
          .select(ORDER_DETAIL_SELECT)
          .eq('id', orderId)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          setSelectedOrder(mapOrderRowToKitchenOrder(data));
        }
      } catch (err) {
        Alert.alert(
          'Erreur',
          err instanceof Error
            ? err.message
            : 'Impossible de charger les détails de la commande.'
        );
      } finally {
        setDetailLoading(false);
      }
    },
    []
  );

  const renderHistoryItem = ({ item }: { item: HistoryOrder }) => {
    const badgeStyle = historyStatusStyle(item.status);
    return (
      <Pressable
        style={[
          styles.historyCard,
          {
            backgroundColor: theme.surface,
            borderColor: 'transparent',
            shadowColor: '#000',
            shadowOpacity: theme === kitchenThemes.dark ? 0.2 : 0.05,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 2,
          },
        ]}
        onPress={() => openHistoryOrder(item.id)}
      >
        <View style={styles.historyHeaderRow}>
          <Text style={[styles.historyOrderNumber, { color: theme.textPrimary }]}>
            #{item.orderNumber ?? '—'}
          </Text>
          <View
            style={[styles.historyStatusBadge, { backgroundColor: badgeStyle.backgroundColor }]}
          >
            <Text style={[styles.historyStatusText, { color: badgeStyle.color }]}>
              {statusLabel(item.status)}
            </Text>
          </View>
        </View>
        <Text style={[styles.historyMeta, { color: theme.textSecondary }]}>
          {item.fulfillment === 'delivery' ? 'Livraison' : 'Pickup'} · Placée{' '}
          {formatTime(item.placedAt)}
        </Text>
        <Text style={[styles.historyMeta, { color: theme.textSecondary }]}>
          {historySubtitle(item)}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.historyWrapper}>
      <View style={styles.historyFiltersRow}>
        {historyFilters.map((filter) => {
          const isActive = range === filter.id;
          return (
            <TouchableOpacity
              key={filter.id}
              onPress={() => {
                setRange(filter.id);
                setSearch('');
              }}
              style={[
                styles.dateFilterPill,
                {
                  backgroundColor: isActive ? theme.pillActiveBg : '#ECEEF4',
                },
              ]}
            >
              <Text
                style={[
                  styles.dateFilterPillLabel,
                  { color: isActive ? theme.pillActiveText : theme.textSecondary },
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.historySearchRow}>
        <TextInput
          style={[
            styles.historySearchInput,
            {
              backgroundColor: theme.surface,
              color: theme.textPrimary,
              borderColor: isDark ? '#1E2534' : '#ECEEF4',
            },
          ]}
          placeholder="Rechercher par numéro (#1048)"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity
            style={[styles.historyClearButton, { backgroundColor: theme.pillBg }]}
            onPress={() => setSearch('')}
          >
            <Text style={[styles.historyClearButtonText, { color: theme.textPrimary }]}>
              Effacer
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.orderEmptyState}>
          <ActivityIndicator color={colors.accent} />
          <Text
            style={[
              styles.orderEmptyCopy,
              { color: theme.textSecondary },
            ]}
          >
            Chargement de l’historique…
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderHistoryItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <View style={styles.orderEmptyState}>
              <Text style={[styles.orderEmptyTitle, { color: theme.textPrimary }]}>
                Aucun résultat
              </Text>
              <Text style={[styles.orderEmptyCopy, { color: theme.textSecondary }]}>
                Saisissez un numéro de commande ou ajustez l’intervalle.
              </Text>
            </View>
          }
        />
      )}

      <Modal
        visible={Boolean(selectedOrder) || detailLoading}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedOrder(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedOrder(null)}>
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.modalHandle} />
            {detailLoading ? (
              <View style={styles.orderEmptyState}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.orderEmptyCopy}>Chargement…</Text>
              </View>
            ) : selectedOrder ? (
              <>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
                  Commande #{selectedOrder.orderNumber ?? '—'}
                </Text>
                <Text style={[styles.orderMetaItem, { color: theme.textSecondary }]}>
                  {selectedOrder.fulfillment === 'delivery' ? 'Livraison' : 'Pickup'} · Placée{' '}
                  {formatTime(selectedOrder.placedAt)}
                </Text>
                <Text style={[styles.orderMetaItem, { color: theme.textSecondary }]}>
                  Statut: {statusLabel(selectedOrder.status)}
                </Text>

                <Text style={[styles.modalSectionTitle, { color: theme.textPrimary }]}>
                  Articles
                </Text>
                {selectedOrder.items.map((item) => (
                  <View key={item.id} style={styles.modalListItem}>
                    <Text style={[styles.modalListItemTitle, { color: theme.textPrimary }]}>
                      {item.quantity} × {item.name}
                    </Text>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <Text style={[styles.modalListItemMeta, { color: theme.textSecondary }]}>
                        {item.modifiers.map((mod) => mod.option_name).join(', ')}
                      </Text>
                    )}
                  </View>
                ))}

                <Text style={[styles.modalSectionTitle, { color: theme.textPrimary }]}>
                  Client
                </Text>
                <Text style={[styles.modalListItemTitle, { color: theme.textPrimary }]}>
                  {getCustomerName(selectedOrder)}
                </Text>
                <Text style={[styles.modalListItemMeta, { color: theme.textSecondary }]}>
                  {getCustomerPhone(selectedOrder)}
                </Text>
                <Text style={[styles.modalListItemMeta, { color: theme.textSecondary }]}>
                  {selectedOrder.customer?.email ?? '—'}
                </Text>
                {selectedOrder.fulfillment === 'delivery' && (
                  <Text style={[styles.modalListItemMeta, { color: theme.textSecondary }]}>
                    {formatAddress(selectedOrder.deliveryAddress)}
                  </Text>
                )}

                <View style={styles.modalActionsRow}>
                  <TouchableOpacity
                    style={[
                      styles.secondaryButton,
                      {
                        backgroundColor: isDark ? '#000000' : '#FFFFFF',
                        borderColor: isDark ? '#475569' : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedOrder(null)}
                  >
                    <Text
                      style={[
                        styles.secondaryButtonText,
                        { color: isDark ? '#FFFFFF' : colors.dark },
                      ]}
                    >
                      Fermer
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const statusLabel = (status: string) => {
  switch (status) {
    case 'completed':
      return 'Terminée';
    case 'cancelled':
      return 'Annulée';
    case 'ready':
      return 'Prête';
    case 'preparing':
      return 'En préparation';
    case 'enroute':
      return 'En route';
    default:
      return status;
  }
};

const historySubtitle = (order: HistoryOrder) => {
  if (order.status === 'completed' && order.completedAt) {
    return `Terminée ${formatTime(order.completedAt)}`;
  }
  if (order.status === 'cancelled' && order.cancelledAt) {
    return `Annulée ${formatTime(order.cancelledAt)}`;
  }
  return `Modifiée ${formatTime(order.updatedAt)}`;
};

const historyStatusStyle = (status: string) => {
  switch (status) {
    case 'completed':
      return { backgroundColor: '#DCFCE7', color: '#15803D' };
    case 'cancelled':
      return { backgroundColor: '#FEE2E2', color: '#B91C1C' };
    default:
      return { backgroundColor: '#1D4ED8', color: '#FFFFFF' };
  }
};

function SettingsTab({
  settings,
  onChangeSettings,
  onLogout,
  theme,
  isDark,
}: {
  settings: { soundEnabled: boolean; theme: 'light' | 'dark' };
  onChangeSettings: (value: { soundEnabled: boolean; theme: 'light' | 'dark' }) => void;
  onLogout: () => void;
  theme: KitchenThemeTokens;
  isDark: boolean;
}) {
  const toggleSound = () =>
    onChangeSettings({ ...settings, soundEnabled: !settings.soundEnabled });

  const switchTheme = (theme: 'light' | 'dark') => {
    onChangeSettings({ ...settings, theme });
  };

  return (
    <ScrollView style={styles.settingsWrapper} contentContainerStyle={{ paddingTop: 12 }}>
      <View
        style={[
          styles.settingsCard,
          {
            backgroundColor: isDark ? '#111827' : '#FFFFFF',
            shadowOpacity: isDark ? 0.15 : 0.05,
          },
        ]}
      >
        <Text style={[styles.settingsSectionTitle, { color: theme.textPrimary }]}>
          Notifications
        </Text>
        <View>
        <View style={styles.settingsRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingsLabel, { color: theme.textPrimary }]}>
              Sons en cuisine
            </Text>
            <Text style={[styles.settingsDescription, { color: theme.textSecondary }]}>
              Joue un signal lorsque de nouvelles commandes arrivent.
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.pillSwitch,
              settings.soundEnabled && styles.pillSwitchActive,
              {
                backgroundColor: settings.soundEnabled
                  ? colors.accent
                  : isDark
                  ? '#1F2937'
                  : '#ECEEF4',
              },
            ]}
            onPress={toggleSound}
          >
            <Text
              style={[
                styles.pillSwitchText,
                { color: settings.soundEnabled ? '#FFFFFF' : theme.textPrimary },
              ]}
            >
              {settings.soundEnabled ? 'Activé' : 'Muet'}
            </Text>
          </TouchableOpacity>
        </View>
        </View>
      </View>

      <View
        style={[
          styles.settingsCard,
          {
            backgroundColor: isDark ? '#111827' : '#FFFFFF',
            shadowOpacity: isDark ? 0.15 : 0.05,
          },
        ]}
      >
        <Text style={[styles.settingsSectionTitle, { color: theme.textPrimary }]}>Apparence</Text>
        <Text style={[styles.settingsDescription, { color: theme.textSecondary }]}>
          Chaque cuisinier peut choisir son thème préféré.
        </Text>
        <View style={styles.themeToggleRow}>
          {(['light', 'dark'] as const).map((themeOption) => (
            <TouchableOpacity
              key={themeOption}
              style={[
                styles.pillSwitch,
                settings.theme === themeOption && styles.pillSwitchActive,
                {
                  flex: 1,
                  alignItems: 'center',
                  backgroundColor:
                    settings.theme === themeOption
                      ? colors.accent
                      : isDark
                      ? '#1F2937'
                      : '#ECEEF4',
                },
              ]}
              onPress={() => switchTheme(themeOption)}
            >
              <Text
                style={[
                  styles.pillSwitchText,
                  { color: settings.theme === themeOption ? '#FFFFFF' : theme.textPrimary },
                ]}
              >
                {themeOption === 'light' ? 'Mode clair' : 'Mode sombre'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View
        style={[
          styles.logoutCard,
          {
            backgroundColor: isDark ? '#111827' : '#FFFFFF',
            shadowOpacity: isDark ? 0.15 : 0.05,
          },
        ]}
      >
        <Text style={[styles.logoutTitle, { color: theme.textPrimary }]}>Déconnexion</Text>
        <Text style={[styles.logoutSubtitle, { color: theme.textSecondary }]}>
          Quittez la session avant de passer la tablette au prochain quart.
        </Text>
        <TouchableOpacity
          style={[
            styles.logoutButtonLarge,
            isDark && { backgroundColor: '#F87171' },
          ]}
          onPress={onLogout}
        >
          <Text style={styles.logoutButtonLargeText}>Se déconnecter</Text>
        </TouchableOpacity>
        <Text style={[styles.appVersionText, { color: theme.textSecondary }]}>
          MadakOMS v1.0.0 (dev)
        </Text>
      </View>
    </ScrollView>
  );
}
