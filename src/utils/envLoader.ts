import dotenv from 'dotenv';

dotenv.config(); // loads .env into process.env

export const getEnvVar = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};
