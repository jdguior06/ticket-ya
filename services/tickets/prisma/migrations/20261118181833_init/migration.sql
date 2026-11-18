-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('VALID', 'VOID');

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "order_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "user_id" UUID NOT NULL,
    "holder_name" VARCHAR(100) NOT NULL,
    "holder_email" VARCHAR(150) NOT NULL,
    "event_id" UUID NOT NULL,
    "event_name" VARCHAR(150) NOT NULL,
    "venue" VARCHAR(150) NOT NULL,
    "event_starts_at" TIMESTAMP(3) NOT NULL,
    "sector_id" UUID NOT NULL,
    "sector_name" VARCHAR(50) NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'VALID',
    "pdf_path" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tickets_code_key" ON "tickets"("code");

-- CreateIndex
CREATE INDEX "tickets_user_id_idx" ON "tickets"("user_id");

-- CreateIndex
CREATE INDEX "tickets_event_id_idx" ON "tickets"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_order_id_seq_key" ON "tickets"("order_id", "seq");
