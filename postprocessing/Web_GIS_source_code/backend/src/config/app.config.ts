import { registerAs } from '@nestjs/config';

export default registerAs('app', () => {
  const port = parseInt(process.env.PORT, 10) || 8085;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const nodeEnv = process.env.NODE_ENV || 'development';

  return {
    port,
    frontendUrl,
    nodeEnv,
    isDevelopment: nodeEnv === 'development',
    isProduction: nodeEnv === 'production',
    cors: {
      origins: [
        frontendUrl,
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost',
        'http://127.0.0.1',
      ]
    },
    titiler: {
      internalUrl: process.env.TITILER_INTERNAL_URL || 'http://titiler:8000',
      publicUrl: process.env.TITILER_PUBLIC_URL || 'http://localhost:8090',
    },
  };
});
