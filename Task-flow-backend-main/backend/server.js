process.env.TZ = process.env.TZ || "Asia/Kolkata";
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config({ path: path.join(__dirname, "../.env.example") });
require("dotenv").config({ path: path.join(__dirname, ".env.example") });
require("dotenv").config({ path: path.join(process.cwd(), ".env") });
require("dotenv").config({ path: path.join(process.cwd(), ".env.example") });
require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
mongoose.set("bufferCommands", false);
const cors = require("cors");
const cookieParser = require("cookie-parser");

const createSuperAdmin = require("./config/superAdmin");
const seedDefaults = require("./config/seedPermissions");

const authRoutes = require("./routes/authRoutes");
const staffRoutes = require("./routes/staffRoutes");
const taskRoutes = require("./routes/taskRoutes");
const roleRoutes = require("./routes/roleRoutes");
const taskStatusRoutes = require("./routes/taskStatusRoutes");
const permissionRoutes = require("./routes/permissionRoutes");
const projectRoutes = require("./routes/projectRoutes");
const documentRoutes = require("./routes/documentRoutes");
const companyRoutes = require("./routes/companyRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const chatRoutes = require("./routes/chatRoutes");
const clientRoutes = require("./routes/clientRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const qaRoutes = require("./routes/qaRoutes");
const leaveRoutes = require("./routes/leaveRoutes");
const ratingRoutes = require("./routes/ratingRoutes");
const breakRoutes = require("./routes/breakRoutes");
const Message = require("./models/Message");
const Conversation = require("./models/Conversation");
const { checkPermission, checkAnyPermission, getUserPermissions } = require("./middleware/permissions");
const authMiddleware = require("./middleware/auth");

const app = express();
const server = http.createServer(app);

// ======== SOCKET.IO SETUP ========
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for the Vite frontend
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

// Make io accessible in routes/controllers via req.io
app.set("io", io);

io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);

  // ── Register user for direct global notifications ──
  socket.on("register_user", (userId) => {
    if (userId) {
      socket.join(`user_${userId}`);
    }
  });

  // ── Chat: join a conversation room ──
  socket.on("join_conversation", (conversationId) => {
    socket.join(`conv_${conversationId}`);
  });

  // ── Chat: leave a conversation room ──
  socket.on("leave_conversation", (conversationId) => {
    socket.leave(`conv_${conversationId}`);
  });

  // ── Chat: send message via socket ──
  socket.on("send_message", async (data) => {
    try {
      const { conversationId, text, senderId, senderName, senderImage } = data;
      if (!conversationId || !text || !senderId) return;

      const { pool } = require("./config/mysqlDb");
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const readBy = JSON.stringify([senderId]);

      await pool.query(
        `INSERT INTO chat_messages (id, conversation_id, sender_id, sender_name, sender_image, text, read_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [msgId, conversationId, senderId, senderName || "", senderImage || "", text, readBy]
      );

      const lastMsg = JSON.stringify({
        text,
        senderId,
        senderName: senderName || "",
        sentAt: new Date()
      });

      await pool.query(
        `UPDATE chat_conversations SET last_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [lastMsg, conversationId]
      );

      const msg = {
        _id: msgId,
        id: msgId,
        conversationId,
        sender: { _id: senderId, id: senderId, name: senderName || "", image: senderImage || "" },
        senderName: senderName || "",
        senderImage: senderImage || "",
        text,
        readBy: [senderId],
        createdAt: new Date()
      };

      // Emit to all in room including sender
      io.to(`conv_${conversationId}`).emit("new_message", msg);
      
      // Notify conversation participants personally (for global notification & unread badge)
      const [convRows] = await pool.query("SELECT participants FROM chat_conversations WHERE id = ?", [conversationId]);
      if (convRows.length > 0) {
        let pList = [];
        try {
          pList = typeof convRows[0].participants === "string" ? JSON.parse(convRows[0].participants) : (convRows[0].participants || []);
        } catch(e) {}
        pList.forEach(pId => {
          if (pId && pId.toString() !== senderId.toString()) {
            io.to(`user_${pId}`).emit("chat_notification", {
              conversationId,
              message: msg,
              senderName: senderName || "Someone",
              text: text
            });
          }
        });
      }

      // Also notify all company members for sidebar unread badge
      io.emit(`conv_updated_${conversationId}`, {
        conversationId,
        lastMessage: { text, senderName, sentAt: new Date() },
      });
    } catch (err) {
      console.error("Socket send_message error:", err);
    }
  });

  // ── Chat: mark conversation as read ──
  socket.on("mark_as_read", async ({ conversationId, userId }) => {
    try {
      if (!conversationId || !userId) return;
      const { pool } = require("./config/mysqlDb");
      const [unreadMsgs] = await pool.query(
        `SELECT id, read_by FROM chat_messages WHERE conversation_id = ?`,
        [conversationId]
      );
      for (const m of unreadMsgs) {
        let readList = [];
        try {
          readList = typeof m.read_by === "string" ? JSON.parse(m.read_by) : (m.read_by || []);
        } catch(e) {}
        if (!readList.map(String).includes(String(userId))) {
          readList.push(String(userId));
          await pool.query(
            `UPDATE chat_messages SET read_by = ? WHERE id = ?`,
            [JSON.stringify(readList), m.id]
          );
        }
      }
      socket.emit("conversation_marked_read", { conversationId });
    } catch (err) {
      console.error("Socket mark_as_read error:", err);
    }
  });

  // ── Chat: typing indicator ──
  socket.on("typing", ({ conversationId, userName, isTyping }) => {
    socket.to(`conv_${conversationId}`).emit("user_typing", { userName, isTyping });
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

// middleware
app.use(cors({
  origin: true, // Allow any origin that makes the request
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());

// Static uploads
app.use("/uploads", express.static("uploads"));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/task-status", taskStatusRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/qa", qaRoutes);
app.use("/api/leave", leaveRoutes);
app.use("/api/ratings", ratingRoutes);
app.use("/api/breaks", breakRoutes);
app.use("/api/timesheets", require("./routes/timesheetRoutes"));
app.use("/api/tickets", require("./routes/ticketRoutes"));
const expenseRoutes = require("./routes/expenseRoutes");
app.use("/api/expenses", expenseRoutes);
app.use("/api/expense-categories", (req, res, next) => {
  req.url = "/categories" + (req.url === "/" ? "" : req.url);
  expenseRoutes(req, res, next);
});
app.use("/api/holidays", require("./routes/holidayRoutes"));
app.use("/api/announcements", require("./routes/announcementRoutes"));
app.use("/api/wfh", require("./routes/wfhRoutes"));
app.use("/api/audit-logs", require("./routes/auditRoutes"));
// Phase 2 Routes
app.use("/api/assets", require("./routes/assetRoutes"));
app.use("/api/payroll", require("./routes/payrollRoutes"));
app.use("/api/allocations", require("./routes/allocationRoutes"));
app.use("/api/client-reports", require("./routes/clientReportRoutes"));
app.use("/api/overtime", require("./routes/overtimeRoutes"));


// Get current user permissions
app.get("/api/user-permissions", authMiddleware, getUserPermissions);



// Serve frontend build if present in public or dist
const possibleDistPaths = [
  path.join(__dirname, "../public"),
  path.join(__dirname, "public"),
  path.join(__dirname, "dist"),
  path.join(__dirname, "../frontend/dist"),
  path.join(__dirname, "../task-flow-frontend-main/dist"),
  path.join(__dirname, "../Task-Flow-frontend-main/dist"),
];  

let activeDistPath = null;
for (const p of possibleDistPaths) {
  if (fs.existsSync(path.join(p, "index.html"))) {
    activeDistPath = p;
    break;
  }
}

if (activeDistPath) {
  app.use("/assets", express.static(path.join(activeDistPath, "assets")));
  app.use(express.static(activeDistPath));
  app.use("/assets", express.static(path.join(__dirname, "../assets")));
  app.use(express.static(path.join(__dirname, "..")));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads") || req.path.startsWith("/socket.io")) {
      return next();
    }
    res.sendFile(path.join(activeDistPath, "index.html"));
  });
}
// 404 Handler for API endpoints (B30)
app.use("/api", (req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.originalUrl} - Endpoint not found` });
});


// Connect Databases
const { initDB } = require("./config/mysqlDb");
const seedMySQLDefaults = require("./config/seedMySQLDefaults");
const seedDummyData = require("./seedData");

// Start server with dynamic port FIRST so IIS/iisnode gets connection immediately
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT} with Socket.io & Pure MySQL (taskflow_db) ⚡`);
  try {
    await initDB();
    await seedMySQLDefaults();
    console.log("✅ Pure MySQL (taskflow_db) connected successfully!");
  } catch (err) {
    console.error("⚠️ MySQL Connection Notice:", err.message);
  }
});