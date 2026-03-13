import { Router } from 'express';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { UserRole } from '@prisma/client';
import { unauthorized, badRequest } from '../utils/httpError.js';
export const exchangeRatesRouter = Router();
exchangeRatesRouter.use(requireAuth);
/**
 * GET /api/exchange-rates?year=2026&month=3&currencyPair=USD/PHP
 * Returns the historical exchange rate for a given month/year and currency pair.
 * Open to all authenticated roles (used in data entry form).
 */
exchangeRatesRouter.get('/', asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    const { year, month, currencyPair = 'USD/PHP' } = req.query;
    if (!year || !month)
        throw badRequest('year and month are required');
    const y = Number(year);
    const m = Number(month);
    const record = await prisma.historicalExchangeRate.findUnique({
        where: { currencyPair_year_month: { currencyPair: String(currencyPair), year: y, month: m } }
    });
    res.json({ rate: record ? Number(record.rate) : null, source: record?.source ?? null, year: y, month: m, currencyPair });
}));
/**
 * GET /api/exchange-rates/all?currencyPair=USD/PHP
 * Returns all stored exchange rates (Admin only).
 */
exchangeRatesRouter.get('/all', requireRole([UserRole.ADMIN]), asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    const { currencyPair } = req.query;
    const where = {};
    if (currencyPair)
        where.currencyPair = String(currencyPair);
    const records = await prisma.historicalExchangeRate.findMany({
        where,
        orderBy: [{ year: 'desc' }, { month: 'desc' }]
    });
    res.json(records.map((r) => ({ ...r, rate: Number(r.rate) })));
}));
/**
 * POST /api/exchange-rates
 * Upsert an exchange rate entry. Admin only.
 */
exchangeRatesRouter.post('/', requireRole([UserRole.ADMIN]), asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    const { currencyPair = 'USD/PHP', year, month, rate, source = 'manual', fetchedAt } = req.body;
    if (!year || !month || rate == null)
        throw badRequest('year, month, and rate are required');
    const record = await prisma.historicalExchangeRate.upsert({
        where: { currencyPair_year_month: { currencyPair: String(currencyPair), year: Number(year), month: Number(month) } },
        update: { rate: String(rate), source: String(source), fetchedAt: fetchedAt ? new Date(fetchedAt) : null },
        create: {
            currencyPair: String(currencyPair),
            year: Number(year),
            month: Number(month),
            rate: String(rate),
            source: String(source),
            fetchedAt: fetchedAt ? new Date(fetchedAt) : null
        }
    });
    res.json({ ...record, rate: Number(record.rate) });
}));
/**
 * DELETE /api/exchange-rates/:id
 * Delete an exchange rate entry. Admin only.
 */
exchangeRatesRouter.delete('/:id', requireRole([UserRole.ADMIN]), asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    await prisma.historicalExchangeRate.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
}));
/**
 * GET /api/exchange-rates/excise-tax?date=2026-03-01
 * Returns the effective excise tax rate for a given date.
 * Open to all authenticated roles.
 */
exchangeRatesRouter.get('/excise-tax', asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    const { date } = req.query;
    const reportDate = date ? new Date(String(date)) : new Date();
    const config = await prisma.exciseTaxConfig.findFirst({
        where: {
            effectiveFrom: { lte: reportDate },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: reportDate } }]
        },
        orderBy: { effectiveFrom: 'desc' }
    });
    if (config) {
        res.json({ rate: Number(config.rate), legalBasis: config.legalBasis, effectiveFrom: config.effectiveFrom, effectiveTo: config.effectiveTo });
    }
    else {
        // Code-level fallback when DB has no matching config.
        // Both pre- and post-RA 12253 rates are currently 4%; keeping date-based logic
        // so future rate changes only require a DB config insert, not a code change.
        const newLawDate = new Date('2026-02-17');
        const isNewLaw = reportDate >= newLawDate;
        const rate = 0.04;
        res.json({ rate, legalBasis: isNewLaw ? 'RA 12253' : null, effectiveFrom: null, effectiveTo: null });
    }
}));
/**
 * GET /api/exchange-rates/excise-tax/configs
 * Returns all excise tax configs. Admin only.
 */
exchangeRatesRouter.get('/excise-tax/configs', requireRole([UserRole.ADMIN]), asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    const configs = await prisma.exciseTaxConfig.findMany({ orderBy: { effectiveFrom: 'desc' } });
    res.json(configs.map((c) => ({ ...c, rate: Number(c.rate) })));
}));
/**
 * POST /api/exchange-rates/excise-tax/configs
 * Create or update an excise tax rate config. Admin only.
 */
exchangeRatesRouter.post('/excise-tax/configs', requireRole([UserRole.ADMIN]), asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    const { effectiveFrom, effectiveTo, rate, legalBasis } = req.body;
    if (!effectiveFrom || rate == null)
        throw badRequest('effectiveFrom and rate are required');
    const config = await prisma.exciseTaxConfig.create({
        data: {
            effectiveFrom: new Date(effectiveFrom),
            effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
            rate: String(rate),
            legalBasis: legalBasis ?? null
        }
    });
    res.json({ ...config, rate: Number(config.rate) });
}));
/**
 * POST /api/exchange-rates/override
 * Record an exchange rate override for a submission (encoder override).
 * Regional Economist, Central Office, and Admin can override.
 */
exchangeRatesRouter.post('/override', requireRole([UserRole.ADMIN, UserRole.CENTRAL_OFFICE, UserRole.REGIONAL_ECONOMIST]), asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    const { submissionId, currencyPair = 'USD/PHP', officialRate, overrideRate, reason } = req.body;
    if (!submissionId || officialRate == null || overrideRate == null || !reason) {
        throw badRequest('submissionId, officialRate, overrideRate, and reason are required');
    }
    const record = await prisma.exchangeRateOverride.create({
        data: {
            submissionId: String(submissionId),
            currencyPair: String(currencyPair),
            officialRate: String(officialRate),
            overrideRate: String(overrideRate),
            reason: String(reason),
            overriddenById: req.user.id
        }
    });
    res.json({ ...record, officialRate: Number(record.officialRate), overrideRate: Number(record.overrideRate) });
}));
/**
 * POST /api/exchange-rates/excise-tax/override
 * Record an excise tax override for a submission (requires reason for audit trail).
 * Available to ADMIN, CENTRAL_OFFICE, and REGIONAL_ECONOMIST roles.
 */
exchangeRatesRouter.post('/excise-tax/override', requireRole([UserRole.ADMIN, UserRole.CENTRAL_OFFICE, UserRole.REGIONAL_ECONOMIST]), asyncHandler(async (req, res) => {
    if (!req.user)
        throw unauthorized();
    const { submissionId, officialRate, overrideRate, reason } = req.body;
    if (!submissionId || officialRate == null || overrideRate == null || !reason) {
        throw badRequest('submissionId, officialRate, overrideRate, and reason are required');
    }
    const record = await prisma.exciseTaxOverride.create({
        data: {
            submissionId: String(submissionId),
            officialRate: String(officialRate),
            overrideRate: String(overrideRate),
            reason: String(reason),
            overriddenById: req.user.id
        }
    });
    res.json({ ...record, officialRate: Number(record.officialRate), overrideRate: Number(record.overrideRate) });
}));
