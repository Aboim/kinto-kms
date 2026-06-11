import express from 'express';
import cors from 'cors';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// API Key - generate on first run, reuse afterwards
const KEY_FILE = path.join(__dirname, '.api-key');

function getOrCreateApiKey() {
  if (fs.existsSync(KEY_FILE)) {
    return fs.readFileSync(KEY_FILE, 'utf-8').trim();
  }
  const key = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(KEY_FILE, key, 'utf-8');
  console.log('Generated new API key');
  return key;
}

const API_KEY = getOrCreateApiKey();

// Auth middleware - skip for local dev (Vite on localhost)
app.use((req, res, next) => {
  const origin = req.headers.origin || req.headers.referer || '';
  const isLocalDev = origin.includes('localhost:5173') || origin.includes('127.0.0.1:5173');
  if (isLocalDev) return next();
  const providedKey = req.headers['x-api-key'];
  if (!providedKey || providedKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

const db = new DatabaseSync('database.db');
db.exec('PRAGMA foreign_keys = ON;');

// Inicializar as tabelas automaticamente se não existirem
db.exec(`
  CREATE TABLE IF NOT EXISTS contracts (
    plate TEXT PRIMARY KEY,
    start_date TEXT NOT NULL,
    duration INTEGER NOT NULL,
    limit_km INTEGER NOT NULL,
    max_limit_km INTEGER NOT NULL,
    cost_per_km REAL NOT NULL
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS mileage (
    id TEXT PRIMARY KEY,
    plate TEXT NOT NULL,
    date TEXT NOT NULL,
    kms REAL NOT NULL,
    FOREIGN KEY(plate) REFERENCES contracts(plate) ON DELETE CASCADE
  )
`);


// Rota para obter todos os contratos
app.get('/api/contracts', (req, res) => {
  const stmt = db.prepare('SELECT * FROM contracts');
  const contracts = stmt.all();
  res.json(contracts);
});

// Rota para obter contrato específico
app.get('/api/contracts/:plate', (req, res) => {
  const stmt = db.prepare('SELECT * FROM contracts WHERE plate = ?');
  const contract = stmt.get(req.params.plate);
  if (contract) {
    res.json(contract);
  } else {
    res.status(404).json({ error: 'Contrato não encontrado' });
  }
});

// Rota para criar ou atualizar contrato
app.post('/api/contracts', (req, res) => {
  const { oldPlate, plate, startDate, duration, limit, maxLimit, costPerKm } = req.body;

  if (!plate || !startDate || typeof duration !== 'number' || typeof limit !== 'number' || typeof maxLimit !== 'number' || typeof costPerKm !== 'number') {
    return res.status(400).json({ error: 'Dados inválidos. Verifique os campos e certifique-se que são números.' });
  }
  if (duration <= 0 || limit <= 0) {
    return res.status(400).json({ error: 'Duração e limites devem ser maiores que zero.' });
  }

  try {
    if (oldPlate && oldPlate !== plate) {
      // Desativar temporariamente foreign keys
      db.exec('PRAGMA foreign_keys = OFF;');
      
      // Verificar se a nova matrícula já existe
      const exists = db.prepare('SELECT 1 FROM contracts WHERE plate = ?').get(plate);
      
      if (exists) {
        // Se já existe, movemos todo o histórico da velha para a nova
        const stmtMerge = db.prepare('UPDATE mileage SET plate = ? WHERE plate = ?');
        stmtMerge.run(plate, oldPlate);
        
        // E apagamos a velha
        const stmtDel = db.prepare('DELETE FROM contracts WHERE plate = ?');
        stmtDel.run(oldPlate);
        
        // E atualizamos as configurações da nova
        const stmtUpd = db.prepare('UPDATE contracts SET start_date = ?, duration = ?, limit_km = ?, max_limit_km = ?, cost_per_km = ? WHERE plate = ?');
        stmtUpd.run(startDate, duration, limit, maxLimit, costPerKm, plate);
      } else {
        // Se não existe, atualizamos a matrícula do contrato e do histórico
        const stmt1 = db.prepare('UPDATE contracts SET plate = ?, start_date = ?, duration = ?, limit_km = ?, max_limit_km = ?, cost_per_km = ? WHERE plate = ?');
        stmt1.run(plate, startDate, duration, limit, maxLimit, costPerKm, oldPlate);
        
        const stmt2 = db.prepare('UPDATE mileage SET plate = ? WHERE plate = ?');
        stmt2.run(plate, oldPlate);
      }
      
      // Reativar foreign keys
      db.exec('PRAGMA foreign_keys = ON;');
    } else {
      const stmt = db.prepare(`
        INSERT INTO contracts (plate, start_date, duration, limit_km, max_limit_km, cost_per_km)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(plate) DO UPDATE SET
          start_date = excluded.start_date,
          duration = excluded.duration,
          limit_km = excluded.limit_km,
          max_limit_km = excluded.max_limit_km,
          cost_per_km = excluded.cost_per_km
      `);
      stmt.run(plate, startDate, duration, limit, maxLimit, costPerKm);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Rota para apagar contrato e sua quilometragem
app.delete('/api/contracts/:plate', (req, res) => {
  const stmt = db.prepare('DELETE FROM contracts WHERE plate = ?');
  stmt.run(req.params.plate);
  res.json({ success: true });
});

// Rota para obter quilometragem de uma viatura
app.get('/api/mileage/:plate', (req, res) => {
  const stmt = db.prepare('SELECT * FROM mileage WHERE plate = ? ORDER BY date DESC');
  const mileage = stmt.all(req.params.plate);
  res.json(mileage);
});

// Rota para adicionar registo de quilometragem
app.post('/api/mileage', (req, res) => {
  const { id, plate, date, kms } = req.body;

  if (!id || !plate || !date || typeof kms !== 'number' || kms < 0) {
    return res.status(400).json({ error: 'Dados inválidos. A data e os KMS são obrigatórios e devem ser positivos.' });
  }

  const stmt = db.prepare('INSERT INTO mileage (id, plate, date, kms) VALUES (?, ?, ?, ?)');
  try {
    stmt.run(id, plate, date, kms);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Rota para atualizar registo de quilometragem
app.put('/api/mileage/:id', (req, res) => {
  const { date, kms } = req.body;

  if (!date || typeof kms !== 'number' || kms < 0) {
    return res.status(400).json({ error: 'Dados inválidos. A data e os KMS são obrigatórios e devem ser positivos.' });
  }
  const stmt = db.prepare('UPDATE mileage SET date = ?, kms = ? WHERE id = ?');
  stmt.run(date, kms, req.params.id);
  res.json({ success: true });
});

// Rota para apagar todos os registos de uma viatura
app.delete('/api/mileage/plate/:plate', (req, res) => {
  const stmt = db.prepare('DELETE FROM mileage WHERE plate = ?');
  stmt.run(req.params.plate);
  res.json({ success: true });
});

// Rota para apagar registo de quilometragem
app.delete('/api/mileage/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM mileage WHERE id = ?');
  stmt.run(req.params.id);
  res.json({ success: true });
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// All mileage (for sync)
app.get('/api/mileage', (_req, res) => {
  const stmt = db.prepare('SELECT * FROM mileage ORDER BY date DESC');
  const mileage = stmt.all();
  res.json(mileage);
});

const PORT = 3001;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});
