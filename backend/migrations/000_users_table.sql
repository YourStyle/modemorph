-- Users table — replaces Supabase auth.users
-- This table stores authentication data previously managed by GoTrue

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "email" TEXT NOT NULL UNIQUE,
    "encrypted_password" TEXT NOT NULL,
    "raw_user_meta_data" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ DEFAULT NOW(),
    "email_confirmed_at" TIMESTAMPTZ,
    "role" TEXT DEFAULT 'authenticated',
    PRIMARY KEY ("id")
);

CREATE INDEX idx_users_email ON users(email);
