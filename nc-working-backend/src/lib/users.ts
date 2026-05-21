import fs from "fs";
import path from "path";
import { randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { dbEnabled, dbQuery, logDbError } from "./db.js";

export type ShippingAddress = {
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  name?: string;
  defaultShipping?: ShippingAddress;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
};

export type PublicUser = Omit<User, "passwordHash">;

type UserRecord = User;

const DATA_DIR = path.resolve(process.env.DATA_DIR || "data");
const DATA_FILE = path.join(DATA_DIR, "users.json");

const usersById = new Map<string, UserRecord>();
const usersByEmail = new Map<string, string>();

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadFromDisk() {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    return;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      if (typeof entry.id !== "string" || typeof entry.email !== "string") continue;
      const record: UserRecord = {
        id: entry.id,
        email: entry.email.toLowerCase().trim(),
        passwordHash: typeof entry.passwordHash === "string" ? entry.passwordHash : "",
        name: typeof entry.name === "string" ? entry.name : undefined,
        defaultShipping: validateShipping(entry.defaultShipping),
        createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
        updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : new Date().toISOString(),
        lastLoginAt: typeof entry.lastLoginAt === "string" ? entry.lastLoginAt : undefined,
      };
      usersById.set(record.id, record);
      usersByEmail.set(record.email, record.id);
    }
  } catch (error) {
    console.error("[users] Failed to load users.json", error);
  }
}

function validateShipping(input: unknown): ShippingAddress | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  const line1 = typeof value.line1 === "string" ? value.line1.trim() : "";
  if (!line1) return undefined;
  const line2 = typeof value.line2 === "string" ? value.line2.trim() : undefined;
  const city = typeof value.city === "string" ? value.city.trim() : undefined;
  const state = typeof value.state === "string" ? value.state.trim() : undefined;
  const postalCode = typeof value.postalCode === "string" ? value.postalCode.trim() : undefined;
  const country = typeof value.country === "string" ? value.country.trim().toUpperCase() : undefined;
  return {
    line1,
    line2,
    city,
    state,
    postalCode,
    country,
  };
}

function saveToDisk() {
  if (dbEnabled) return;
  try {
    ensureDataDir();
    const rows = Array.from(usersById.values()).map((user) => ({
      ...user,
      defaultShipping: user.defaultShipping ?? undefined,
    }));
    fs.writeFileSync(DATA_FILE, JSON.stringify(rows, null, 2), "utf8");
  } catch (error) {
    console.error("[users] Failed to persist users.json", error);
  }
}

if (!dbEnabled) loadFromDisk();

function rowToUser(entry: any): UserRecord | null {
  if (!entry || typeof entry !== "object") return null;
  const id = typeof entry.id === "string" ? entry.id : "";
  const email = typeof entry.email === "string" ? entry.email.toLowerCase().trim() : "";
  if (!id || !email) return null;
  return {
    id,
    email,
    passwordHash: typeof entry.password_hash === "string" ? entry.password_hash : entry.passwordHash ?? "",
    name: typeof entry.name === "string" ? entry.name : undefined,
    defaultShipping: validateShipping(entry.default_shipping ?? entry.defaultShipping),
    createdAt:
      entry.created_at instanceof Date
        ? entry.created_at.toISOString()
        : typeof entry.created_at === "string"
          ? entry.created_at
          : typeof entry.createdAt === "string"
            ? entry.createdAt
            : new Date().toISOString(),
    updatedAt:
      entry.updated_at instanceof Date
        ? entry.updated_at.toISOString()
        : typeof entry.updated_at === "string"
          ? entry.updated_at
          : typeof entry.updatedAt === "string"
            ? entry.updatedAt
            : new Date().toISOString(),
    lastLoginAt:
      entry.last_login_at instanceof Date
        ? entry.last_login_at.toISOString()
        : typeof entry.last_login_at === "string"
          ? entry.last_login_at
          : typeof entry.lastLoginAt === "string"
            ? entry.lastLoginAt
            : undefined,
  };
}

