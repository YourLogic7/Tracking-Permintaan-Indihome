import { ObjectId } from "mongodb";
import { api, getCollections, getSession, hashPassword, methodNotAllowed, readBody, sendJson } from "../../../lib/server.js";

export default api(async (req, res) => {
  const session = getSession(req);
  if (!session || session.role !== "admin") {
    return sendJson(res, 403, { error: "Akses khusus admin." });
  }

  if (req.method !== "DELETE" && req.method !== "PATCH") {
    return methodNotAllowed(res, ["DELETE", "PATCH"]);
  }

  const id = req.query?.id;
  if (typeof id !== "string" || !ObjectId.isValid(id)) {
    return sendJson(res, 400, { error: "ID akun tidak valid." });
  }

  const { users } = await getCollections();
  if (req.method === "DELETE") {
    const result = await users.deleteOne({ _id: new ObjectId(id) });
    if (!result.deletedCount) return sendJson(res, 404, { error: "Akun tidak ditemukan." });
    return sendJson(res, 200, { ok: true });
  }

  const { password } = readBody(req);
  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    return sendJson(res, 400, { error: "Kata sandi harus terdiri dari 10–128 karakter." });
  }

  const credentials = await hashPassword(password);
  const result = await users.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: { passwordSalt: credentials.salt, passwordHash: credentials.hash, passwordUpdatedAt: new Date() },
      $inc: { authVersion: 1 },
    },
  );
  if (!result.matchedCount) return sendJson(res, 404, { error: "Akun tidak ditemukan." });
  return sendJson(res, 200, { ok: true });
});
