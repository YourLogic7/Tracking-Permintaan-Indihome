import { api, getCollections, methodNotAllowed, readBody, sendJson, setSession, verifyPassword } from "../../lib/server.js";

export default api(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const { username: rawUsername, password } = readBody(req);
  const username = typeof rawUsername === "string" ? rawUsername.trim().toLowerCase() : "";
  if (!username || typeof password !== "string" || password.length > 128) {
    return sendJson(res, 400, { error: "Nama pengguna atau kata sandi tidak valid." });
  }

  const { users } = await getCollections();
  const user = await users.findOne({ username });
  if (!user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
    return sendJson(res, 401, { error: "Nama pengguna atau kata sandi salah." });
  }

  setSession(res, user);
  return sendJson(res, 200, { user: { id: user._id.toString(), username: user.username } });
});
