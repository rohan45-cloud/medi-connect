// Helpers for small uploaded files (reports, certificates).
// We never trust the file name or the Content-Type the browser sends:
// the real type is read from the first bytes of the file.

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];

// Returns "application/pdf" | "image/png" | "image/jpeg" | null
function sniffType(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 8) return null;
    if (buf.slice(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
    return null;
}

const EXTENSION = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg" };

// A safe display name: letters, digits, space . _ - only, max 80 chars, correct extension.
function cleanName(raw, mime) {
    let name = "file";
    try {
        name = decodeURIComponent(String(raw || "file"));
    } catch {
        name = String(raw || "file");
    }
    name = name.replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/[^A-Za-z0-9 ._-]/g, "_").trim().slice(0, 80) || "file";
    return name + EXTENSION[mime];
}

// Reads an upload sent as the raw request body (express.raw). Returns { error } or { buf, mime, name }.
function readUpload(req) {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
        return { error: "Please choose a PDF, PNG or JPG file." };
    }
    if (buf.length > MAX_FILE_BYTES) return { error: "That file is too large (maximum 2 MB)." };
    const mime = sniffType(buf);
    if (!mime) return { error: "Only PDF, PNG and JPG files are allowed." };
    return { buf, mime, name: cleanName(req.headers["x-file-name"], mime) };
}

module.exports = { MAX_FILE_BYTES, ALLOWED_TYPES, sniffType, readUpload, cleanName };