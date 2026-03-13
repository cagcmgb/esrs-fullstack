import { PrismaClient, UserRole, MineralType, ReportType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function upsertPermitTypes() {
  const permitTypes = [
    'FTAA',
    'MPSA',
    'EP',
    'MPP',
    'Mineral Processing Permit',
    'Industrial Sand & Gravel Permit',
    'Commercial Sand & Gravel Permit',
    'Quarry Permit'
  ];

  for (let i = 0; i < permitTypes.length; i++) {
    const name = permitTypes[i];
    await prisma.permitType.upsert({
      where: { name },
      update: { isActive: true, sortOrder: i },
      create: { name, isActive: true, sortOrder: i }
    });
  }
}

async function upsertContractorStatuses() {
  const statuses = [
    'Exploration',
    'Development and Construction',
    'Commissioning',
    'Operating',
    'Stopped',
    'Care and Maintenance',
    'Suspended'
  ];

  for (let i = 0; i < statuses.length; i++) {
    const name = statuses[i];
    await prisma.contractorStatus.upsert({
      where: { name },
      update: { isActive: true, sortOrder: i },
      create: { name, isActive: true, sortOrder: i }
    });
  }
}

async function upsertUnits() {
  const units = [
    { name: 'kg', symbol: 'kg' },
    { name: 'DMT', symbol: 'DMT' },
    { name: 'MT', symbol: 'MT' },
    { name: 'cu.m.', symbol: 'cu.m.' },
    { name: 'bags', symbol: 'bags' },
    { name: 'oz', symbol: 'oz' }
  ];

  for (const u of units) {
    await prisma.unit.upsert({
      where: { name: u.name },
      update: { symbol: u.symbol },
      create: { name: u.name, symbol: u.symbol }
    });
  }
}

async function upsertCommodities() {
  const unitKg = await prisma.unit.findUnique({ where: { name: 'kg' } });
  const unitDmt = await prisma.unit.findUnique({ where: { name: 'DMT' } });
  const unitMt = await prisma.unit.findUnique({ where: { name: 'MT' } });
  const unitCuM = await prisma.unit.findUnique({ where: { name: 'cu.m.' } });

  const commodities = [
    // Metallic
    { name: 'Gold', mineralType: MineralType.METALLIC, defaultUnitId: unitKg?.id, formTemplateCode: 'MGB29-01' },
    { name: 'Silver', mineralType: MineralType.METALLIC, defaultUnitId: unitKg?.id, formTemplateCode: 'MGB29-01' },
    { name: 'Copper', mineralType: MineralType.METALLIC, defaultUnitId: unitMt?.id, formTemplateCode: 'MGB29-02' },
    { name: 'Metallurgical Chromite', mineralType: MineralType.METALLIC, defaultUnitId: unitMt?.id, formTemplateCode: 'MGB29-03' },
    { name: 'Refractory Chromite', mineralType: MineralType.METALLIC, defaultUnitId: unitMt?.id, formTemplateCode: 'MGB29-04' },
    { name: 'Nickel Ore', mineralType: MineralType.METALLIC, defaultUnitId: unitDmt?.id, formTemplateCode: 'MGB29-05' },
    { name: 'Iron', mineralType: MineralType.METALLIC, defaultUnitId: unitMt?.id, formTemplateCode: 'MGB29-06' },
    { name: 'Manganese', mineralType: MineralType.METALLIC, defaultUnitId: unitMt?.id, formTemplateCode: 'MGB29-07' },
    { name: 'Lead', mineralType: MineralType.METALLIC, defaultUnitId: unitMt?.id, formTemplateCode: 'MGB29-08' },
    { name: 'Zinc', mineralType: MineralType.METALLIC, defaultUnitId: unitMt?.id, formTemplateCode: 'MGB29-09' },
    { name: 'Chemical Grade Chromite', mineralType: MineralType.METALLIC, defaultUnitId: unitMt?.id, formTemplateCode: 'MGB29-21' },

    // Non-metallic
    { name: 'Dolomite', mineralType: MineralType.NON_METALLIC, defaultUnitId: unitMt?.id, formTemplateCode: 'MGB29-10' },
    { name: 'Basalt', mineralType: MineralType.NON_METALLIC, defaultUnitId: unitMt?.id, formTemplateCode: 'MGB29-10' },
    { name: 'Sand & Gravel (Industrial)', mineralType: MineralType.NON_METALLIC, defaultUnitId: unitCuM?.id, formTemplateCode: 'MGB29-12' },
    { name: 'Sand & Gravel (Commercial)', mineralType: MineralType.NON_METALLIC, defaultUnitId: unitCuM?.id, formTemplateCode: 'MGB29-13' }
  ];

  for (const c of commodities) {
    await prisma.commodity.upsert({
      where: { name: c.name },
      update: {
        mineralType: c.mineralType,
        defaultUnitId: c.defaultUnitId,
        formTemplateCode: c.formTemplateCode,
        isActive: true
      },
      create: {
        name: c.name,
        mineralType: c.mineralType,
        defaultUnitId: c.defaultUnitId,
        formTemplateCode: c.formTemplateCode,
        isActive: true
      }
    });
  }
}

async function upsertUsers() {
  const defaultPassword = 'password';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  const users = [
    {
      name: 'Juan Dela Cruz',
      email: 'admin@mgb.gov.ph',
      username: 'admin',
      role: UserRole.ADMIN
    },
    {
      name: 'Maria Santos',
      email: 'central@mgb.gov.ph',
      username: 'central',
      role: UserRole.CENTRAL_OFFICE
    },
    {
      name: 'Ricardo Reyes',
      email: 'region2@mgb.gov.ph',
      username: 'region2',
      role: UserRole.REGIONAL_ECONOMIST,
      // PSGC Region II (Cagayan Valley) code (used for filtering). If you prefer another region, edit after seeding.
      regionCode: '0200000000'
    },
    {
      name: 'Guest User',
      email: 'guest@mgb.gov.ph',
      username: 'guest',
      role: UserRole.GUEST
    }
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {
        name: u.name,
        email: u.email,
        role: u.role,
        regionCode: (u as any).regionCode ?? null,
        passwordHash
      },
      create: {
        name: u.name,
        email: u.email,
        username: u.username,
        role: u.role,
        regionCode: (u as any).regionCode ?? null,
        passwordHash
      }
    });
  }
}

