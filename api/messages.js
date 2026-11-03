import { ObjectId } from "mongodb";
import { api, getCollections, getSession, methodNotAllowed, readBody, sendJson } from "../lib/server.js";

export default api(async (req, res) => {
  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: "Silakan masuk terlebih dahulu." });
  if (session.role !== "user" || !ObjectId.isValid(session.userId)) {
    return sendJson(res, 403, { error: "Akun ini tidak memiliki akses ke ruang chat." });
  }

  const { messages, users } = await getCollections();
  const account = await users.findOne(
    { _id: new ObjectId(session.userId) },
    { projection: { _id: 1, authVersion: 1 } },
  );
  if (!account || (account.authVersion || 0) !== session.authVersion) {
    return sendJson(res, 401, { error: "Sesi akun tidak lagi aktif. Silakan masuk kembali." });
  }
  if (req.method === "GET") {
    const recent = await messages
      .find({}, { projection: { senderId: 1, username: 1, text: 1, createdAt: 1 } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(50)
      .toArray();
    return sendJson(
      res,
      200,
      recent.reverse().map((message) => ({
        id: message._id.toString(),
        senderId: message.senderId,
        username: message.username,
        text: message.text,
        createdAt: message.createdAt,
      })),
    );
  }

  if (req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);

  const { text: rawText } = readBody(req);
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (!text || text.length > 1000) {
    return sendJson(res, 400, { error: "Pesan harus terdiri dari 1–1000 karakter." });
  }

  const message = {
    senderId: session.userId,
    username: session.username,
    text,
    createdAt: new Date(),
  };
  const result = await messages.insertOne(message);
  return sendJson(res, 201, {
    message: { id: result.insertedId.toString(), ...message },
  });
});
