const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { pool } = require('./db');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// tipos permitidos: audio, video, imagen, documentos comunes (como media de whatsapp)
const MIME_PERMITIDOS = /^(audio|video|image)\//;
const DOC_PERMITIDOS = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'text/plain',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const MAX_MB = parseInt(process.env.MAX_UPLOAD_MB || '100', 10);

const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (MIME_PERMITIDOS.test(file.mimetype) || DOC_PERMITIDOS.has(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error(`tipo de archivo no permitido: ${file.mimetype}`));
  },
});

const router = express.Router();

// POST /files - subir archivo (multipart, campo "file")
router.post('/files', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'archivo requerido (campo "file")' });

    const { rows } = await pool.query(
      `INSERT INTO files (nombre_original, nombre_disco, mimetype, tamano)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.file.originalname, req.file.filename, req.file.mimetype, req.file.size]
    );
    res.status(201).json(rowAUrl(rows[0], req));
  });
});

// GET /files - listar metadata
router.get('/files', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM files ORDER BY creado_en DESC');
  res.json(rows.map((r) => rowAUrl(r, req)));
});

// GET /files/:id - metadata de uno
router.get('/files/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM files WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'no encontrado' });
  res.json(rowAUrl(rows[0], req));
});

// GET /files/:id/download - descargar/streamear el archivo real
router.get('/files/:id/download', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM files WHERE id = $1', [req.params.id]);
  const file = rows[0];
  if (!file) return res.status(404).json({ error: 'no encontrado' });

  const filePath = path.join(UPLOAD_DIR, file.nombre_disco);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'archivo no existe en disco' });

  res.setHeader('Content-Type', file.mimetype);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.nombre_original)}"`);
  fs.createReadStream(filePath).pipe(res);
});

// DELETE /files/:id - borrar archivo + registro
router.delete('/files/:id', async (req, res) => {
  const { rows } = await pool.query('DELETE FROM files WHERE id = $1 RETURNING *', [req.params.id]);
  const file = rows[0];
  if (!file) return res.status(404).json({ error: 'no encontrado' });

  const filePath = path.join(UPLOAD_DIR, file.nombre_disco);
  fs.unlink(filePath, () => {});
  res.status(204).send();
});

function rowAUrl(row, req) {
  return {
    ...row,
    url: `${req.protocol}://${req.get('host')}/files/${row.id}/download`,
  };
}

module.exports = router;
