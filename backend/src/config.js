import 'dotenv/config';

export const settings = {
  host: process.env.BACKEND_HOST || '127.0.0.1',
  port: Number(process.env.BACKEND_PORT || 5100),
  origin: process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5174',
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || '',
    password: process.env.MYSQL_PASSWORD || '',
    timezone: 'Z',
    dateStrings: true,
    decimalNumbers: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
    connectionLimit: 8,
    waitForConnections: true,
    ssl: {
      rejectUnauthorized: false
    }
  },
  central: process.env.CENTRAL_DB || 'tpos_v2_central',
  prefix: process.env.TENANT_DB_PREFIX || 'tpos_v2_tenant_',
  sessionHours: Math.min(24, Math.max(1, Number(process.env.SESSION_HOURS || 12))),
  registrationAccessKey: process.env.REGISTRATION_ACCESS_KEY || ''
};

export function assertConfig() {
  if (!/^[a-z][a-z0-9_]{4,60}$/i.test(settings.central)) throw new Error('Invalid CENTRAL_DB');
  if (!/^[a-z][a-z0-9_]{4,60}$/i.test(settings.prefix)) throw new Error('Invalid TENANT_DB_PREFIX');
  if (!settings.mysql.user || settings.mysql.user.includes('CHANGE_ME') || settings.mysql.password.includes('CHANGE_ME')) {
    throw new Error('Set real MYSQL_USER and MYSQL_PASSWORD in the NEW backend/.env file');
  }
  if (!Number.isInteger(settings.port) || settings.port < 1024 || settings.port > 65535) throw new Error('Invalid BACKEND_PORT');
  if (!Number.isInteger(settings.sessionHours)) throw new Error('Invalid SESSION_HOURS');
}
