import { readFile } from 'node:fs/promises';
import pg from 'pg';

const { Client } = pg;
const snapshotPath = process.argv[2];
if (!process.env.DATABASE_URL || !snapshotPath) {
  throw new Error('Uso: DATABASE_URL=... node import.mjs <arquivo-de-snapshot>');
}

const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
if (snapshot.format !== 'flowroute-vps-migration-v1' || !Array.isArray(snapshot.users) || !snapshot.state?.data) {
  throw new Error('Snapshot inválido ou incompatível.');
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(`CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL, email TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL, profile_id TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT ''");
  await client.query('CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await client.query('CREATE TABLE IF NOT EXISTS app_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL)');
  await client.query(`CREATE TABLE IF NOT EXISTS work_expense_documents (
    expense_id TEXT PRIMARY KEY, file_name TEXT NOT NULL, content_type TEXT NOT NULL, data BYTEA NOT NULL,
    uploaded_by TEXT NOT NULL REFERENCES app_users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS purchase_documents (
    purchase_id TEXT PRIMARY KEY, file_name TEXT NOT NULL, content_type TEXT NOT NULL, data BYTEA NOT NULL,
    uploaded_by TEXT NOT NULL REFERENCES app_users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const current = await client.query('SELECT (SELECT COUNT(*) FROM app_users)::int AS users, (SELECT COUNT(*) FROM app_state)::int AS states, (SELECT COUNT(*) FROM work_expense_documents)::int AS documents, (SELECT COUNT(*) FROM purchase_documents)::int AS purchase_documents');
  if (current.rows[0].users || current.rows[0].states || current.rows[0].documents || current.rows[0].purchase_documents) {
    throw new Error('O banco de destino já contém dados; importação interrompida para evitar sobrescrita.');
  }

  for (const user of snapshot.users) {
    await client.query(`INSERT INTO app_users (id, name, username, email, password_hash, profile_id, active, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [user.id, user.name, user.username, user.email || '', user.password_hash, user.profile_id, user.active, user.created_at]);
  }
  await client.query('INSERT INTO app_state (id, data, updated_at) VALUES (1, $1, $2)', [JSON.stringify(snapshot.state.data), snapshot.state.updated_at]);
  for (const document of snapshot.documents || []) {
    await client.query(`INSERT INTO work_expense_documents (expense_id, file_name, content_type, data, uploaded_by, updated_at)
      VALUES ($1,$2,$3,decode($4,'base64'),$5,$6)`, [document.expense_id, document.file_name, document.content_type, document.data_base64, document.uploaded_by, document.updated_at]);
  }
  for (const document of snapshot.purchaseDocuments || []) {
    await client.query(`INSERT INTO purchase_documents (purchase_id, file_name, content_type, data, uploaded_by, updated_at)
      VALUES ($1,$2,$3,decode($4,'base64'),$5,$6)`, [document.purchase_id, document.file_name, document.content_type, document.data_base64, document.uploaded_by, document.updated_at]);
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ imported: true, users: snapshot.users.length, stateRows: 1, workExpenseDocuments: (snapshot.documents || []).length, purchaseDocuments: (snapshot.purchaseDocuments || []).length }));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
