import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  port: number;
  dlocal: {
    apiUrl: string;
    xLogin: string;
    xTransKey: string;
  };
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  };
  security: {
    corsOrigin: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}

const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  dlocal: {
    apiUrl: process.env.DLOCAL_API_URL || 'https://sandbox.dlocal.com',
    xLogin: process.env.DLOCAL_X_LOGIN || '',
    xTransKey: process.env.DLOCAL_X_TRANS_KEY || '',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_KEY || '', // Usando SUPABASE_KEY que ya tienes
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  security: {
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
};

// Validación de variables de entorno requeridas
const requiredEnvVars = [
  'DLOCAL_X_LOGIN',
  'DLOCAL_X_TRANS_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Required environment variable ${envVar} is not set`);
  }
}

export default config;
