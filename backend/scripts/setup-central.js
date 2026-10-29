import { settings, assertConfig } from '../src/config.js';
import { adminPool, executeSchema, quoteIdentifier, closePools } from '../src/database.js';
try {
 assertConfig();
 console.log(`Creating NEW central database: ${settings.central}`);
 await adminPool().query(`CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(settings.central)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
 await executeSchema(settings.central,'001_central.sql');
 console.log('CENTRAL_SCHEMA_READY');
} catch(error) {console.error('SETUP_FAILED:',error.message);process.exitCode=1;}
finally {await closePools();}
