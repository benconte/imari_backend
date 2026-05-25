/*
  Warnings:

  - A unique constraint covering the columns `[userId,currency]` on the table `wallets` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_currency_key" ON "wallets"("userId", "currency");
