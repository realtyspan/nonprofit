const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { backfillUserPermissions } = require("./backfill-permissions");

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.create({
    data: { name: "Red Hook Rhinebeck Lodge #2022", licenseId: "NYS-BJ-2022" },
  });

  const passwordHash = await bcrypt.hash("password123", 10);
  const [head, chair, preparer, cashier] = await Promise.all([
    prisma.user.create({ data: { orgId: org.id, name: "Pat Naraine", email: "head@lodge2022.test", passwordHash, role: "Head" } }),
    prisma.user.create({ data: { orgId: org.id, name: "Chris Chair", email: "chair@lodge2022.test", passwordHash, role: "Chairperson" } }),
    prisma.user.create({ data: { orgId: org.id, name: "Pat Preparer", email: "preparer@lodge2022.test", passwordHash, role: "Preparer" } }),
    prisma.user.create({ data: { orgId: org.id, name: "Cody Cashier", email: "cashier@lodge2022.test", passwordHash, role: "Cashier" } }),
  ]);

  for (const user of [head, chair, preparer, cashier]) {
    await backfillUserPermissions(prisma, user);
  }

  await prisma.deal.create({
    data: {
      orgId: org.id,
      name: "Lucky 7s",
      serialNum: "SN-100234",
      formNum: "FM-5521",
      ticketCount: 4000,
      ticketPrice: 1.0,
      idealPayout: 2800,
      soldToDate: 1200,
      prizesAwardedToDate: 900,
    },
  });

  await prisma.deal.create({
    data: {
      orgId: org.id,
      name: "Diamond Deal",
      serialNum: "SN-100987",
      formNum: "FM-5502",
      ticketCount: 3000,
      ticketPrice: 2.0,
      idealPayout: 4500,
      soldToDate: 2600,
      prizesAwardedToDate: 3400,
    },
  });

  console.log("Seeded org:", org.name);
  console.log("Login users (password123):");
  console.log(" head@lodge2022.test / chair@lodge2022.test / preparer@lodge2022.test / cashier@lodge2022.test");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
