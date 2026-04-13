-- CreateTable
CREATE TABLE "BrokerSession" (
    "id" TEXT NOT NULL,
    "env" TEXT NOT NULL,
    "urlRequest" TEXT NOT NULL,
    "urlMaster" TEXT NOT NULL,
    "urlPrice" TEXT NOT NULL,
    "urlEvent" TEXT NOT NULL,
    "urlEventWebSocket" TEXT NOT NULL,
    "loginAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrokerSession_env_key" ON "BrokerSession"("env");
