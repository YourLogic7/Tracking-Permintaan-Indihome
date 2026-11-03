import { api, clearSession, methodNotAllowed, sendJson } from "../../lib/server.js";

export default api(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  clearSession(res);
  return sendJson(res, 200, { ok: true });
});
