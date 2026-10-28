// A tiny PDF writer (no npm package needed) used for payment receipts.
// Supports plain text lines on ONE page with Helvetica / Helvetica-Bold.
// Characters outside basic Latin are replaced with "?" (so we write "Rs", not the rupee sign).

const esc = (text) =>
    String(text)
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

// lines: [{ text, size = 12, bold = false, gap = 6 }]  (printed top to bottom)
// A line with `rule: true` draws a thin grey line instead of text.
function makePdf(lines, { title = "Document" } = {}) {
    let y = 790;
    const ops = [];
    for (const line of lines) {
        const size = line.size || 12;
        if (line.rule) {
            y -= 6;
            ops.push(`0.8 G 50 ${y} m 545 ${y} l S`);
            y -= 12;
            continue;
        }
        ops.push(`BT /${line.bold ? "F2" : "F1"} ${size} Tf 50 ${y} Td (${esc(line.text)}) Tj ET`);
        y -= size + (line.gap === undefined ? 8 : line.gap);
    }
    const stream = ops.join("\n");

    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
        `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
        `<< /Title (${esc(title)}) /Producer (MediConnect) >>`,
    ];

    let out = "%PDF-1.4\n";
    const offsets = [];
    objects.forEach((body, i) => {
        offsets.push(Buffer.byteLength(out, "latin1"));
        out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = Buffer.byteLength(out, "latin1");
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) out += String(off).padStart(10, "0") + " 00000 n \n";
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, "latin1");
}

module.exports = { makePdf };