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
  if (req.method === "DELETE") {
    const result = await messages.deleteMany({});
    return sendJson(res, 200, { ok: true, deletedCount: result.deletedCount });
  }

  if (req.method === "GET") {
    const recent = await messages
      .find({}, { projection: { senderId: 1, username: 1, text: 1, createdAt: 1, replyTo: 1, readBy: 1 } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(50)
      .toArray();
    if (recent.length) {
      await messages.updateMany(
        {
          _id: { $in: recent.map((message) => message._id) },
          senderId: { $ne: session.userId },
          readBy: { $ne: session.userId },
        },
        { $addToSet: { readBy: session.userId } },
      );
    }
    return sendJson(res, 200, {
      messages: recent.reverse().map((message) => ({
        id: message._id.toString(),
        senderId: message.senderId,
        username: message.username,
        text: message.text,
        createdAt: message.createdAt,
        replyTo: message.replyTo,
        isRead: (message.readBy || []).some((userId) => userId !== message.senderId),
      })),
    });
  }

  if (req.method !== "POST") return methodNotAllowed(res, ["GET", "POST", "DELETE"]);

  const { text: rawText, replyToId } = readBody(req);
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (!text || text.length > 1000) {
    return sendJson(res, 400, { error: "Pesan harus terdiri dari 1–1000 karakter." });
  }

  let replyTo;
  if (replyToId !== undefined) {
    if (typeof replyToId !== "string" || !ObjectId.isValid(replyToId)) {
      return sendJson(res, 400, { error: "Pesan yang dibalas tidak valid." });
    }
    const repliedMessage = await messages.findOne(
      { _id: new ObjectId(replyToId) },
      { projection: { username: 1, text: 1 } },
    );
    if (!repliedMessage) return sendJson(res, 404, { error: "Pesan yang dibalas tidak ditemukan." });
    replyTo = {
      id: repliedMessage._id.toString(),
      username: repliedMessage.username,
      text: repliedMessage.text,
    };
  }

  const message = {
    senderId: session.userId,
    username: session.username,
    text,
    createdAt: new Date(),
    ...(replyTo ? { replyTo } : {}),
  };
  const result = await messages.insertOne(message);
  return sendJson(res, 201, {
    message: { id: result.insertedId.toString(), ...message },
  });
});
