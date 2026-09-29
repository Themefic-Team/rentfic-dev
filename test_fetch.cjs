const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const session = await prisma.session.findFirst({ 
    where: { shop: 'sydur-store.myshopify.com' } 
  });
  
  const res = await fetch(`https://sydur-store.myshopify.com/admin/api/2024-10/themes.json`, { 
    headers: { 'X-Shopify-Access-Token': session.accessToken } 
  });
  
  const json = await res.json(); 
  console.log('STATUS:', res.status); 
  console.log('BODY:', json);
}

main().finally(() => process.exit(0));
