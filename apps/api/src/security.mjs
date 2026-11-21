import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export function secureEquals(a, b) {
  const left = Buffer.from(digest(String(a)), 'hex');
  const right = Buffer.from(digest(String(b)), 'hex');
  return timingSafeEqual(left, right);
}
export function emailAddress(value) {
  if (typeof value !== 'string' || value.length > 254) throw new HttpError(400, 'Invalid email');
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Invalid email');
  return email;
}
export function passwordInput(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 1024) {
    throw new HttpError(400, 'Password must contain 12–1024 characters');
  }
  return value;
}
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(passwordInput(password), salt, 64);
  return ['scrypt', salt.toString('hex'), key.toString('hex')].join(':');
}
export async function verifyPassword(password, record) {
  if (typeof password !== 'string' || !record || typeof record !== 'string') return false;
  const [algo, salt, keyHex] = record.split(':');
  if (algo !== 'scrypt' || !/^[a-f0-9]{32}$/i.test(salt || '') || !/^[a-f0-9]{128}$/i.test(keyHex || '')) return false;
  const actual = await scrypt(password, Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(actual, Buffer.from(keyHex, 'hex'));
}
export function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, 'Invalid identifier');
  }
  return value;
}
export function pointInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Invalid location');
  const { latitude, longitude, accuracyM = null, capturedAt, source = 'manual', clientKey = null } = value;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new HttpError(400, 'Coordinates out of range');
  }
  if (accuracyM !== null && (typeof accuracyM !== 'number' || !Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > 100000)) {
    throw new HttpError(400, 'Invalid accuracy');
  }
  if (typeof source !== 'string' || !/^[a-z0-9_-]{1,32}$/i.test(source)) throw new HttpError(400, 'Invalid source');
  if (clientKey !== null && (typeof clientKey !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(clientKey))) throw new HttpError(400, 'Invalid client key');
  const date = capturedAt ? new Date(capturedAt) : new Date();
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 300000 || date.getTime() < Date.now() - 10 * 365 * 86400000) {
    throw new HttpError(400, 'Invalid capture time');
  }
  return { latitude, longitude, accuracyM, capturedAt: date.toISOString(), source, clientKey };
}
export function coordinateParam(value, low, high, name) {
  if (typeof value !== 'string' || !/^-?\d{1,3}(?:\.\d{1,10})?$/.test(value)) {
    throw new HttpError(400, 'Invalid ' + name);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < low || n > high) throw new HttpError(400, 'Invalid ' + name);
  return n;
}
export function radiusParam(value, fallback = 1000) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d{1,5}(?:\.\d{1,2})?$/.test(value)) {
    throw new HttpError(400, 'Invalid radius');
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 25000) throw new HttpError(400, 'Radius out of range');
  return n;
}
export function positiveLimit(value, fallback = 500, maximum = 1000) {
  if (value === null || value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) throw new HttpError(400, 'Invalid limit');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > maximum) throw new HttpError(400, 'Limit out of range');
  return n;
}
