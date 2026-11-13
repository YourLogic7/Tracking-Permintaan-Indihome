import { ObjectId } from "mongodb";
import { api, getCollections, getSession, methodNotAllowed, readBody, sendJson } from "../lib/server.js";

export default api(async (req, res) => {
  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: "Silakan masuk terlebih dahulu." });
  const isAdmin = session.role === "admin";
  if (isAdmin && !["GET", "POST", "DELETE"].includes(req.method)) {
    return sendJson(res, 403, { error: "Metode ini tidak diizinkan untuk admin." });
  }
  if (!isAdmin && (session.role !== "user" || !ObjectId.isValid(session.userId))) {
    return sendJson(res, 403, { error: "Akun ini tidak memiliki akses ke ruang chat." });
  }

  const { messages, users } = await getCollections();
  if (!isAdmin) {
    const account = await users.findOne(
      { _id: new ObjectId(session.userId) },
      { projection: { _id: 1, authVersion: 1 } },
    );
    if (!account || (account.authVersion || 0) !== session.authVersion) {
      return sendJson(res, 401, { error: "Sesi akun tidak lagi aktif. Silakan masuk kembali." });
    }
  }
  if (req.method === "DELETE") {
    const { messageId } = readBody(req);
    if (messageId !== undefined) {
      if (typeof messageId !== "string" || !ObjectId.isValid(messageId)) {
        return sendJson(res, 400, { error: "Pesan yang akan dihapus tidak valid." });
      }
      const result = await messages.deleteOne({ _id: new ObjectId(messageId) });
      if (!result.deletedCount) return sendJson(res, 404, { error: "Pesan tidak ditemukan." });
      return sendJson(res, 200, { ok: true, deletedId: messageId });
    }

    const result = await messages.deleteMany({});
    return sendJson(res, 200, { ok: true, deletedCount: result.deletedCount });
  }

  if (req.method === "GET") {
    const query = messages
      .find({}, { projection: { senderId: 1, username: 1, text: 1, imageType: 1, createdAt: 1, replyTo: 1, readBy: 1 } })
      .sort({ createdAt: -1, _id: -1 });
    if (!isAdmin) query.limit(50);
    const recent = await query.toArray();
    if (!isAdmin && recent.length) {
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
        imageType: message.imageType,
        createdAt: message.createdAt,
        replyTo: message.replyTo,
        isRead: (message.readBy || []).some((userId) => userId !== message.senderId),
      })),
    });
  }

  if (req.method !== "POST") return methodNotAllowed(res, ["GET", "POST", "DELETE"]);

  const { text: rawText, imageData, replyToId } = readBody(req);
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (text.length > 1000) {
    return sendJson(res, 400, { error: "Pesan harus terdiri dari 1–1000 karakter." });
  }
  if (!text && imageData === undefined) {
    return sendJson(res, 400, { error: "Tulis pesan atau lampirkan foto." });
  }

  let image;
  if (imageData !== undefined) {
    const match = typeof imageData === "string" && imageData.length <= 1_400_000
      ? imageData.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/)
      : null;
    if (!match) return sendJson(res, 400, { error: "Format foto tidak valid." });
    const content = Buffer.from(match[1], "base64");
    if (content.length > 1024 * 1024) {
      return sendJson(res, 400, { error: "Ukuran foto maksimal 1 MB." });
    }
    if (content.length < 3 || content[0] !== 0xff || content[1] !== 0xd8 || content[2] !== 0xff || content.toString("base64") !== match[1]) {
      return sendJson(res, 400, { error: "Format foto tidak valid." });
    }
    image = { imageData, imageType: "image/jpeg" };
  }

  let replyTo;
  if (replyToId !== undefined) {
    if (typeof replyToId !== "string" || !ObjectId.isValid(replyToId)) {
      return sendJson(res, 400, { error: "Pesan yang dibalas tidak valid." });
    }
    const repliedMessage = await messages.findOne(
      { _id: new ObjectId(replyToId) },
      { projection: { username: 1, text: 1, imageType: 1 } },
    );
    if (!repliedMessage) return sendJson(res, 404, { error: "Pesan yang dibalas tidak ditemukan." });
    replyTo = {
      id: repliedMessage._id.toString(),
      username: repliedMessage.username,
      text: repliedMessage.text || (repliedMessage.imageType ? "Foto" : ""),
    };
  }

  const message = {
    senderId: session.userId,
    username: session.username,
    text,
    ...image,
    createdAt: new Date(),
    ...(replyTo ? { replyTo } : {}),
  };
  const result = await messages.insertOne(message);
  return sendJson(res, 201, {
    message: {
      id: result.insertedId.toString(),
      senderId: message.senderId,
      username: message.username,
      text: message.text,
      imageType: message.imageType,
      createdAt: message.createdAt,
      replyTo: message.replyTo,
    },
  });
});
