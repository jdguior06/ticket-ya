-- CreateTable
CREATE TABLE "CheckIn" (
    "ticket_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "doormanId" UUID NOT NULL,
    "holderName" TEXT NOT NULL,
    "sectorName" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("ticket_id")
);

-- CreateIndex
CREATE INDEX "CheckIn_eventId_checkedInAt_ticket_id_idx" ON "CheckIn"("eventId", "checkedInAt", "ticket_id");
