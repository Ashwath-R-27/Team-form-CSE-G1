alter table forms add column if not exists show_chosen_topics boolean not null default false;
notify pgrst, 'reload schema';

