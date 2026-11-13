import { ObjectId } from "mongodb";
import { api, getCollections, getSession, methodNotAllowed } from "../../../lib/server.js";

export default api(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: "Silakan masuk terlebih dahulu." });
    return;
  }
  const isAdmin = session.role === "admin";
  if (!isAdmin && (session.role !== "user" || !ObjectId.isValid(session.userId))) {
    res.status(403).json({ error: "Akun ini tidak memiliki akses ke ruang chat." });
    return;
  }
  if (!ObjectId.isValid(req.query.id)) {
    res.status(400).json({ error: "Pesan tidak valid." });
    return;
  }

  const { messages, users } = await getCollections();
  if (!isAdmin) {
    const account = await users.findOne(
      { _id: new ObjectId(session.userId) },
      { projection: { _id: 1, authVersion: 1 } },
    );
    if (!account || (account.authVersion || 0) !== session.authVersion) {
      res.status(401).json({ error: "Sesi akun tidak lagi aktif. Silakan masuk kembali." });
      return;
    }
  }

  const message = await messages.findOne(
    { _id: new ObjectId(req.query.id) },
    { projection: { imageData: 1, imageType: 1 } },
  );
  if (!message?.imageData || message.imageType !== "image/jpeg") {
    res.status(404).json({ error: "Foto tidak ditemukan." });
    return;
  }

  const match = message.imageData.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) {
    res.status(500).json({ error: "Foto tersimpan dalam format yang tidak valid." });
    return;
  }

  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const content = Buffer.from(match[1], "base64");
  if (content.length < 3 || content[0] !== 0xff || content[1] !== 0xd8 || content[2] !== 0xff) {
    res.status(500).json({ error: "Foto tersimpan dalam format yang tidak valid." });
    return;
  }
  res.status(200).send(content);
});
