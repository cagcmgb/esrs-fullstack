import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { UserRole } from '@prisma/client';
import { badRequest, forbidden, notFound, unauthorized } from '../utils/httpError.js';

export const contractorsRouter = Router();

contractorsRouter.use(requireAuth);

contractorsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    const { verified, q, regionCode, commodityId, mineralType } = req.query as any;

    const where: any = {};
    if (verified === 'true') where.isVerified = true;
    if (verified === 'false') where.isVerified = false;

    const effectiveRegion = req.user.role === UserRole.REGIONAL_ECONOMIST ? req.user.regionCode : regionCode;
    if (effectiveRegion) where.regionCode = effectiveRegion;

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { contractorCode: { contains: q, mode: 'insensitive' } },
        { tin: { contains: q, mode: 'insensitive' } }
      ];
    }

    if (commodityId) {
      where.contractorCommodities = { some: { commodityId } };
    }

    if (mineralType) {
      where.contractorCommodities = {
        some: {
          commodity: {
            mineralType
          }
        }
      };
    }

    const contractors = await prisma.contractor.findMany({
      where,
      include: {
        permits: { include: { permitType: true } },
        status: true,
        contractorCommodities: { include: { commodity: { include: { defaultUnit: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(contractors);
  })
);

const permitSchema = z.object({
  permitTypeId: z.string().min(1),
  permitNumber: z.string().min(1),
  dateApproved: z.string().optional().nullable(),
  dateExpiration: z.string().optional().nullable()
});

const createSchema = z.object({
  name: z.string().min(1),
  tin: z.string().min(1),
  operatorName: z.string().min(1),
  contactNo: z.string().min(1),
  email: z.string().email(),
  regionCode: z.string().min(1),
  regionName: z.string().min(1),
  provinceCode: z.string().optional().nullable(),
  provinceName: z.string().min(1),
  municipalityCode: z.string().optional().nullable(),
  municipalityName: z.string().min(1),
  areaHectare: z.number().nonnegative(),
  statusId: z.string().min(1),
  commodityIds: z.array(z.string().min(1)).min(1),
  permits: z.array(permitSchema).optional().default([])
});

contractorsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();

    // Regional economist can only create for own region
    if (req.user.role === UserRole.REGIONAL_ECONOMIST) {
      const bodyRegion = req.body?.regionCode;
      if (!req.user.regionCode) throw forbidden('Regional Economist missing regionCode');
      if (bodyRegion && bodyRegion !== req.user.regionCode) {
        throw forbidden('You can only create contractors in your assigned region');
      }
    }

    const body = createSchema.parse(req.body);

    const contractor = await prisma.contractor.create({
      data: {
        name: body.name,
        tin: body.tin,
        operatorName: body.operatorName,
        contactNo: body.contactNo,
        email: body.email,
        regionCode: body.regionCode,
        regionName: body.regionName,
        provinceCode: body.provinceCode ?? null,
        provinceName: body.provinceName,
        municipalityCode: body.municipalityCode ?? null,
        municipalityName: body.municipalityName,
        areaHectare: body.areaHectare,
        statusId: body.statusId,
        createdById: req.user.id,
        contractorCommodities: {
          create: body.commodityIds.map((commodityId) => ({ commodityId }))
        },
        permits: {
          create: body.permits.map((p) => ({
            permitTypeId: p.permitTypeId,
            permitNumber: p.permitNumber,
            dateApproved: p.dateApproved ? new Date(p.dateApproved) : null,
            dateExpiration: p.dateExpiration ? new Date(p.dateExpiration) : null
          }))
        }
      },
      include: {
        permits: { include: { permitType: true } },
        status: true,
        contractorCommodities: { include: { commodity: true } }
      }
    });

    res.status(201).json(contractor);
  })
);

contractorsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    const contractor = await prisma.contractor.findUnique({
      where: { id: req.params.id },
      include: {
        permits: { include: { permitType: true } },
        status: true,
        contractorCommodities: { include: { commodity: { include: { defaultUnit: true } } } }
      }
    });
    if (!contractor) throw notFound('Contractor not found');

    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode && contractor.regionCode !== req.user.regionCode) {
      throw forbidden('You can only access contractors in your region');
    }

    // fetch histories separately ordered by createdAt desc
    const histories = await prisma.contractorHistory.findMany({
      where: { contractorId: contractor.id },
      orderBy: { createdAt: 'desc' },
      include: { changedBy: true }
    });

    res.json({ ...contractor, histories });
  })
);

contractorsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();

    const existing = await prisma.contractor.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Contractor not found');

    if (existing.isVerified) {
      throw badRequest('Cannot delete a verified contractor. Unverify first.');
    }

    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode && existing.regionCode !== req.user.regionCode) {
      throw forbidden('You can only delete contractors in your region');
    }

    await prisma.contractor.delete({ where: { id: existing.id } });

    res.json({ success: true });
  })
);

const updateSchema = createSchema.partial();

contractorsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();

    const existing = await prisma.contractor.findUnique({ where: { id: req.params.id }, include: { permits: true, contractorCommodities: true } });
    if (!existing) throw notFound('Contractor not found');

    if (existing.isVerified) {
      throw badRequest('Cannot edit a verified contractor. Ask Central Office/Admin to unverify if needed.');
    }

    if (req.user.role === UserRole.REGIONAL_ECONOMIST && req.user.regionCode && existing.regionCode !== req.user.regionCode) {
      throw forbidden('You can only edit contractors in your region');
    }

    const body = updateSchema.parse(req.body);

    // Split nested collections vs scalar fields.
    const { commodityIds, permits, ...scalar } = body;

    // If commodityIds present, replace join table
    const commodityUpdate = commodityIds
      ? {
          deleteMany: {},
          create: commodityIds.map((commodityId) => ({ commodityId }))
        }
      : undefined;

    // If permits present, replace permits
    const permitsUpdate = permits
      ? {
          deleteMany: {},
          create: permits.map((p) => ({
            permitTypeId: p.permitTypeId,
            permitNumber: p.permitNumber,
            dateApproved: p.dateApproved ? new Date(p.dateApproved) : null,
            dateExpiration: p.dateExpiration ? new Date(p.dateExpiration) : null
          }))
        }
      : undefined;

    // create a snapshot history record before updating
    const snapshot = JSON.parse(JSON.stringify(existing));
    await prisma.contractorHistory.create({
      data: {
        contractorId: existing.id,
        changedById: req.user.id,
        data: snapshot
      }
    });

    const contractor = await prisma.contractor.update({
      where: { id: req.params.id },
      data: {
        ...scalar,
        provinceCode: scalar.provinceCode ?? undefined,
        municipalityCode: scalar.municipalityCode ?? undefined,
        contractorCommodities: commodityUpdate,
        permits: permitsUpdate
      },
      include: {
        permits: { include: { permitType: true } },
        status: true,
        contractorCommodities: { include: { commodity: true } }
      }
    });

    res.json(contractor);
  })
);

function pad3(n: number) {
  const s = String(n);
  return s.length >= 3 ? s : '0'.repeat(3 - s.length) + s;
}

function defaultIdPrefix(regionName: string): string {
  // Examples: "Region II (Cagayan Valley)" => R2, "Region IV-A (CALABARZON)" => R4A, NCR => NCR
  const match = regionName.match(/Region\s+([IVX]+)(?:-([A-Z]))?/i);
  if (match) {
    const roman = match[1].toUpperCase();
    const suffix = match[2] ? match[2].toUpperCase() : '';
    const romanToInt: Record<string, number> = {
      I: 1,
      II: 2,
      III: 3,
      IV: 4,
      V: 5,
      VI: 6,
      VII: 7,
      VIII: 8,
      IX: 9,
      X: 10,
      XI: 11,
      XII: 12,
      XIII: 13
    };
    const num = romanToInt[roman] ?? roman;
    return `R${num}${suffix}`;
  }

  if (/NCR/i.test(regionName)) return 'NCR';
  if (/CAR/i.test(regionName)) return 'CAR';
  if (/BARMM/i.test(regionName)) return 'BARMM';

  // fallback: use region code prefix style
  return regionName.replace(/\s+/g, '').slice(0, 6).toUpperCase();
}

contractorsRouter.post(
  '/:id/verify',
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    if (!(req.user.role === UserRole.ADMIN || req.user.role === UserRole.CENTRAL_OFFICE)) {
      throw forbidden('Only Central Office/Admin can verify a contractor');
    }

    const contractor = await prisma.contractor.findUnique({
      where: { id: req.params.id },
      include: { status: true }
    });
    if (!contractor) throw notFound('Contractor not found');

    if (contractor.isVerified) {
      return res.json(contractor);
    }

    // Get or create region config
    const regionConfig = await prisma.regionConfig.upsert({
      where: { regionCode: contractor.regionCode },
      update: {},
      create: {
        regionCode: contractor.regionCode,
        regionName: contractor.regionName,
        idPrefix: defaultIdPrefix(contractor.regionName),
        nextSequence: 1
      }
    });

    const contractorCode = `${regionConfig.idPrefix}-${pad3(regionConfig.nextSequence)}`;

    const [updated] = await prisma.$transaction([
      prisma.contractor.update({
        where: { id: contractor.id },
        data: {
          contractorCode,
          isVerified: true,
          verifiedAt: new Date(),
          verifiedById: req.user.id
        },
        include: {
          permits: { include: { permitType: true } },
          status: true,
          contractorCommodities: { include: { commodity: true } }
        }
      }),
      prisma.regionConfig.update({
        where: { regionCode: regionConfig.regionCode },
        data: { nextSequence: regionConfig.nextSequence + 1 }
      })
    ]);

    res.json(updated);
  })
);

contractorsRouter.post(
  '/:id/unverify',
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthorized();
    if (!(req.user.role === UserRole.ADMIN || req.user.role === UserRole.CENTRAL_OFFICE)) {
      throw forbidden('Only Central Office/Admin can unverify a contractor');
    }

    const contractor = await prisma.contractor.findUnique({ where: { id: req.params.id } });
    if (!contractor) throw notFound('Contractor not found');

    const updated = await prisma.contractor.update({
      where: { id: contractor.id },
      data: {
        isVerified: false,
        contractorCode: null,
        verifiedAt: null,
        verifiedById: null
      }
    });

    res.json(updated);
  })
);
