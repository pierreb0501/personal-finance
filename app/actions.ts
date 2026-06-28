'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { plaidClient } from '@/lib/plaid'
import { CATEGORY_LABELS, slugifyCategory } from '@/lib/categories'
import {
  deleteAccount as dbDeleteAccount,
  upsertCategoryRule,
  deleteCategoryRule as dbDeleteCategoryRule,
  upsertSetting,
  updateTransactionCategory,
  setTransactionIgnored,
  upsertCategoryBudget,
  deleteCategoryBudget as dbDeleteCategoryBudget,
  addCustomCategory as dbAddCustomCategory,
  deleteCustomCategory as dbDeleteCustomCategory,
  ensureCustomCategory,
  dismissRecurringMerchant,
  addManualRecurring,
  deleteManualRecurring,
  updateManualRecurringCategory,
  addCommittedItem as dbAddCommittedItem,
  updateCommittedItem as dbUpdateCommittedItem,
  deleteCommittedItem as dbDeleteCommittedItem,
  setCommittedItemGroup as dbSetCommittedItemGroup,
  setManualRecurringGroup as dbSetManualRecurringGroup,
  setAutoRecurringGroup as dbSetAutoRecurringGroup,
  setCategoryLabel,
  type CategoryKind,
} from '@/lib/db/queries'

// Built-in categories pass through unchanged; anything else is normalized to
// the same canonical slug form used by custom_categories, so a category
// created inline always lands in the same identifier space as one created
// from the category manager (see lib/categories.ts: slugifyCategory).
function normalizeCategory(category: string): string {
  return CATEGORY_LABELS[category] ? category : slugifyCategory(category)
}

export async function saveCategoryRule(merchantName: string, category: string): Promise<void> {
  const normalized = normalizeCategory(category)
  await upsertCategoryRule(db, merchantName, normalized)
  await ensureCustomCategory(db, normalized)
  revalidatePath('/')
  revalidatePath('/spending')
  revalidatePath('/budget')
}

export async function saveTransactionCategory(txId: string, category: string): Promise<void> {
  const normalized = normalizeCategory(category)
  await updateTransactionCategory(db, txId, normalized)
  await ensureCustomCategory(db, normalized)
  revalidatePath('/')
  revalidatePath('/spending')
  revalidatePath('/budget')
}

export async function deleteCategoryRule(id: string): Promise<void> {
  await dbDeleteCategoryRule(db, id)
  revalidatePath('/')
  revalidatePath('/spending')
  revalidatePath('/budget')
}

export async function saveIncome(amount: number): Promise<void> {
  await upsertSetting(db, 'income', String(amount))
  revalidatePath('/')
  revalidatePath('/spending')
}

export async function toggleIgnoreTransaction(txId: string, ignored: boolean): Promise<void> {
  await setTransactionIgnored(db, txId, ignored)
  revalidatePath('/')
  revalidatePath('/spending')
  revalidatePath('/budget')
}

export async function saveCategoryBudget(category: string, year: number, month: number, planned: number): Promise<void> {
  await upsertCategoryBudget(db, category, year, month, planned)
  revalidatePath('/budget')
  revalidatePath('/spending')
}

export async function deleteCategoryBudget(category: string, year: number, month: number): Promise<void> {
  await dbDeleteCategoryBudget(db, category, year, month)
  revalidatePath('/budget')
  revalidatePath('/spending')
}

export async function addCustomCategory(name: string, color?: string): Promise<void> {
  await dbAddCustomCategory(db, name.trim(), color)
  revalidatePath('/categories')
  revalidatePath('/budget')
  revalidatePath('/spending')
}

export async function deleteCustomCategory(id: string): Promise<void> {
  await dbDeleteCustomCategory(db, id)
  revalidatePath('/categories')
  revalidatePath('/budget')
  revalidatePath('/spending')
}

export async function dismissRecurring(merchantName: string): Promise<void> {
  await dismissRecurringMerchant(db, merchantName)
  revalidatePath('/spending')
  revalidatePath('/recurring')
}

export async function addRecurring(merchantName: string, dayOfMonth: number, avgAmount: number, category: string, autoAverage?: boolean): Promise<void> {
  await addManualRecurring(db, merchantName.trim(), dayOfMonth, avgAmount, category, autoAverage)
  revalidatePath('/spending')
  revalidatePath('/recurring')
  revalidatePath('/calendar')
}

