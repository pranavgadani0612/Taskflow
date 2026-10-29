const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { pool } = require("../config/mysqlDb");

// Helper: parse JSON safely
function safeJson(val, defaultVal = []) {
  if (!val) return defaultVal;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch (e) {
    return defaultVal;
  }
}

// Helper: format conversation row with staff objects
async function populateConversations(convRows) {
  if (!convRows || convRows.length === 0) return [];
  const [staffRows] = await pool.query("SELECT id, name, email, image, position FROM staff");
  const staffMap = new Map();
  staffRows.forEach((s) => {
    staffMap.set(s.id, { _id: s.id, id: s.id, name: s.name, email: s.email, image: s.image || "", position: s.position || "Staff" });
  });

  return convRows.map((c) => {
    const participantIds = safeJson(c.participants, []);
    const participants = participantIds.map((pid) => staffMap.get(pid) || { _id: pid, id: pid, name: "User", email: "" });
    const createdBy = staffMap.get(c.created_by) || { _id: c.created_by, id: c.created_by, name: "User" };

    return {
      _id: c.id,
      id: c.id,
      type: c.type || "direct",
      name: c.name || "",
      participants,
      clientParticipants: safeJson(c.client_participants, []),
      createdBy,
      lastMessage: safeJson(c.last_message, null),
      isArchived: Boolean(c.is_archived),
      createdAt: c.created_at,
      updatedAt: c.updated_at
    };
  });
}

// ═══════════════════════════════════════════
//  CONVERSATIONS
// ═══════════════════════════════════════════

