CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE rate_limits (
  bucket text PRIMARY KEY,
  count integer NOT NULL,
  resets_at timestamptz NOT NULL
);

CREATE TABLE knowledge_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  topic text NOT NULL,
  goal text NOT NULL,
  current_knowledge text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_bases_owner_idx ON knowledge_bases(owner_id, created_at);

CREATE TABLE resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  filename text NOT NULL,
  media_type text NOT NULL,
  original_bytes bytea NOT NULL,
  extracted_text text,
  pages jsonb NOT NULL DEFAULT '[]',
  byte_count integer NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX resources_kb_idx ON resources(knowledge_base_id, created_at);

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id uuid NOT NULL UNIQUE REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'validating', 'active', 'paused', 'completed')),
  plan_revision integer NOT NULL DEFAULT 0,
  source_revision integer NOT NULL DEFAULT 0,
  plan jsonb,
  approved_plan jsonb,
  timezone text,
  delivery_time time,
  next_due_at timestamptz,
  last_published_at timestamptz,
  last_published_local_date date,
  last_published_timezone text,
  pause_after_episode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_index integer NOT NULL CHECK (lesson_index BETWEEN 1 AND 30),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'generating', 'ready', 'failed')),
  title text NOT NULL DEFAULT '',
  script text,
  continuity_summary text,
  source_refs jsonb NOT NULL DEFAULT '[]',
  audio_bytes bytea,
  duration_seconds double precision,
  duration_repair_attempted boolean NOT NULL DEFAULT false,
  error_message text,
  progress_seconds double precision NOT NULL DEFAULT 0,
  finished boolean NOT NULL DEFAULT false,
  ready_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, lesson_index)
);
CREATE INDEX episodes_course_order_idx ON episodes(course_id, lesson_index);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('extract', 'plan', 'approve', 'script', 'audio', 'push')),
  job_key text NOT NULL UNIQUE,
  entity_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_available_idx ON jobs(available_at) WHERE status IN ('pending', 'running');

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  subscription jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  delivered_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  UNIQUE (episode_id, subscription_id)
);
