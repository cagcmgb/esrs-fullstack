import axios from 'axios';
import { env } from '../config.js';

type CacheEntry = { expiresAt: number; data: any };
const cache = new Map<string, CacheEntry>();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function cachedGet<T>(url: string): Promise<T> {
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.data as T;
  }

  const res = await axios.get(url, {
    timeout: 15000,
    headers: {
      'Accept': 'application/json'
    }
  });

  cache.set(url, { expiresAt: now + ONE_DAY_MS, data: res.data });
  return res.data as T;
}

export type NamedCode = { name: string; code: string };
export type CityMunicipality = {
  name: string;
  code: string;
  type?: string;
  zip_code?: string;
  district?: string;
};

export async function listRegions(): Promise<NamedCode[]> {
  const url = `${env.PSGC_BASE_URL}/regions`;
  return cachedGet<NamedCode[]>(url);
}

export async function listProvincesByRegion(regionCode: string): Promise<NamedCode[]> {
  const url = `${env.PSGC_BASE_URL}/regions/${regionCode}/provinces`;
  return cachedGet<NamedCode[]>(url);
}

export async function listCitiesMunicipalitiesByRegion(regionCode: string): Promise<CityMunicipality[]> {
  const url = `${env.PSGC_BASE_URL}/regions/${regionCode}/cities-municipalities`;
  return cachedGet<CityMunicipality[]>(url);
}

export function deriveProvinceCodeFromCityMunicipalityCode(code: string): string | null {
  // PSGC Cloud currently uses 10-digit codes, where province code matches first 5 digits + '00000'
  if (!code || code.length < 5) return null;
  const prefix = code.slice(0, 5);
  return `${prefix}00000`;
}
