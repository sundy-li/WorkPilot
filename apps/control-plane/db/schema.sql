create table if not exists organizations (
  id text primary key,
  slug text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  email text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  organization_id text not null references organizations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists channels (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  type text not null check (type in ('group', 'direct')),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists channel_participants (
  channel_id text not null references channels(id) on delete cascade,
  participant_id text not null,
  participant_type text not null check (participant_type in ('user', 'agent')),
  created_at timestamptz not null default now(),
  primary key (channel_id, participant_id, participant_type)
);

create table if not exists runtime_daemons (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  runtime_key text not null,
  status text not null check (status in ('pending', 'online', 'offline', 'unhealthy', 'revoked', 'deleted')),
  credential_id text not null,
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists runtime_daemons_active_runtime_key_idx
  on runtime_daemons (organization_id, runtime_key)
  where status <> 'deleted';

create table if not exists agents (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  runtime_id text not null references runtime_daemons(id) on delete cascade,
  channel_id text not null references channels(id) on delete cascade,
  name text not null,
  description text not null,
  implementation text not null default 'claude' check (implementation in ('claude', 'codex', 'opencode', 'pi')),
  model text not null default 'claude-sonnet-4.5',
  reasoning_effort text not null default 'medium' check (reasoning_effort in ('low', 'medium', 'high')),
  status text not null default 'running' check (status in ('running', 'stopped', 'deleted')),
  created_at timestamptz not null default now()
);

create table if not exists agent_control_actions (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  runtime_id text not null references runtime_daemons(id) on delete cascade,
  agent_id text not null,
  action text not null check (action in ('start', 'stop', 'restart', 'delete')),
  restart_mode text check (restart_mode in ('restart', 'reset_session', 'full_reset')),
  requested_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

create table if not exists runtime_registration_tokens (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  token text unique not null,
  created_by text not null references users(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_runtime_key text
);

alter table runtime_registration_tokens add column if not exists used_runtime_key text;

create table if not exists messages (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  channel_id text not null references channels(id) on delete cascade,
  sender_id text not null,
  sender_type text not null check (sender_type in ('user', 'agent', 'system')),
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists agent_message_claims (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  runtime_id text not null references runtime_daemons(id) on delete cascade,
  agent_id text not null references agents(id) on delete cascade,
  source_message_id text not null unique references messages(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  responded_at timestamptz,
  response_message_id text references messages(id) on delete set null
);

create table if not exists issues (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null check (status in ('backlog', 'todo', 'in_progress', 'in_review', 'done')),
  assignee_id text,
  creator_id text not null references users(id),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date timestamptz,
  project text,
  source_channel_id text references channels(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  action text not null,
  actor_id text not null,
  target_id text not null,
  created_at timestamptz not null default now()
);