export async function removeManualRecurring(merchantName: string): Promise<void> {
  await deleteManualRecurring(db, merchantName)
  revalidatePath('/spending')
  revalidatePath('/recurring')
}

export async function updateRecurringCategory(merchantName: string, category: string, isManual: boolean): Promise<void> {
  if (isManual) {
    await updateManualRecurringCategory(db, merchantName, category)
  }
  // Always save a category rule so future transactions from this merchant get the category
  await upsertCategoryRule(db, merchantName, category)
  revalidatePath('/spending')
  revalidatePath('/recurring')
  revalidatePath('/budget')
}

export async function addCommittedIncomeItem(
  name: string,
  expectedAmount: number,
  category: string,
  expectedDay?: number,
  merchantName?: string,
  intervalMonths?: number,
  anchorYear?: number,
  anchorMonth?: number,
  autoAverage?: boolean,
): Promise<void> {
  await dbAddCommittedItem(db, name, 'income', expectedAmount, category, expectedDay, merchantName, intervalMonths, anchorYear, anchorMonth, autoAverage)
  revalidatePath('/spending')
  revalidatePath('/recurring')
  revalidatePath('/calendar')
}

export async function addCommittedExpenseItem(
  name: string,
  expectedAmount: number,
  category: string,
  expectedDay?: number,
  merchantName?: string,
  intervalMonths?: number,
  anchorYear?: number,
  anchorMonth?: number,
  autoAverage?: boolean,
): Promise<void> {
  await dbAddCommittedItem(db, name, 'expense', expectedAmount, category, expectedDay, merchantName, intervalMonths, anchorYear, anchorMonth, autoAverage)
  revalidatePath('/spending')
  revalidatePath('/recurring')
  revalidatePath('/calendar')
}

export async function updateCommittedItem(
  id: string,
  name: string,
  expectedAmount: number,
  category: string,
  expectedDay?: number,
  merchantName?: string,
  intervalMonths?: number,
  anchorYear?: number,
  anchorMonth?: number,
  autoAverage?: boolean,
): Promise<void> {
  await dbUpdateCommittedItem(db, id, {
    name,
    expectedAmount,
    category,
    expectedDay: expectedDay ?? null,
    merchantName: merchantName ?? null,
    intervalMonths: intervalMonths ?? 1,
    anchorYear: anchorYear ?? null,
    anchorMonth: anchorMonth ?? null,
    autoAverage: autoAverage ? 1 : 0,
  })
  revalidatePath('/spending')
  revalidatePath('/recurring')
  revalidatePath('/calendar')
}

export async function deleteCommittedItem(id: string): Promise<void> {
  await dbDeleteCommittedItem(db, id)
  revalidatePath('/spending')
  revalidatePath('/recurring')
}

export async function setItemGroup(id: string, groupName: string | null): Promise<void> {
  await dbSetCommittedItemGroup(db, id, groupName)
  revalidatePath('/recurring')
  revalidatePath('/spending')
}

export async function setMerchantGroup(merchantName: string, groupName: string | null, isManual: boolean): Promise<void> {
  if (isManual) {
    await dbSetManualRecurringGroup(db, merchantName, groupName)
  } else {
    await dbSetAutoRecurringGroup(db, merchantName, groupName)
  }
  revalidatePath('/recurring')
}

export async function setCategoryKind(category: string, kind: CategoryKind): Promise<void> {
  await setCategoryLabel(db, category, kind)
  revalidatePath('/')
  revalidatePath('/budget')
  revalidatePath('/spending')
}

export async function removeAccount(accountId: string): Promise<void> {
  const { itemDeleted, accessToken } = await dbDeleteAccount(db, accountId)

  if (itemDeleted && accessToken) {
    try {
      await plaidClient.itemRemove({ access_token: accessToken })
    } catch (err) {
      console.error('Plaid itemRemove failed (item already deleted locally):', err)
    }
  }

  revalidatePath('/')
  revalidatePath('/accounts')
  revalidatePath('/spending')
  revalidatePath('/net-worth')
  revalidatePath('/investments')
  revalidatePath('/budget')
  revalidatePath('/recurring')
}