// GET /api/chat/conversations — list current user's conversations
router.get("/conversations", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id.toString();

    const [rows] = await pool.query(
      `SELECT * FROM chat_conversations 
       WHERE is_archived = 0 
       ORDER BY updated_at DESC`
    );

    // Filter conversations where user is a participant
    const userConvs = rows.filter((c) => {
      const parts = safeJson(c.participants, []);
      return parts.includes(userId);
    });

    const populated = await populateConversations(userConvs);
    res.json(populated);
  } catch (err) {
    console.error("GET /conversations error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/chat/conversations/direct — start or get 1-to-1 conversation
router.post("/conversations/direct", authMiddleware, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const userId = req.user._id ? req.user._id.toString() : req.user.id.toString();

    if (!targetUserId) return res.status(400).json({ message: "targetUserId required" });
    if (targetUserId.toString() === userId) {
      return res.status(400).json({ message: "Cannot chat with yourself" });
    }

    const [rows] = await pool.query("SELECT * FROM chat_conversations WHERE type = 'direct'");
    let existing = rows.find((c) => {
      const parts = safeJson(c.participants, []);
      return parts.length === 2 && parts.includes(userId) && parts.includes(targetUserId.toString());
    });

    if (!existing) {
      const id = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const participants = JSON.stringify([userId, targetUserId.toString()]);
      await pool.query(
        `INSERT INTO chat_conversations (id, type, participants, created_by, company_id)
         VALUES (?, 'direct', ?, ?, ?)`,
        [id, participants, userId, req.user.companyId?._id || req.user.companyId || "default_company"]
      );
      const [newRows] = await pool.query("SELECT * FROM chat_conversations WHERE id = ?", [id]);
      existing = newRows[0];
    }

    const [populated] = await populateConversations([existing]);
    res.json(populated);
  } catch (err) {
    console.error("POST /conversations/direct error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/chat/conversations/group — create group conversation
router.post("/conversations/group", authMiddleware, async (req, res) => {
  try {
    const { name, participantIds, clientParticipants } = req.body;
    const userId = req.user._id ? req.user._id.toString() : req.user.id.toString();

    const allParticipants = [
      userId,
      ...(participantIds || []).map((id) => id.toString()).filter((id) => id !== userId),
    ];

    // Format client participants with IDs if missing
    const clients = Array.isArray(clientParticipants)
      ? clientParticipants.map((cp) => ({
          _id: cp._id || cp.id || `cli_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          id: cp._id || cp.id || `cli_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: cp.name || "Client",
          email: cp.email || ""
        }))
      : [];

    const id = `conv_grp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    await pool.query(
      `INSERT INTO chat_conversations (id, type, name, participants, client_participants, created_by, company_id)
       VALUES (?, 'group', ?, ?, ?, ?, ?)`,
      [id, name || "Group Chat", JSON.stringify(allParticipants), JSON.stringify(clients), userId, req.user.companyId?._id || req.user.companyId || "default_company"]
    );

    const [rows] = await pool.query("SELECT * FROM chat_conversations WHERE id = ?", [id]);
    const [populated] = await populateConversations(rows);
    res.status(201).json(populated);
  } catch (err) {
    console.error("POST /conversations/group error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/chat/conversations/:id/add-client — Add client to group conversation
router.put("/conversations/:id/add-client", authMiddleware, async (req, res) => {
  try {
    const convId = req.params.id;
    const { name, email, clientId } = req.body;

    if (!name && !email && !clientId) {
      return res.status(400).json({ message: "Client name and email required" });
    }

    const [rows] = await pool.query("SELECT * FROM chat_conversations WHERE id = ?", [convId]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const conv = rows[0];
    const clients = safeJson(conv.client_participants, []);

    // Check if client with email already exists
    const exists = clients.some(
      (c) => c.email && email && c.email.toLowerCase() === email.toLowerCase()
    );
    if (exists) {
      return res.status(400).json({ message: "Client already added to conversation" });
    }

    const newClient = {
      _id: clientId || `cli_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      id: clientId || `cli_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: name ? name.trim() : "Client",
      email: email ? email.trim() : ""
    };

    clients.push(newClient);

    await pool.query(
      "UPDATE chat_conversations SET client_participants = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [JSON.stringify(clients), convId]
    );

    const [updatedRows] = await pool.query("SELECT * FROM chat_conversations WHERE id = ?", [convId]);
    const [populated] = await populateConversations(updatedRows);
    res.json(populated);
  } catch (err) {
    console.error("PUT /conversations/:id/add-client error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/chat/conversations/:id/remove-client — Remove client from conversation
router.put("/conversations/:id/remove-client", authMiddleware, async (req, res) => {
  try {
    const convId = req.params.id;
    const { clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({ message: "clientId required" });
    }

    const [rows] = await pool.query("SELECT * FROM chat_conversations WHERE id = ?", [convId]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const conv = rows[0];
    const clients = safeJson(conv.client_participants, []);

    // Filter out client by ID or email
    const updatedClients = clients.filter(
      (c) => c._id !== clientId && c.id !== clientId && c.email !== clientId
    );

    await pool.query(
      "UPDATE chat_conversations SET client_participants = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [JSON.stringify(updatedClients), convId]
    );

    const [updatedRows] = await pool.query("SELECT * FROM chat_conversations WHERE id = ?", [convId]);
    const [populated] = await populateConversations(updatedRows);
    res.json(populated);
  } catch (err) {
    console.error("PUT /conversations/:id/remove-client error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/chat/conversations/:id/messages
router.get("/conversations/:id/messages", authMiddleware, async (req, res) => {
  try {
    const convId = req.params.id;
    const userId = req.user._id ? req.user._id.toString() : req.user.id.toString();

    // Mark all messages in this conversation as read by this user
    try {
      const [unreadMsgs] = await pool.query(
        `SELECT id, read_by FROM chat_messages WHERE conversation_id = ?`,
        [convId]
      );
      for (const m of unreadMsgs) {
        const readList = safeJson(m.read_by, []);
        if (!readList.includes(userId)) {
          readList.push(userId);
          await pool.query(
            `UPDATE chat_messages SET read_by = ? WHERE id = ?`,
            [JSON.stringify(readList), m.id]
          );
        }
      }
    } catch (markErr) {
      console.error("Error marking messages as read:", markErr);
    }

    const [messages] = await pool.query(
      `SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC`,
      [convId]
    );

    const formatted = messages.map((m) => ({
      _id: m.id,
      id: m.id,
      conversationId: m.conversation_id,
      sender: {
        _id: m.sender_id,
        id: m.sender_id,
        name: m.sender_name || "User",
        image: m.sender_image || ""
      },
      senderName: m.sender_name,
      senderImage: m.sender_image,
      text: m.text,
      fileUrl: m.file_url,
      fileName: m.file_name,
      readBy: safeJson(m.read_by, []),
      createdAt: m.created_at
    }));

    res.json(formatted);
  } catch (err) {
    console.error("GET /messages error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/chat/conversations/:id/read - explicitly mark conversation as read
router.put("/conversations/:id/read", authMiddleware, async (req, res) => {
  try {
    const convId = req.params.id;
    const userId = req.user._id ? req.user._id.toString() : req.user.id.toString();

    const [unreadMsgs] = await pool.query(
      `SELECT id, read_by FROM chat_messages WHERE conversation_id = ?`,
      [convId]
    );
    for (const m of unreadMsgs) {
      const readList = safeJson(m.read_by, []);
      if (!readList.includes(userId)) {
        readList.push(userId);
        await pool.query(
          `UPDATE chat_messages SET read_by = ? WHERE id = ?`,
          [JSON.stringify(readList), m.id]
        );
      }
    }

    res.json({ success: true, conversationId: convId });
  } catch (err) {
    console.error("PUT /conversations/:id/read error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/chat/conversations/:id/messages
router.post("/conversations/:id/messages", authMiddleware, async (req, res) => {
  try {
    const { text, fileUrl, fileName } = req.body;
    const convId = req.params.id;
    const userId = req.user._id ? req.user._id.toString() : req.user.id.toString();
    const userName = req.user.name || "User";
    const userImage = req.user.image || "";

    const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const readBy = JSON.stringify([userId]);

    await pool.query(
      `INSERT INTO chat_messages (id, conversation_id, sender_id, sender_name, sender_image, text, file_url, file_name, read_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, convId, userId, userName, userImage, text || "", fileUrl || null, fileName || null, readBy]
    );

    const lastMsg = JSON.stringify({
      text: text || "",
      senderId: userId,
      senderName: userName,
      sentAt: new Date()
    });

    await pool.query(
      `UPDATE chat_conversations SET last_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [lastMsg, convId]
    );

    const msgObj = {
      _id: id,
      id,
      conversationId: convId,
      sender: { _id: userId, id: userId, name: userName, image: userImage },
      senderName: userName,
      senderImage: userImage,
      text: text || "",
      fileUrl,
      fileName,
      readBy: [userId],
      createdAt: new Date()
    };

    const io = req.app.get("io");
    if (io) {
      io.to(`conv_${convId}`).emit("new_message", msgObj);

      // Notify conversation participants personally
      const [convRows] = await pool.query("SELECT participants FROM chat_conversations WHERE id = ?", [convId]);
      if (convRows.length > 0) {
        let pList = [];
        try {
          pList = typeof convRows[0].participants === "string" ? JSON.parse(convRows[0].participants) : (convRows[0].participants || []);
        } catch(e) {}
        pList.forEach(pId => {
          if (pId && pId.toString() !== userId.toString()) {
            io.to(`user_${pId}`).emit("chat_notification", {
              conversationId: convId,
              message: msgObj,
              senderName: userName || "Someone",
              text: text || "Sent an attachment"
            });
          }
        });
      }

      io.emit(`conv_updated_${convId}`, { conversationId: convId, lastMessage: JSON.parse(lastMsg) });
    }

    res.status(201).json(msgObj);
  } catch (err) {
    console.error("POST /messages error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/chat/staff — list all active staff for starting conversations
router.get("/staff", authMiddleware, async (req, res) => {
  try {
    const [staff] = await pool.query(
      `SELECT s.id as _id, s.id, s.name, s.email, s.image, s.position,
              r.id as role_id, r.name as role_name
       FROM staff s
       LEFT JOIN roles r ON s.role = r.id OR s.role = r.name
       WHERE s.status = 'Active'
       ORDER BY s.name ASC`
    );

    const formatted = staff.map((s) => ({
      _id: s.id,
      id: s.id,
      name: s.name,
      email: s.email,
      image: s.image || "",
      position: s.position || "Staff",
      role: { _id: s.role_id || "role_staff", name: s.role_name || "Staff" }
    }));

    res.json(formatted);
  } catch (err) {
    console.error("GET /chat/staff error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/chat/unread-counts
router.get("/unread-counts", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id.toString();

    const [convs] = await pool.query("SELECT id, participants FROM chat_conversations WHERE is_archived = 0");
    const userConvIds = convs
      .filter((c) => safeJson(c.participants, []).includes(userId))
      .map((c) => c.id);

    const counts = {};
    for (const cid of userConvIds) {
      counts[cid] = 0;
    }

    if (userConvIds.length > 0) {
      const [msgs] = await pool.query(
        `SELECT conversation_id, read_by FROM chat_messages WHERE conversation_id IN (${userConvIds.map(() => "?").join(",")})`,
        userConvIds
      );
      msgs.forEach((m) => {
        const readList = safeJson(m.read_by, []);
        if (!readList.includes(userId)) {
          counts[m.conversation_id] = (counts[m.conversation_id] || 0) + 1;
        }
      });
    }

    res.json(counts);
  } catch (err) {
    console.error("GET /unread-counts error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
