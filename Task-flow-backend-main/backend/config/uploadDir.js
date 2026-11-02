const path = require("path");
const fs = require("fs");
const os = require("os");

// Single absolute uploads directory shared by multer and express.static.
// Priority: UPLOAD_DIR env -> on the live Linux server, ~/taskflow_uploads (outside the deploy
// folder, so redeploys don't wipe uploaded files) -> locally (Windows), backend/uploads.
const defaultDir = process.platform === "win32"
  ? path.join(__dirname, "../uploads")
  : path.join(os.homedir(), "taskflow_uploads");

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || defaultDir);

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

console.log(`📁 Uploads directory: ${UPLOAD_DIR}`);

module.exports = UPLOAD_DIR;
