-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentRejection" AS ENUM ('CARD_DECLINED', 'INSUFFICIENT_FUNDS', 'CARD_EXPIRED');

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "reason" "PaymentRejection",
    "amountCents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "cardLast4" CHAR(4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");