function replaceUsers(rows: UserRecord[]) {
  usersById.clear();
  usersByEmail.clear();
  for (const record of rows) {
    usersById.set(record.id, record);
    usersByEmail.set(record.email, record.id);
  }
}

export async function loadUsersFromDb() {
  if (!dbEnabled) return;
  try {
    const result = await dbQuery(
      "SELECT id, email, password_hash, name, default_shipping, created_at, updated_at, last_login_at FROM users ORDER BY created_at ASC",
    );
    replaceUsers(result.rows.map(rowToUser).filter((row): row is UserRecord => row !== null));
  } catch (error) {
    logDbError("failed to load users", error);
  }
}

async function persistUser(user: UserRecord) {
  if (!dbEnabled) {
    saveToDisk();
    return;
  }
  await dbQuery(
    `INSERT INTO users (id, email, password_hash, name, default_shipping, created_at, updated_at, last_login_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       password_hash = EXCLUDED.password_hash,
       name = EXCLUDED.name,
       default_shipping = EXCLUDED.default_shipping,
       created_at = EXCLUDED.created_at,
       updated_at = EXCLUDED.updated_at,
       last_login_at = EXCLUDED.last_login_at`,
    [
      user.id,
      user.email,
      user.passwordHash,
      user.name ?? null,
      user.defaultShipping ?? null,
      user.createdAt,
      user.updatedAt,
      user.lastLoginAt ?? null,
    ],
  );
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashPassword(password: string) {
  const salt = randomUUID().replace(/-/g, "");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, "hex");
  const verifyBuffer = scryptSync(password, salt, 64);
  if (hashBuffer.length !== verifyBuffer.length) return false;
  return timingSafeEqual(hashBuffer, verifyBuffer);
}

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _ignored, ...rest } = user;
  return rest;
}

export function getUserById(id: string): User | null {
  return usersById.get(id) ?? null;
}

export function getUserByEmail(email: string): User | null {
  const id = usersByEmail.get(normalizeEmail(email));
  return id ? getUserById(id) : null;
}

export async function createUser(input: {
  email: string;
  password: string;
  name?: string;
  defaultShipping?: ShippingAddress;
}): Promise<User> {
  const email = normalizeEmail(input.email);
  if (usersByEmail.has(email)) {
    throw new Error("Email already registered");
  }
  const now = new Date().toISOString();
  const user: User = {
    id: randomUUID(),
    email,
    passwordHash: hashPassword(input.password),
    name: input.name?.trim() || undefined,
    defaultShipping: input.defaultShipping ? validateShipping(input.defaultShipping) : undefined,
    createdAt: now,
    updatedAt: now,
  };
  usersById.set(user.id, user);
  usersByEmail.set(email, user.id);
  await persistUser(user);
  return user;
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const user = getUserByEmail(email);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  user.lastLoginAt = new Date().toISOString();
  user.updatedAt = user.lastLoginAt;
  await persistUser(user);
  return user;
}

export async function updateUser(userId: string, changes: Partial<Omit<User, "id" | "passwordHash" | "email">>) {
  const user = usersById.get(userId);
  if (!user) {
    throw new Error("User not found");
  }
  if (changes.name !== undefined) {
    user.name = changes.name ? String(changes.name).trim() : undefined;
  }
  if (changes.defaultShipping !== undefined) {
    user.defaultShipping = validateShipping(changes.defaultShipping);
  }
  if (changes.lastLoginAt) {
    user.lastLoginAt = changes.lastLoginAt;
  }
  user.updatedAt = new Date().toISOString();
  await persistUser(user);
  return user;
}

export async function setUserPassword(userId: string, newPassword: string) {
  const user = usersById.get(userId);
  if (!user) throw new Error("User not found");
  user.passwordHash = hashPassword(newPassword);
  user.updatedAt = new Date().toISOString();
  await persistUser(user);
}

export function listUsers(): PublicUser[] {
  return Array.from(usersById.values()).map(toPublicUser);
}