async function upsertReportPermissions() {
  const reportTypes: ReportType[] = [
    ReportType.OPERATING_MINES,
    ReportType.DIRECTORY,
    ReportType.PRODUCTION,
    ReportType.SALES,
    ReportType.EXPORT_BY_COUNTRY,
    ReportType.EMPLOYMENT
  ];

  const roles: UserRole[] = [
    UserRole.ADMIN,
    UserRole.CENTRAL_OFFICE,
    UserRole.REGIONAL_ECONOMIST,
    UserRole.GUEST
  ];

  for (const role of roles) {
    for (const reportType of reportTypes) {
      const canView = role === UserRole.GUEST
        ? (reportType === ReportType.OPERATING_MINES || reportType === ReportType.DIRECTORY)
        : true;

      await prisma.reportPermission.upsert({
        where: { role_reportType: { role, reportType } },
        update: { canView },
        create: { role, reportType, canView }
      });
    }
  }
}

async function upsertExciseTaxConfigs() {
  // Pre-RA 12253: old rate (4% — keep same value, date boundary preserved for future rule changes)
  await prisma.exciseTaxConfig.upsert({
    where: { id: 'excise-pre-ra12253' },
    update: {},
    create: {
      id: 'excise-pre-ra12253',
      effectiveFrom: new Date('2000-01-01'),
      effectiveTo: new Date('2026-02-16'),
      rate: '0.04',
      legalBasis: 'Prior law'
    }
  });

  // RA 12253 effective 2026-02-17
  await prisma.exciseTaxConfig.upsert({
    where: { id: 'excise-ra12253' },
    update: {},
    create: {
      id: 'excise-ra12253',
      effectiveFrom: new Date('2026-02-17'),
      effectiveTo: null,
      rate: '0.04',
      legalBasis: 'RA 12253'
    }
  });
}

async function main() {
  await upsertPermitTypes();
  await upsertContractorStatuses();
  await upsertUnits();
  await upsertCommodities();
  await upsertUsers();
  await upsertReportPermissions();
  await upsertExciseTaxConfigs();
}

main()
  .then(async () => {
    console.log('✅ Seed completed');
  })
  .catch(async (e) => {
    console.error('❌ Seed failed', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
