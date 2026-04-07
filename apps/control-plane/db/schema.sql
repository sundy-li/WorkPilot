create table if not exists organizations (
  id text primary key,
  slug text unique not null,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

alter table organizations add column if not exists description text not null default '';

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
  description text,
  created_at timestamptz not null default now()
);

alter table channels add column if not exists description text;

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
  model text not null default 'default',
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
  restart_mode text check (restart_mode in ('restart', 'reset_session', 'reset_memory', 'full_reset')),
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
  description text,
  status text not null check (status in ('backlog', 'todo', 'in_progress', 'in_review', 'done')),
  assignee_id text,
  creator_id text not null,
  priority text not null check (priority in ('low', 'medium', 'high')),
  due_date timestamptz,
  project text,
  source_channel_id text,
  discussion_channel_id text not null references channels(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table issues add column if not exists discussion_channel_id text references channels(id) on delete cascade;

create table if not exists issue_activities (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  issue_id text not null references issues(id) on delete cascade,
  actor_id text not null,
  actor_type text not null check (actor_type in ('user', 'agent', 'system')),
  kind text not null check (kind in ('created', 'status_changed', 'assignee_changed', 'priority_changed', 'due_date_changed', 'title_changed', 'description_changed', 'commented')),
  field text,
  from_value text,
  to_value text,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists agent_run_logs (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  runtime_id text not null references runtime_daemons(id) on delete cascade,
  agent_id text not null references agents(id) on delete cascade,
  channel_id text references channels(id) on delete set null,
  issue_id text references issues(id) on delete set null,
  session_id text not null,
  kind text not null check (kind in ('direct_message', 'issue')),
  prompt text not null,
  response text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists agent_workspace_files (
  agent_id text not null references agents(id) on delete cascade,
  organization_id text not null references organizations(id) on delete cascade,
  path text not null,
  content text not null default '',
  size integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (agent_id, path)
);

create table if not exists audit_logs (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  action text not null,
  actor_id text not null,
  target_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists workspace_permissions (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  resource_type text not null check (resource_type in ('runtime', 'agent', 'channel')),
  resource_id text not null,
  permission text not null check (permission in ('read', 'write', 'admin')),
  created_at timestamptz not null default now(),
  created_by text not null,
  unique (organization_id, user_id, resource_type, resource_id, permission)
);

create table if not exists channel_members (
  id text primary key,
  channel_id text not null references channels(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('member', 'moderator', 'admin')),
  created_at timestamptz not null default now(),
  unique (channel_id, user_id)
);

-- Performance indexes for bootstrap queries
create index if not exists idx_messages_organization_id on messages (organization_id);
create index if not exists idx_issues_organization_id on issues (organization_id);
create index if not exists idx_issue_activities_organization_id on issue_activities (organization_id);
create index if not exists idx_agent_run_logs_organization_id on agent_run_logs (organization_id);
create index if not exists idx_messages_channel_id on messages (channel_id);
create index if not exists idx_agents_organization_id on agents (organization_id);
create index if not exists idx_runtime_daemons_organization_id on runtime_daemons (organization_id);

create table if not exists workspace_invitations (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'admin', 'member')),
  invited_by text not null references users(id),
  token text unique not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists agent_runs (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  runtime_id text not null,
  agent_id text not null,
  channel_id text,
  issue_id text,
  session_id text not null,
  kind text not null check (kind in ('direct_message', 'issue')),
  prompt text not null,
  response text,
  created_at timestamptz not null default now()
);
