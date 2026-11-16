import { stat, writeFile } from 'node:fs/promises';
import pg from 'pg';

const { Client } = pg;
const outputPath = process.argv[2];
const tunnelPort = Number(process.argv[3] || 0);
if (!process.env.DATABASE_URL || !outputPath) {
  throw new Error('Uso: node export.mjs <arquivo-de-snapshot> [porta-local-do-túnel]');
}

const connection = new URL(process.env.DATABASE_URL);
const clientOptions = { connectionString: process.env.DATABASE_URL };
if (tunnelPort) {
  connection.hostname = '127.0.0.1';
  connection.port = String(tunnelPort);
  clientOptions.connectionString = connection.toString();
  clientOptions.ssl = { rejectUnauthorized: false };
}
const client = new Client(clientOptions);
await client.connect();
try {
  const users = await client.query(`
    SELECT id, name, username, email, password_hash, profile_id, active, created_at
    FROM app_users ORDER BY created_at, id
  `);
  const state = await client.query('SELECT data, updated_at FROM app_state WHERE id = 1');
  if (!users.rowCount || !state.rowCount) throw new Error('A base de origem não contém usuários e estado do FlowRoute.');

  const documentTable = await client.query("SELECT to_regclass('public.work_expense_documents') AS work_table, to_regclass('public.purchase_documents') AS purchase_table");
  let documents = [];
  let purchaseDocuments = [];
  if (documentTable.rows[0].work_table) {
    const result = await client.query(`
      SELECT expense_id, file_name, content_type, encode(data, 'base64') AS data_base64,
             uploaded_by, updated_at
      FROM work_expense_documents ORDER BY expense_id
    `);
    documents = result.rows;
  }
  if (documentTable.rows[0].purchase_table) {
    const result = await client.query(`
      SELECT purchase_id, file_name, content_type, encode(data, 'base64') AS data_base64,
             uploaded_by, updated_at
      FROM purchase_documents ORDER BY purchase_id
    `);
    purchaseDocuments = result.rows;
  }

  const snapshot = {
    format: 'flowroute-vps-migration-v1',
    exportedAt: new Date().toISOString(),
    users: users.rows,
    state: state.rows[0],
    documents,
    purchaseDocuments
  };
  await writeFile(outputPath, JSON.stringify(snapshot), { mode: 0o600, flag: 'wx' });
  const { size } = await stat(outputPath);
  console.log(JSON.stringify({ exported: true, users: users.rowCount, stateRows: 1, workExpenseDocuments: documents.length, purchaseDocuments: purchaseDocuments.length, bytes: size }));
} finally {
  await client.end();
}
