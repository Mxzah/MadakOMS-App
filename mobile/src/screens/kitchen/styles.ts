import { StyleSheet } from 'react-native';
import { colors } from './constants';

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  kitchenSafeArea: {
    flex: 1,
  },
  kitchenHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  kitchenTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  kitchenSubtitle: {
    marginTop: 4,
    fontSize: 14,
  },
  kitchenTabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 8,
  },
  kitchenTabButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  kitchenTabLabel: {
    fontWeight: '600',
  },
  kitchenContent: {
    flex: 1,
  },
  scrollBody: {
    padding: 20,
    gap: 16,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
  },
  historyFilterRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  filterPillText: {
    fontWeight: '600',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyCard: {
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyCardTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptyCardCopy: {
    textAlign: 'center',
    fontSize: 14,
  },
  orderCard: {
    borderRadius: 20,
    padding: 18,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: '700',
  },
  orderStatus: {
    fontWeight: '600',
  },
  orderMeta: {
    fontSize: 13,
  },
  orderPillsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  priorityPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  priorityPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    maxHeight: '90%',
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalMeta: {
    fontSize: 14,
  },
  modalSection: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#F5F6FB',
    gap: 8,
  },
  modalSectionTitle: {
    fontWeight: '600',
  },
  modalItemRow: {
    gap: 4,
  },
  modalItemText: {
    fontWeight: '600',
  },
  modalItemMeta: {
    fontSize: 13,
    color: colors.muted,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  primaryAction: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  secondaryAction: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryActionText: {
    fontWeight: '600',
  },
  reasonSheetWrapper: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  reasonSheet: {
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  reasonInput: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
  },
  historyCard: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  historyOrderNumber: {
    fontSize: 17,
    fontWeight: '700',
  },
  historyBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  historyBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  historyMeta: {
    fontSize: 13,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clearButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
  },
  clearButtonText: {
    fontWeight: '600',
    color: '#1D4ED8',
  },
  settingCard: {
    borderRadius: 20,
    padding: 18,
    gap: 8,
    elevation: 2,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingSubtitle: {
    fontSize: 13,
  },
  logoutCard: {
    marginTop: 12,
    borderRadius: 18,
    padding: 16,
    backgroundColor: colors.danger,
    alignItems: 'center',
  },
  logoutText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

