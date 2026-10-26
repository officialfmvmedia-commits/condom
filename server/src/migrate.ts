import { createPool, migrate } from './db'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')
const db = createPool(url)
await migrate(db)
await db.end()
console.log('migrated')
