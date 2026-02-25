-- CreateTable
CREATE TABLE "ContractorHistory" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "changedById" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractorHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractorHistory_contractorId_idx" ON "ContractorHistory"("contractorId");

-- AddForeignKey
ALTER TABLE "ContractorHistory" ADD CONSTRAINT "ContractorHistory_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorHistory" ADD CONSTRAINT "ContractorHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
