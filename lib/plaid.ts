import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
  throw new Error('PLAID_CLIENT_ID and PLAID_SECRET must be set in .env.local')
}

const validEnvs = ['sandbox', 'development', 'production']
const env = process.env.PLAID_ENV ?? 'sandbox'
if (!validEnvs.includes(env)) {
  throw new Error(`PLAID_ENV must be one of: ${validEnvs.join(', ')}. Got: "${env}"`)
}

const config = new Configuration({
  basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
})

export const plaidClient = new PlaidApi(config)
