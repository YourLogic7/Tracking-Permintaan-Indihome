import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { MongoClient } from "mongodb";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "chat_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function sendJson(res, status, data) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(data);
}

export function api(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("API request failed:", error);
      sendJson(res, 500, { error: "Terjadi kesalahan server. Periksa konfigurasi backend." });
    }
  };
}

export function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  sendJson(res, 405, { error: "Metode request tidak didukung." });
}

export function readBody(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}

let clientPromise;
let indexesPromise;

export async function getCollections() {
  sessionSecret();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI belum dikonfigurasi.");

  if (!clientPromise) {
    const client = new MongoClient(uri);
    clientPromise = client.connect();
  }
  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB || "infopermintaan");

  if (!indexesPromise) {
    indexesPromise = Promise.all([
      db.collection("users").createIndex({ username: 1 }, { unique: true }),
      db.collection("messages").createIndex({ createdAt: -1 }),
    ]);
  }
  await indexesPromise;

  return {
    users: db.collection("users"),
    messages: db.collection("messages"),
  };
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET harus diatur dengan minimal 32 karakter.");
  }
  return secret;
}

function sign(value) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

export function setSession(res, user) {
  const payload = Buffer.from(
    JSON.stringify({
      userId: user._id.toString(),
      username: user.username,
      expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    }),
  ).toString("base64url");
  const token = `${payload}.${sign(payload)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
  );
}

export function clearSession(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
  );
}

export function getSession(req) {
  const cookieHeader = req.headers.cookie || "";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  let expected;
  try {
    expected = Buffer.from(sign(payload));
  } catch {
    return null;
  }
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof session.userId !== "string" || typeof session.username !== "string") return null;
    if (typeof session.expiresAt !== "number" || session.expiresAt <= Date.now() / 1000) return null;
    return { userId: session.userId, username: session.username };
  } catch {
    return null;
  }
}

export async function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const derivedKey = await scrypt(password, salt, 64);
  return { salt, hash: Buffer.from(derivedKey).toString("hex") };
}

export async function verifyPassword(password, salt, expectedHash) {
  const { hash } = await hashPassword(password, salt);
  const actual = Buffer.from(hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export { sendJson };
