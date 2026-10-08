-- =============================================================================
-- Phase 5: finance roles. Enum values must be committed before any later
-- statement uses them, so this migration contains only the additions.
-- =============================================================================
alter type public.app_role add value if not exists 'finance_admin';
alter type public.app_role add value if not exists 'finance_staff';
