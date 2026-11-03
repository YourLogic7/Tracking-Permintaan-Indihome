import { api, getAdminConfigurationError, methodNotAllowed, readBody, sendJson, setSession, verifyAdminPassword } from "../../lib/server.js";

export default api(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const configurationError = getAdminConfigurationError();
  if (configurationError) {
    return sendJson(res, 503, {
      error: `${configurationError} Atur Environment Variables pada environment deployment yang aktif, lalu redeploy.`,
    });
  }

  const { password } = readBody(req);
  if (typeof password !== "string" || !verifyAdminPassword(password)) {
    return sendJson(res, 401, { error: "Password admin salah." });
  }

  const admin = { _id: { toString: () => "admin" }, username: "Admin" };
  setSession(res, admin, "admin");
  return sendJson(res, 200, { user: { id: "admin", username: "Admin", role: "admin" } });
});
