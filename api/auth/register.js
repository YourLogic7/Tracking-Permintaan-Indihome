import { api, getCollections, hashPassword, methodNotAllowed, readBody, sendJson, setSession } from "../../lib/server.js";

const usernamePattern = /^[a-z0-9_]{3,24}$/;

export default api(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const { username: rawUsername, password } = readBody(req);
  const username = typeof rawUsername === "string" ? rawUsername.trim().toLowerCase() : "";
  if (!usernamePattern.test(username)) {
    return sendJson(res, 400, { error: "Nama pengguna harus 3–24 karakter (huruf, angka, atau _)." });
  }
  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    return sendJson(res, 400, { error: "Kata sandi harus terdiri dari 10–128 karakter." });
  }

  const { users } = await getCollections();
  const credentials = await hashPassword(password);
  try {
    const result = await users.insertOne({
      username,
      passwordSalt: credentials.salt,
      passwordHash: credentials.hash,
      authVersion: 0,
      createdAt: new Date(),
    });
    const user = { _id: result.insertedId, username };
    setSession(res, user);
    return sendJson(res, 201, { user: { id: user._id.toString(), username } });
  } catch (error) {
    if (error?.code === 11000) {
      return sendJson(res, 409, { error: "Nama pengguna sudah digunakan." });
    }
    throw error;
  }
});
