import { PrismaClient } from '@prisma/client'
import { DEFAULT_ADVANCE_REMINDER_RULES, DEFAULT_OVERDUE_REMINDER_RULES } from '@subtracker/shared'

const prisma = new PrismaClient()

async function main() {
  await prisma.setting.upsert({
    where: { key: 'baseCurrency' },
    update: { valueJson: 'CNY' },
    create: { key: 'baseCurrency', valueJson: 'CNY' }
  })

  await prisma.setting.upsert({
    where: { key: 'defaultNotifyDays' },
    update: { valueJson: 3 },
    create: { key: 'defaultNotifyDays', valueJson: 3 }
  })

  await prisma.setting.upsert({
    where: { key: 'defaultAdvanceReminderRules' },
    update: { valueJson: DEFAULT_ADVANCE_REMINDER_RULES },
    create: { key: 'defaultAdvanceReminderRules', valueJson: DEFAULT_ADVANCE_REMINDER_RULES }
  })

  await prisma.setting.upsert({
    where: { key: 'notifyOnDueDay' },
    update: { valueJson: true },
    create: { key: 'notifyOnDueDay', valueJson: true }
  })

  await prisma.setting.upsert({
    where: { key: 'overdueReminderDays' },
    update: { valueJson: [1, 2, 3] },
    create: { key: 'overdueReminderDays', valueJson: [1, 2, 3] }
  })

  await prisma.setting.upsert({
    where: { key: 'defaultOverdueReminderRules' },
    update: { valueJson: DEFAULT_OVERDUE_REMINDER_RULES },
    create: { key: 'defaultOverdueReminderRules', valueJson: DEFAULT_OVERDUE_REMINDER_RULES }
  })

  const defaults = [
    { name: '开发工具', color: '#4f46e5', icon: 'code-slash-outline', sortOrder: 1 },
    { name: '影音娱乐', color: '#ef4444', icon: 'film-outline', sortOrder: 2 },
    { name: '效率办公', color: '#10b981', icon: 'briefcase-outline', sortOrder: 3 }
  ]

  for (const item of defaults) {
    await prisma.tag.upsert({
      where: { name: item.name },
      update: item,
      create: item
    })
  }

  console.log('Seed completed.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
