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

export async function toggleIgnoreTransaction(txId: string, ignored: boolean): Promise<void> {
  setTransactionIgnored(db, txId, ignored)
  revalidatePath('/')
  revalidatePath('/spending')
  revalidatePath('/budget')
}

export async function saveCategoryBudget(category: string, monthlyLimit: number): Promise<void> {
  upsertCategoryBudget(db, category, monthlyLimit)
  revalidatePath('/budget')
  revalidatePath('/spending')
}

export async function deleteCategoryBudget(category: string): Promise<void> {
  dbDeleteCategoryBudget(db, category)
  revalidatePath('/budget')
  revalidatePath('/spending')
}
