-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketsStatus" AS ENUM ('NOT_ISSUED', 'ISSUED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('NOT_SENT', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "customer_name" VARCHAR(100) NOT NULL,
    "customer_email" VARCHAR(150) NOT NULL,
    "idempotency_key" VARCHAR(100),
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "event_id" UUID NOT NULL,
    "sector_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reserved" BOOLEAN NOT NULL DEFAULT false,
    "organizer_id" UUID,
    "event_name" VARCHAR(150),
    "event_starts_at" TIMESTAMP(3),
    "venue" VARCHAR(150),
    "sector_name" VARCHAR(50),
    "unit_price_cents" INTEGER,
    "total_cents" INTEGER,
    "failure_code" VARCHAR(50),
    "release_pending" BOOLEAN NOT NULL DEFAULT false,
    "tickets_status" "TicketsStatus" NOT NULL DEFAULT 'NOT_ISSUED',
    "notification_status" "NotificationStatus" NOT NULL DEFAULT 'NOT_SENT',
    "notification_tries" INTEGER NOT NULL DEFAULT 0,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_event_id_status_idx" ON "orders"("event_id", "status");

-- CreateIndex
CREATE INDEX "orders_status_updated_at_idx" ON "orders"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_user_id_idempotency_key_key" ON "orders"("user_id", "idempotency_key");
