import { registerAs } from '@nestjs/config';
import * as os from 'os';

export default registerAs('database', () => {
  const host = process.env.DATABASE_HOST || 'localhost';
  const port = parseInt(process.env.DATABASE_PORT, 10) || 5432;
  const username = process.env.DATABASE_USERNAME || 'postgres';
  const password = process.env.DATABASE_PASSWORD || 'password';
  const database = process.env.DATABASE_NAME || 'dwb_db';
  const nodeEnv = process.env.NODE_ENV || 'development';

  // Prilagodi pool velicinu broju cluster workera
  // Svaki worker ima svoj pool - ukupno treba biti ~20 konekcija
  const clusterWorkers = Math.min(
    parseInt(process.env.CLUSTER_WORKERS || '0', 10) || os.cpus().length,
    os.cpus().length,
  );
  const totalPoolMax = 40;
  const perWorkerMax = Math.max(2, Math.floor(totalPoolMax / Math.max(clusterWorkers, 1)));

  return {
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    synchronize: nodeEnv === 'development',
    logging: false,
    extra: {
      max: perWorkerMax,
      min: Math.min(2, perWorkerMax),
      acquire: 30000,
      idle: 10000,
    },
  };
});
