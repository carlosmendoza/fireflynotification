const express = require('express');
const { pool, init } = require('./db');

const app = express();
app.use(express.json());

function validar(body) {
  const { texto, fecha } = body;
  if (typeof texto !== 'string' || texto.trim() === '') {
    return 'texto requerido (string no vacío)';
  }
  if (!fecha || isNaN(Date.parse(fecha))) {
    return 'fecha requerida (formato ISO válido, ej. 2026-09-12)';
  }
  return null;
}

// GET /items - listar todos
app.get('/items', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM items ORDER BY fecha DESC');
  res.json(rows);
});

// GET /items/:id - uno solo
app.get('/items/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM items WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'no encontrado' });
  res.json(rows[0]);
});

// POST /items - crear
app.post('/items', async (req, res) => {
  const err = validar(req.body);
  if (err) return res.status(400).json({ error: err });

  const { rows } = await pool.query(
    'INSERT INTO items (texto, fecha) VALUES ($1, $2) RETURNING *',
    [req.body.texto, req.body.fecha]
  );
  res.status(201).json(rows[0]);
});

// PUT /items/:id - actualizar
app.put('/items/:id', async (req, res) => {
  const err = validar(req.body);
  if (err) return res.status(400).json({ error: err });

  const { rows } = await pool.query(
    'UPDATE items SET texto = $1, fecha = $2 WHERE id = $3 RETURNING *',
    [req.body.texto, req.body.fecha, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'no encontrado' });
  res.json(rows[0]);
});

// DELETE /items/:id - borrar
app.delete('/items/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM items WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'no encontrado' });
  res.status(204).send();
});

// health check pa' coolify
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;

init()
  .then(() => {
    app.listen(PORT, () => console.log(`API corriendo en http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error('error inicializando DB:', e);
    process.exit(1);
  });
