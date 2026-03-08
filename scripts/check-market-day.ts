import { isMarketDay } from "../src/lib/market-calendar.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const marketDay = isMarketDay();
  const config = await prisma.tradingConfig.findFirst({
    orderBy: { createdAt: "desc" },
  });
  const isActive = !config || config.isActive;
  console.log(marketDay && isActive ? "true" : "false");
} finally {
  await prisma.$disconnect();
}
