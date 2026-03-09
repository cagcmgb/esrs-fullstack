# eSRS (Electronic Statistical Reporting System) — Fullstack Starter

This is a **fullstack starter** for the Mines and Geosciences Bureau (MGB) Electronic Statistical Reporting System (eSRS).

It includes:

- ✅ Backend API (Node.js + Express + TypeScript)
- ✅ Database (PostgreSQL via Prisma ORM)
- ✅ Frontend UI (React + TypeScript)
- ✅ Role-based access (Admin, Central Office, Regional Economist, Guest)
- ✅ Contractors enrollment + Central Office verification (auto Region-based Contractor ID)
- ✅ Data Entry (Administrative, Production, Sales & Marketing, Employment + file attachment)
- ✅ Report generation to Excel (Operating Mines, Directory, Production, Sales, Export by Country, Employment)
- ✅ Cascading Region → Province → Municipality via PSGC Cloud

> Note: This is an MVP starter that you can extend to fully mirror every cell/field of each official MGB Excel form.

## Tech Stack

- Backend: Express, Prisma, JWT Auth, ExcelJS, Multer
- DB: PostgreSQL
- Frontend: React (Vite), Recharts

## Folder Structure

```
/backend   # API + DB (Prisma)
/frontend  # Web UI
/docs      # references (MGB form links, downloaded forms)
/scripts   # helper scripts
```

## Quick Start (Local)

### 1) Start Postgres

Option A: Docker

```bash
docker compose up -d
```

### 2) Backend

```bash
cd backend
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Backend runs at `http://localhost:4000` (by default).

### 3) Frontend

```bash
cd ../frontend
cp .env.example .env
npm install
npm run dev
```

Frontend runs at `http://localhost:3000` (Vite dev server).

## Default Users (Seed Data)

After `npm run db:seed`, you can log in with:

- Admin
  - username: `admin`
  - password: `password`
- Central Office
  - username: `central`
  - password: `password`
- Regional Economist (Region II)
  - username: `region2`
  - password: `password`
- Guest
  - username: `guest`
  - password: `password`

## Key Workflows

### Contractors

1. Regional Economist enrolls a contractor (pending verification)
2. Central Office / Admin verifies the contractor
3. Upon verification, the system assigns a **region-based Contractor ID** (e.g., `R2-001`).

### Admin Bulk Contractor Enrollment

Admins can bulk enroll contractors from **CSV** or **Excel (.xlsx)** in Admin Panel → Pre-select Lists → Bulk Enroll Contractors.

- Download template endpoints:
  - `GET /api/admin/contractors/import-template?format=csv`
  - `GET /api/admin/contractors/import-template?format=xlsx`
- Upload endpoint:
  - `POST /api/admin/contractors/import` (form-data with `file`)
- Required headers:
  - `name,tin,operatorName,contactNo,email,regionCode,regionName,provinceCode,provinceName,municipalityCode,municipalityName,areaHectare,status,commodities`
- `commodities` accepts multiple values separated by `|`, `,`, or `;` (by commodity name or commodity ID).

Starter CSV template file is also included at `docs/templates/contractor-bulk-upload-template.csv`.

### Data Entry + Submission

1. Select verified contractor + commodity + month/year
2. Fill out:
   - I. Administrative
   - II. Production
   - III. Sales & Marketing
   - IV. Employment
3. Upload supporting attachment(s)
4. Submit
5. Central Office verifies or rejects

### Reports (Excel)

Reports support filters by:
- Monthly / Quarterly / Yearly (quarter & yearly are derived from monthly submissions)
- Region
- Mineral Type (Metallic / Non-metallic)
- Commodity

Each Excel report includes the required header:

Republic of the Philippines
Department of Environment and Natural Resources
MINES AND GEOSCIENCES BUREAU
Mineral Economics, Information & Publications Division

## MGB Form Files

See: `docs/mgb-forms.md`

(Optional) Download them into this repo:

```bash
chmod +x scripts/download-mgb-forms.sh
./scripts/download-mgb-forms.sh
```

## Next Enhancements

- Mirror each MGB Form 29-
- Add quarterly/annual form templates
- Add stronger validation rules per commodity
- Add audit logging + activity trails
- Add S3/MinIO storage for attachments

---

If you want, I can help you extend this MVP into an exact per-commodity form builder (29-01 ... 29-21) with field-level validation and Excel export that matches the official layouts.
