-- Setup templates also hold grade level lists: items = [{name, code, sort_order}].
alter table public.setup_templates drop constraint setup_templates_kind_check;
alter table public.setup_templates add constraint setup_templates_kind_check
  check (kind in ('grading_periods', 'grading_scales', 'grade_levels'));
