const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const session = await prisma.session.findFirst({ 
    where: { shop: 'sydur-store.myshopify.com' } 
  });
  
  const res = await fetch(`https://sydur-store.myshopify.com/admin/api/2024-10/graphql.json`, { 
    method: 'POST',
    headers: { 
      'X-Shopify-Access-Token': session.accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: 'query { shop { id } }' })
  });
  
  const json = await res.json(); 
  console.log('STATUS:', res.status); 
  console.log('BODY:', json);
}

main().finally(() => process.exit(0));
