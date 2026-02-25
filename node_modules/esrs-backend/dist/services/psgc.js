import axios from 'axios';
import { env } from '../config.js';
const cache = new Map();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
async function cachedGet(url) {
    const now = Date.now();
    const cached = cache.get(url);
    if (cached && cached.expiresAt > now) {
        return cached.data;
    }
    const res = await axios.get(url, {
        timeout: 15000,
        headers: {
            'Accept': 'application/json'
        }
    });
    cache.set(url, { expiresAt: now + ONE_DAY_MS, data: res.data });
    return res.data;
}
export async function listRegions() {
    const url = `${env.PSGC_BASE_URL}/regions`;
    return cachedGet(url);
}
export async function listProvincesByRegion(regionCode) {
    const url = `${env.PSGC_BASE_URL}/regions/${regionCode}/provinces`;
    return cachedGet(url);
}
export async function listCitiesMunicipalitiesByRegion(regionCode) {
    const url = `${env.PSGC_BASE_URL}/regions/${regionCode}/cities-municipalities`;
    return cachedGet(url);
}
export function deriveProvinceCodeFromCityMunicipalityCode(code) {
    // PSGC Cloud currently uses 10-digit codes, where province code matches first 5 digits + '00000'
    if (!code || code.length < 5)
        return null;
    const prefix = code.slice(0, 5);
    return `${prefix}00000`;
}
