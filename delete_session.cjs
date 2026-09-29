const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.session.deleteMany({ where: { shop: 'sydur-store.myshopify.com' } })
  .then(res => console.log('Deleted sessions:', res.count))
  .finally(() => process.exit(0));
