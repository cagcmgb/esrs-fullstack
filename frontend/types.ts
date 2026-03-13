import { UserRole, USER_ROLES, User as GeneratedUser } from './src/generated/prisma-enums';

export type MineralType = 'METALLIC' | 'NON_METALLIC';

export type User = GeneratedUser;
export { UserRole, USER_ROLES };

export interface PermitType {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface ContractorStatus {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface Unit {
  id: string;
  name: string;
  symbol?: string | null;
}

export interface Country {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface Commodity {
  id: string;
  name: string;
  mineralType: MineralType;
  category?: string | null;
  defaultUnitId?: string | null;
  defaultUnit?: Unit | null;
  formTemplateCode?: string | null;
  isActive: boolean;
}

export interface Permit {
  id?: string;
  permitTypeId: string;
  permitType?: PermitType;
  permitNumber: string;
  dateApproved?: string | null;
  dateExpiration?: string | null;
}

export interface ContractorCommodity {
  commodityId: string;
  commodity: Commodity;
}

export interface Contractor {
  id: string;
  contractorCode?: string | null;
  name: string;
  tin: string;
  operatorName: string;
  contactNo: string;
  email: string;

  regionCode: string;
  regionName: string;
  provinceCode?: string | null;
  provinceName: string;
  municipalityCode?: string | null;
  municipalityName: string;

  areaHectare: number;
  statusId: string;
  status: ContractorStatus;

  isVerified: boolean;
  createdAt: string;

  permits: Permit[];
  contractorCommodities: ContractorCommodity[];
}

export type SubmissionStatus = 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED';

export interface Attachment {
  id: string;
  originalName: string;
  mimeType: string;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface Submission {
  id: string;
  contractorId: string;
  contractor: Contractor;
  commodityId: string;
  commodity: Commodity;
  year: number;
  month?: number | null;
  status: SubmissionStatus;
  rejectedReason?: string | null;

  administrative?: any;
  production?: any;
  sales?: any;
  employment?: any;

  submittedAt?: string | null;
  verifiedAt?: string | null;
  attachments: Attachment[];

  createdAt: string;
}

export type ReportType = 'OPERATING_MINES' | 'DIRECTORY' | 'PRODUCTION' | 'SALES' | 'EXPORT_BY_COUNTRY' | 'EMPLOYMENT';

export interface ReportPermission {
  id: string;
  role: UserRole;
  reportType: ReportType;
  canView: boolean;
}

// Dashboard payload
export interface RegionalStat {
  regionCode: string;
  regionName: string;
  productionValue: number;
  fobValue: number;
  exciseTax: number;
  contractorCount: number;
  topContractors: { id: string; name: string }[];
  leadingCommodity: string;
  verifiedCount: number;
  pendingCount: number;
}

export interface MonthlyTrend {
  month: number;
  monthName: string;
  productionQty: number;
  salesQty: number;
}

export interface DashboardSummary {
  year: number;
  contractors: { total: number; verified: number; pending: number };
  submissions: { total: number; byStatus: Record<string, number> };
  productionByCommodity: { commodityName: string; quantity: number; value: number }[];
  regionalStats: RegionalStat[];
  monthlyTrend: MonthlyTrend[];
  totalFobValue: number;
  estimatedExciseTax: number;
  lateFilingCount: number;
}

// Location types (PSGC Cloud)
export interface NamedCode {
  name: string;
  code: string;
}

export interface CityMunicipality extends NamedCode {
  type?: string;
  district?: string;
  zip_code?: string;
}
