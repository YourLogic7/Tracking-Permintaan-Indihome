import { api, getCollections, getSession, hashPassword, methodNotAllowed, readBody, sendJson } from "../../lib/server.js";

const usernamePattern = /^[a-z0-9_]{3,24}$/;

export default api(async (req, res) => {
  const session = getSession(req);
  if (!session || session.role !== "admin") {
    return sendJson(res, 403, { error: "Akses khusus admin." });
  }

  const { users } = await getCollections();
  if (req.method === "GET") {
    const accounts = await users
      .find({}, { projection: { username: 1, createdAt: 1 } })
      .sort({ createdAt: -1, _id: -1 })
      .toArray();
    return sendJson(
      res,
      200,
      accounts.map((account) => ({
        id: account._id.toString(),
        username: account.username,
        createdAt: account.createdAt,
      })),
    );
  }

  if (req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);

  const { username: rawUsername, password } = readBody(req);
  const username = typeof rawUsername === "string" ? rawUsername.trim().toLowerCase() : "";
  if (!usernamePattern.test(username)) {
    return sendJson(res, 400, { error: "Nama pengguna harus 3–24 karakter (huruf, angka, atau _)." });
  }
  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    return sendJson(res, 400, { error: "Kata sandi harus terdiri dari 10–128 karakter." });
  }

  const credentials = await hashPassword(password);
  try {
    const result = await users.insertOne({
      username,
      passwordSalt: credentials.salt,
      passwordHash: credentials.hash,
      authVersion: 0,
      createdAt: new Date(),
    });
    return sendJson(res, 201, {
      user: { id: result.insertedId.toString(), username, createdAt: new Date() },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return sendJson(res, 409, { error: "Nama pengguna sudah digunakan." });
    }
    throw error;
  }
});
