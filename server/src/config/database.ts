import knex, { Knex } from 'knex';
import { env } from './env';

const config: Knex.Config = {
  client: 'mysql2',
  connection: {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    charset: 'utf8mb4',
    timezone: '+00:00',
  },
  pool: {
    min: 1,
    max: 5,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 60000,
  },
  migrations: {
    directory: '../database/migrations',
    tableName: 'knex_migrations',
    extension: 'ts',
  },
  seeds: {
    directory: '../database/seeds',
    extension: 'ts',
  },
};

const db = knex(config);

export { db, config };
export default db;
