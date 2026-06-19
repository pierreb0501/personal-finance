'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import {
  upsertCategoryRule,
  deleteCategoryRule as dbDeleteCategoryRule,
  upsertSetting,
  updateTransactionCategory,
  setTransactionIgnored,
  upsertCategoryBudget,
  deleteCategoryBudget as dbDeleteCategoryBudget,
  addCustomCategory as dbAddCustomCategory,
  deleteCustomCategory as dbDeleteCustomCategory,
  dismissRecurringMerchant,
  addManualRecurring,
  deleteManualRecurring,
  updateManualRecurringCategory,
  addCommittedItem as dbAddCommittedItem,
  deleteCommittedItem as dbDeleteCommittedItem,
  setCommittedItemGroup as dbSetCommittedItemGroup,
  setManualRecurringGroup as dbSetManualRecurringGroup,
  setAutoRecurringGroup as dbSetAutoRecurringGroup,
} from '@/lib/db/queries'

export async function saveCategoryRule(merchantName: string, category: string): Promise<void> {
  upsertCategoryRule(db, merchantName, category)
  revalidatePath('/')
  revalidatePath('/spending')
  revalidatePath('/budget')
}

export async function saveTransactionCategory(txId: string, category: string): Promise<void> {
  updateTransactionCategory(db, txId, category)
  revalidatePath('/')
  revalidatePath('/spending')
  revalidatePath('/budget')
}

export async function deleteCategoryRule(id: string): Promise<void> {
  dbDeleteCategoryRule(db, id)
  revalidatePath('/')
  revalidatePath('/spending')
  revalidatePath('/budget')
}

export async function saveAllowance(amount: number): Promise<void> {
  upsertSetting(db, 'allowance', String(amount))
  revalidatePath('/')
  revalidatePath('/spending')
}

export async function saveIncome(amount: number): Promise<void> {
  upsertSetting(db, 'income', String(amount))
  revalidatePath('/')
  revalidatePath('/spending')
}

export async function toggleIgnoreTransaction(txId: string, ignored: boolean): Promise<void> {
  setTransactionIgnored(db, txId, ignored)
  revalidatePath('/')
  revalidatePath('/spending')
  revalidatePath('/budget')
}

export async function saveCategoryBudget(category: string, year: number, month: number, planned: number): Promise<void> {
  upsertCategoryBudget(db, category, year, month, planned)
  revalidatePath('/budget')
  revalidatePath('/spending')
}

export async function deleteCategoryBudget(category: string, year: number, month: number): Promise<void> {
  dbDeleteCategoryBudget(db, category, year, month)
  revalidatePath('/budget')
  revalidatePath('/spending')
}

export async function addCustomCategory(name: string, color?: string): Promise<void> {
  dbAddCustomCategory(db, name.trim(), color)
  revalidatePath('/categories')
  revalidatePath('/budget')
  revalidatePath('/spending')
}

export async function deleteCustomCategory(id: string): Promise<void> {
  dbDeleteCustomCategory(db, id)
  revalidatePath('/categories')
  revalidatePath('/budget')
  revalidatePath('/spending')
}

export async function dismissRecurring(merchantName: string): Promise<void> {
  dismissRecurringMerchant(db, merchantName)
  revalidatePath('/spending')
  revalidatePath('/recurring')
}

export async function addRecurring(merchantName: string, dayOfMonth: number, avgAmount: number, category: string): Promise<void> {
  addManualRecurring(db, merchantName.trim(), dayOfMonth, avgAmount, category)
  revalidatePath('/spending')
  revalidatePath('/recurring')
}

export async function removeManualRecurring(merchantName: string): Promise<void> {
  deleteManualRecurring(db, merchantName)
  revalidatePath('/spending')
  revalidatePath('/recurring')
}

export async function updateRecurringCategory(merchantName: string, category: string, isManual: boolean): Promise<void> {
  if (isManual) {
    updateManualRecurringCategory(db, merchantName, category)
  }
  // Always save a category rule so future transactions from this merchant get the category
  upsertCategoryRule(db, merchantName, category)
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
): Promise<void> {
  dbAddCommittedItem(db, name, 'income', expectedAmount, category, expectedDay, merchantName)
  revalidatePath('/spending')
  revalidatePath('/recurring')
}

export async function addCommittedExpenseItem(
  name: string,
  expectedAmount: number,
  category: string,
  expectedDay?: number,
  merchantName?: string,
): Promise<void> {
  dbAddCommittedItem(db, name, 'expense', expectedAmount, category, expectedDay, merchantName)
  revalidatePath('/spending')
  revalidatePath('/recurring')
}

export async function deleteCommittedItem(id: string): Promise<void> {
  dbDeleteCommittedItem(db, id)
  revalidatePath('/spending')
  revalidatePath('/recurring')
}

export async function setItemGroup(id: string, groupName: string | null): Promise<void> {
  dbSetCommittedItemGroup(db, id, groupName)
  revalidatePath('/recurring')
  revalidatePath('/spending')
}

export async function setMerchantGroup(merchantName: string, groupName: string | null, isManual: boolean): Promise<void> {
  if (isManual) {
    dbSetManualRecurringGroup(db, merchantName, groupName)
  } else {
    dbSetAutoRecurringGroup(db, merchantName, groupName)
  }
  revalidatePath('/recurring')
}
