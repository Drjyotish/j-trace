/**
 * PostgreSQL schema. Runs unchanged on PGlite (embedded Postgres, used for the
 * local prototype, tests and the stateless demo deployment) and on a real
 * PostgreSQL server (set DATABASE_URL).
 *
 * Conventions
 *  - *_enc   : AES-256-GCM ciphertext of a sensitive field (see lib/crypto.ts)
 *  - *_hmac  : keyed pseudonym used for equality lookups; never reversible
 *  - JSON payloads are stored as TEXT so both drivers behave identically.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS staff_users (
  id            uuid PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('police','telecom','admin','auditor')),
  agency        text NOT NULL,
  jurisdiction  text NOT NULL CHECK (jurisdiction IN ('IN','NP','AE','ALL')),
  verified      boolean NOT NULL DEFAULT false,
  disabled      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Pre-loss device vault: the only legitimate "phone number -> IMEI" source TRACE controls.
CREATE TABLE IF NOT EXISTS devices (
  id                    uuid PRIMARY KEY,
  imei_hmac             text NOT NULL UNIQUE,
  imei_enc              text NOT NULL,
  phone_hmac            text NOT NULL,
  country               text NOT NULL CHECK (country IN ('IN','NP','AE')),
  brand                 text,
  model                 text,
  recovery_contact_enc  text NOT NULL,
  recovery_contact_hmac text NOT NULL,
  contact_verified      boolean NOT NULL DEFAULT false,
  consent_at            timestamptz NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS devices_phone_idx ON devices (phone_hmac);

CREATE TABLE IF NOT EXISTS cases (
  id                 uuid PRIMARY KEY,
  ref                text NOT NULL UNIQUE,
  access_key_hash    text NOT NULL,
  country            text NOT NULL CHECK (country IN ('IN','NP','AE')),
  incident_type      text NOT NULL CHECK (incident_type IN ('lost','stolen')),
  incident_at        timestamptz,
  incident_place_enc text,
  owner_name_enc     text,
  contact_enc        text NOT NULL,
  contact_hmac       text NOT NULL,
  contact_verified   boolean NOT NULL DEFAULT false,
  phone_enc          text,
  phone_hmac         text,
  imei_enc           text,
  imei_hmac          text,
  brand              text,
  model              text,
  platform           text NOT NULL DEFAULT 'android' CHECK (platform IN ('android','ios','other')),
  police_ref         text,
  status             text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','active','referred','disputed','recovered','closed')),
  verification_level integer NOT NULL DEFAULT 0,
  ownership_score    integer NOT NULL DEFAULT 0,
  priority           integer NOT NULL DEFAULT 0,
  locale             text NOT NULL DEFAULT 'en',
  consent_at         timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  closed_at          timestamptz,
  purge_after        timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS cases_imei_idx ON cases (imei_hmac);
CREATE INDEX IF NOT EXISTS cases_country_idx ON cases (country, status);

CREATE TABLE IF NOT EXISTS case_evidence (
  id          uuid PRIMARY KEY,
  case_id     uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN
              ('contact_otp','vault_match','invoice','box_label','police_report','id_document','account_access')),
  sha256      text,
  meta        text NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'declared' CHECK (status IN ('declared','accepted','rejected')),
  reviewed_by uuid REFERENCES staff_users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, kind)
);

CREATE TABLE IF NOT EXISTS case_steps (
  case_id  uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  done     boolean NOT NULL DEFAULT false,
  done_at  timestamptz,
  PRIMARY KEY (case_id, step_key)
);

CREATE TABLE IF NOT EXISTS case_events (
  id         uuid PRIMARY KEY,
  case_id    uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  source     text NOT NULL,
  simulated  boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'staff' CHECK (visibility IN ('owner','staff')),
  min_level  integer NOT NULL DEFAULT 0,
  country    text,
  payload    text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_events_case_idx ON case_events (case_id, created_at);

CREATE TABLE IF NOT EXISTS otps (
  id           uuid PRIMARY KEY,
  purpose      text NOT NULL CHECK (purpose IN ('case_contact','vault_register','vault_recover')),
  subject_hmac text NOT NULL,
  code_hash    text NOT NULL,
  case_id      uuid REFERENCES cases(id) ON DELETE CASCADE,
  device_id    uuid REFERENCES devices(id) ON DELETE CASCADE,
  attempts     integer NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referrals (
  id                uuid PRIMARY KEY,
  case_id           uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  from_jurisdiction text NOT NULL,
  to_jurisdiction   text NOT NULL,
  reason            text NOT NULL,
  legal_basis       text NOT NULL,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_by        uuid NOT NULL REFERENCES staff_users(id),
  decided_by        uuid REFERENCES staff_users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  decided_at        timestamptz
);

CREATE TABLE IF NOT EXISTS messages (
  id         uuid PRIMARY KEY,
  case_id    uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES staff_users(id),
  body_enc   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Simulated notification outbox (no SMS/e-mail provider is wired in the prototype).
CREATE TABLE IF NOT EXISTS outbox (
  id         uuid PRIMARY KEY,
  case_id    uuid REFERENCES cases(id) ON DELETE CASCADE,
  channel    text NOT NULL,
  to_enc     text NOT NULL,
  template   text NOT NULL,
  simulated  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Append-only, hash-chained audit trail. case_id is deliberately NOT a foreign
-- key: audit rows must outlive the purge of the case they describe.
CREATE TABLE IF NOT EXISTS audit_log (
  seq        integer PRIMARY KEY,
  at         timestamptz NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('owner','staff','system')),
  actor_id   text NOT NULL,
  action     text NOT NULL,
  case_id    uuid,
  detail     text NOT NULL DEFAULT '{}',
  ip_hash    text,
  prev_hash  text NOT NULL,
  hash       text NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_case_idx ON audit_log (case_id);
`;
