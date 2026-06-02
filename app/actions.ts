'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import {
  upsertCategoryRule,
  deleteCategoryRule as dbDeleteCategoryRule,
  upsertSetting,
  updateTransactionCategory,
} from '@/lib/db/queries'

export async function saveCategoryRule(merchantName: string, category: string): Promise<void> {
  upsertCategoryRule(db, merchantName, category)
  revalidatePath('/')
  revalidatePath('/spending')
}

export async function saveTransactionCategory(txId: string, category: string): Promise<void> {
  updateTransactionCategory(db, txId, category)
  revalidatePath('/')
  revalidatePath('/spending')
}

export async function deleteCategoryRule(id: string): Promise<void> {
  dbDeleteCategoryRule(db, id)
  revalidatePath('/')
  revalidatePath('/spending')
}

export async function saveAllowance(amount: number): Promise<void> {
  upsertSetting(db, 'allowance', String(amount))
  revalidatePath('/')
  revalidatePath('/spending')
}
