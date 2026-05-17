export const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text,
  default_shipping jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS sales (
  id text PRIMARY KEY,
  ts timestamptz NOT NULL,
  product_id text NOT NULL,
  qty integer NOT NULL,
  price_cents integer NOT NULL,
  ref text,
  ua text,
  user_id text,
  customer_name text,
  customer_email text,
  product_title text,
  drop_id text,
  shipping_address jsonb,
  order_id text,
  line_total_cents integer NOT NULL
);

CREATE INDEX IF NOT EXISTS sales_ts_idx ON sales (ts DESC);
CREATE INDEX IF NOT EXISTS sales_order_id_idx ON sales (order_id);
CREATE INDEX IF NOT EXISTS sales_user_id_idx ON sales (user_id);
CREATE INDEX IF NOT EXISTS sales_customer_email_idx ON sales (customer_email);
CREATE INDEX IF NOT EXISTS sales_drop_id_idx ON sales (drop_id);

CREATE TABLE IF NOT EXISTS catalog (
  id text PRIMARY KEY,
  title text NOT NULL,
  price_cents integer NOT NULL,
  image_url text,
  enabled boolean NOT NULL DEFAULT true,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vault_records (
  product_id text PRIMARY KEY,
  saves jsonb NOT NULL DEFAULT '[]'::jsonb,
  releases jsonb NOT NULL DEFAULT '[]'::jsonb,
  pending_release jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_state (
  id text PRIMARY KEY,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;
