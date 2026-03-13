-- CreateTable
CREATE TABLE "HistoricalExchangeRate" (
    "id" TEXT NOT NULL,
    "currencyPair" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "fetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricalExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExciseTaxConfig" (
    "id" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "rate" DECIMAL(8,6) NOT NULL,
    "legalBasis" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExciseTaxConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRateOverride" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "currencyPair" TEXT NOT NULL,
    "officialRate" DECIMAL(18,6) NOT NULL,
    "overrideRate" DECIMAL(18,6) NOT NULL,
    "reason" TEXT NOT NULL,
    "overriddenById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRateOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExciseTaxOverride" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "officialRate" DECIMAL(8,6) NOT NULL,
    "overrideRate" DECIMAL(8,6) NOT NULL,
    "reason" TEXT NOT NULL,
    "overriddenById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExciseTaxOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalExchangeRate_currencyPair_year_month_key" ON "HistoricalExchangeRate"("currencyPair", "year", "month");

-- CreateIndex
CREATE INDEX "HistoricalExchangeRate_year_month_idx" ON "HistoricalExchangeRate"("year", "month");

-- CreateIndex
CREATE INDEX "ExciseTaxConfig_effectiveFrom_idx" ON "ExciseTaxConfig"("effectiveFrom");

-- CreateIndex
CREATE INDEX "ExchangeRateOverride_submissionId_idx" ON "ExchangeRateOverride"("submissionId");

-- CreateIndex
CREATE INDEX "ExciseTaxOverride_submissionId_idx" ON "ExciseTaxOverride"("submissionId");

-- AddForeignKey
ALTER TABLE "ExchangeRateOverride" ADD CONSTRAINT "ExchangeRateOverride_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRateOverride" ADD CONSTRAINT "ExchangeRateOverride_overriddenById_fkey" FOREIGN KEY ("overriddenById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExciseTaxOverride" ADD CONSTRAINT "ExciseTaxOverride_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExciseTaxOverride" ADD CONSTRAINT "ExciseTaxOverride_overriddenById_fkey" FOREIGN KEY ("overriddenById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
