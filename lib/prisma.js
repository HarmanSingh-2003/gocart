import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'

const connectionString = `${process.env.DATABASE_URL}`

const adapter = new PrismaNeon({ connectionString })
const prisma = global.prisma || new PrismaClient({ adapter })

if (process.env.NODE_ENV === 'development') global.prisma = prisma

export default prisma