import { api, getSession, methodNotAllowed, sendJson } from "../../lib/server.js";

export default api(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: "Silakan masuk terlebih dahulu." });
  return sendJson(res, 200, {
    user: { id: session.userId, username: session.username, role: session.role },
  });
});
