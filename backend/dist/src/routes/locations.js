import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { listRegions, listProvincesByRegion, listCitiesMunicipalitiesByRegion, deriveProvinceCodeFromCityMunicipalityCode } from '../services/psgc.js';
export const locationsRouter = Router();
locationsRouter.get('/regions', requireAuth, asyncHandler(async (_req, res) => {
    const regions = await listRegions();
    res.json(regions);
}));
locationsRouter.get('/regions/:regionCode/provinces', requireAuth, asyncHandler(async (req, res) => {
    const { regionCode } = req.params;
    const provinces = await listProvincesByRegion(regionCode);
    res.json(provinces);
}));
locationsRouter.get('/regions/:regionCode/provinces/:provinceCode/cities-municipalities', requireAuth, asyncHandler(async (req, res) => {
    const { regionCode, provinceCode } = req.params;
    const cms = await listCitiesMunicipalitiesByRegion(regionCode);
    const filtered = cms.filter((c) => deriveProvinceCodeFromCityMunicipalityCode(c.code) === provinceCode);
    res.json(filtered);
}));
