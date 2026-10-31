import mysql from 'mysql2/promise';
import { settings } from './config.js';
import { readFile } from 'node:fs/promises';

let central;
let admin;
const pools = new Map();
export const quoteIdentifier = (v) => {
  if (!/^[a-z][a-z0-9_]{1,62}$/i.test(v)) throw new Error('Invalid database identifier');
  return `\`${v}\``;
};
export const tenantDatabase = (id) => {
  const value = String(id);
  if (!/^[1-9][0-9]{0,14}$/.test(value)) throw new Error('Invalid tenant id');
  return settings.prefix + value;
};
const options = (database) => ({...settings.mysql, database});
export function centralPool() {
  if (!central) central = mysql.createPool(options(settings.central));
  return central;
}
export function adminPool() {
  if (!admin) admin = mysql.createPool(options(undefined));
  return admin;
}
export function tenantPool(tenantId) {
  const key = String(tenantId);
  if (!pools.has(key)) pools.set(key, mysql.createPool(options(tenantDatabase(key))));
  return pools.get(key);
}
export async function executeSchema(dbName, filename) {
  quoteIdentifier(dbName);
  const sql = await readFile(new URL(`../../database/${filename}`, import.meta.url), 'utf8');
  const connection = await mysql.createConnection({...settings.mysql, database:dbName, multipleStatements:false});
  try {
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await connection.query(stmt);
    }
  } finally { 
    await connection.end(); 
  }
}
export async function closePools() {
  await Promise.all([...(central ? [central.end()] : []), ...(admin ? [admin.end()] : []), ...[...pools.values()].map(x=>x.end())]);
  central = undefined;admin=undefined;pools.clear();
}
