import { ObjectId } from "mongodb";
import { api, getCollections, getSession, methodNotAllowed, readBody, sendJson } from "../lib/server.js";

const ACTIVE_STATUSES = ["requested", "accepted", "active"];
const SIGNAL_TYPES = ["offer", "answer", "candidate"];
const REQUEST_TTL_MS = 2 * 60 * 1000;
const ACTIVE_TTL_MS = 10 * 60 * 1000;
const CLOSED_TTL_MS = 5 * 60 * 1000;

function publicSession(cameraSession) {
  return {
    id: cameraSession._id.toString(),
    targetUserId: cameraSession.targetUserId,
    username: cameraSession.username,
    status: cameraSession.status,
    createdAt: cameraSession.createdAt,
  };
}

export default api(async (req, res) => {
  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: "Silakan masuk terlebih dahulu." });
  const isAdmin = session.role === "admin";
  if (!isAdmin && (session.role !== "user" || !ObjectId.isValid(session.userId))) {
    return sendJson(res, 403, { error: "Akun ini tidak memiliki akses kamera." });
  }

  const { users, cameraSessions } = await getCollections();
  if (!isAdmin) {
    const account = await users.findOne(
      { _id: new ObjectId(session.userId) },
      { projection: { _id: 1, authVersion: 1 } },
    );
    if (!account || (account.authVersion || 0) !== session.authVersion) {
      return sendJson(res, 401, { error: "Sesi akun tidak lagi aktif. Silakan masuk kembali." });
    }
  }

  if (req.method === "GET") {
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : "";
    if (sessionId) {
      if (!ObjectId.isValid(sessionId)) return sendJson(res, 400, { error: "Sesi kamera tidak valid." });
      let cameraSession = await cameraSessions.findOne({ _id: new ObjectId(sessionId) });
      const isParticipant = cameraSession && (
        (isAdmin && cameraSession.adminId === session.userId) ||
        (!isAdmin && cameraSession.targetUserId === session.userId)
      );
      if (!isParticipant) return sendJson(res, 404, { error: "Sesi kamera tidak ditemukan." });

      const after = typeof req.query.after === "string" ? req.query.after : "";
      if (after && !ObjectId.isValid(after)) return sendJson(res, 400, { error: "Penanda sinyal tidak valid." });
      const now = new Date();
      if (ACTIVE_STATUSES.includes(cameraSession.status) && cameraSession.expiresAt <= now) {
        const endedAt = new Date(now.getTime() + CLOSED_TTL_MS);
        const result = await cameraSessions.updateOne(
          { _id: cameraSession._id, status: { $in: ACTIVE_STATUSES }, expiresAt: { $lte: now } },
          { $set: { status: "ended", endedAt: now, expiresAt: endedAt } },
        );
        cameraSession = result.modifiedCount
          ? { ...cameraSession, status: "ended" }
          : await cameraSessions.findOne({ _id: cameraSession._id });
      }
      if (!cameraSession) return sendJson(res, 404, { error: "Sesi kamera tidak ditemukan." });
      const nextExpiry = new Date(now.getTime() + (ACTIVE_STATUSES.includes(cameraSession.status) ? ACTIVE_TTL_MS : CLOSED_TTL_MS));
      await cameraSessions.updateOne({ _id: cameraSession._id }, { $set: { expiresAt: nextExpiry } });
      const signals = cameraSession.signals || [];
      const cursorIndex = after ? signals.findIndex((signal) => signal._id.toString() === after) : -1;
      return sendJson(res, 200, {
        session: publicSession(cameraSession),
        signals: (cursorIndex >= 0 ? signals.slice(cursorIndex + 1) : signals)
          .map((signal) => ({
            id: signal._id.toString(),
            senderRole: signal.senderRole,
            type: signal.type,
            data: signal.data,
          })),
      });
    }

    const now = new Date();
    const recentClosed = new Date(now.getTime() - CLOSED_TTL_MS);
    const filter = isAdmin
      ? { adminId: session.userId }
      : { targetUserId: session.userId };
    const cameraSessionList = await cameraSessions
      .find({
        ...filter,
        $or: [
          { status: { $in: ACTIVE_STATUSES }, expiresAt: { $gt: now } },
          { status: { $in: ["rejected", "ended"] }, endedAt: { $gt: recentClosed } },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    return sendJson(res, 200, { sessions: cameraSessionList.map(publicSession) });
  }

  if (req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);

  const body = readBody(req);
  const action = body.action;
  const now = new Date();

  if (action === "request") {
    if (!isAdmin) return sendJson(res, 403, { error: "Hanya admin yang dapat meminta akses kamera." });
    if (typeof body.targetUserId !== "string" || !ObjectId.isValid(body.targetUserId)) {
      return sendJson(res, 400, { error: "Akun pengguna tidak valid." });
    }
    const target = await users.findOne(
      { _id: new ObjectId(body.targetUserId) },
      { projection: { username: 1 } },
    );
    if (!target) return sendJson(res, 404, { error: "Akun pengguna tidak ditemukan." });

    const existing = await cameraSessions.findOne({
      $or: [
        { adminId: session.userId, status: { $in: ACTIVE_STATUSES }, expiresAt: { $gt: now } },
        { targetUserId: body.targetUserId, status: { $in: ACTIVE_STATUSES }, expiresAt: { $gt: now } },
      ],
    });
    if (existing) return sendJson(res, 409, { error: "Sudah ada permintaan atau sesi kamera yang masih aktif." });

    const cameraSession = {
      adminId: session.userId,
      targetUserId: body.targetUserId,
      username: target.username,
      status: "requested",
      signals: [],
      createdAt: now,
      expiresAt: new Date(now.getTime() + REQUEST_TTL_MS),
    };
    const result = await cameraSessions.insertOne(cameraSession);
    return sendJson(res, 201, { session: publicSession({ ...cameraSession, _id: result.insertedId }) });
  }

  if (typeof body.sessionId !== "string" || !ObjectId.isValid(body.sessionId)) {
    return sendJson(res, 400, { error: "Sesi kamera tidak valid." });
  }
  const cameraId = new ObjectId(body.sessionId);
  const cameraSession = await cameraSessions.findOne({ _id: cameraId });
  if (!cameraSession) return sendJson(res, 404, { error: "Sesi kamera tidak ditemukan." });
  const isParticipant = (
    (isAdmin && cameraSession.adminId === session.userId) ||
    (!isAdmin && cameraSession.targetUserId === session.userId)
  );
  if (!isParticipant) return sendJson(res, 403, { error: "Anda tidak memiliki akses ke sesi kamera ini." });

  if (action === "accept" || action === "reject") {
    if (isAdmin || cameraSession.status !== "requested" || cameraSession.expiresAt <= now) {
      return sendJson(res, 409, { error: "Permintaan kamera sudah tidak aktif." });
    }
    const status = action === "accept" ? "accepted" : "rejected";
    const result = await cameraSessions.updateOne(
      { _id: cameraId, status: "requested", expiresAt: { $gt: now } },
      {
        $set: {
          status,
          ...(action === "reject" ? { endedAt: now } : {}),
          expiresAt: new Date(now.getTime() + (action === "accept" ? ACTIVE_TTL_MS : CLOSED_TTL_MS)),
        },
      },
    );
    if (!result.modifiedCount) return sendJson(res, 409, { error: "Permintaan kamera sudah tidak aktif." });
    const updated = await cameraSessions.findOne({ _id: cameraId });
    if (updated?.status !== status) return sendJson(res, 409, { error: "Permintaan kamera sudah tidak aktif." });
    return sendJson(res, 200, { session: publicSession(updated) });
  }

  if (action === "stop") {
    await cameraSessions.updateOne(
      { _id: cameraId, status: { $in: ACTIVE_STATUSES } },
      { $set: { status: "ended", endedAt: now, expiresAt: new Date(now.getTime() + CLOSED_TTL_MS) } },
    );
    return sendJson(res, 200, { ok: true });
  }

  if (action === "signal") {
    if (!SIGNAL_TYPES.includes(body.type) || !ACTIVE_STATUSES.includes(cameraSession.status) || cameraSession.expiresAt <= now) {
      return sendJson(res, 409, { error: "Sesi kamera tidak menerima sinyal." });
    }
    if ((body.type === "offer" && !isAdmin) || (body.type === "answer" && isAdmin)) {
      return sendJson(res, 403, { error: "Jenis sinyal tidak diizinkan." });
    }
    let serialized;
    try {
      serialized = JSON.stringify(body.data);
    } catch {
      return sendJson(res, 400, { error: "Data sinyal tidak valid." });
    }
    if (!body.data || typeof body.data !== "object" || serialized.length > 20000) {
      return sendJson(res, 400, { error: "Data sinyal tidak valid." });
    }
    const signal = {
      _id: new ObjectId(),
      senderRole: session.role,
      type: body.type,
      data: body.data,
      createdAt: now,
    };
    const result = await cameraSessions.updateOne(
      { _id: cameraId, status: { $in: ACTIVE_STATUSES }, expiresAt: { $gt: now } },
      {
        $push: { signals: { $each: [signal], $slice: -128 } },
        $set: {
          ...(body.type === "answer" ? { status: "active" } : {}),
          expiresAt: new Date(now.getTime() + ACTIVE_TTL_MS),
        },
      },
    );
    if (!result.modifiedCount) return sendJson(res, 409, { error: "Sesi kamera sudah berakhir." });
    return sendJson(res, 201, { signalId: signal._id.toString() });
  }

  return sendJson(res, 400, { error: "Aksi kamera tidak valid." });
});
