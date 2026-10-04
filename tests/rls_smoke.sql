-- RecoveryPointe database security smoke test.
-- Run in the Supabase SQL editor (or via any SQL runner) against the RecoveryPointe project.
-- Creates two throwaway users, checks isolation/validation, then ALWAYS rolls back by raising
-- an exception whose message is the result list. Expect every line to start with "ok:" or match "(expect N)".
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); r text := ''; n int; j jsonb; c uuid; rid uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
   (a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','a_'||a||'@test.invalid','{"full_name":"A"}',now(),now()),
   (b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','b_'||b||'@test.invalid','{"full_name":"B"}',now(),now());
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  set local role authenticated;
  j := public.create_case('mobile_money_fraud','Test incident description long enough',500,'GHS',current_date,null,null,null,rid);
  c := (j->>'id')::uuid;
  j := public.create_case('mobile_money_fraud','Test incident description long enough',500,'GHS',current_date,null,null,null,rid);
  select count(*) into n from public.cases;
  r := r||'duplicate submit -> cases='||n||' (expect 1) dup='||(j->>'duplicate')||E'\n';
  begin perform public.create_case('other','short',1,'GHS',null,null,null,null,gen_random_uuid()); r:=r||E'FAIL short desc\n'; exception when others then r:=r||E'ok: short description rejected\n'; end;
  begin insert into public.cases(user_id,incident_type,incident_description) values (a,'other','direct insert attempt......'); r:=r||E'FAIL direct insert\n'; exception when others then r:=r||E'ok: direct case insert blocked\n'; end;
  begin update public.cases set status='resolved' where id=c; r:=r||E'FAIL status update\n'; exception when others then r:=r||E'ok: status update blocked\n'; end;
  begin insert into public.case_events(case_id,actor_user_id,event_type,title) values (c,a,'status_changed','x'); r:=r||E'FAIL event insert\n'; exception when others then r:=r||E'ok: direct event insert blocked\n'; end;
  begin insert into public.case_evidence(case_id,user_id,storage_path,file_name,content_type,size_bytes) values (c,a,a||'/'||c||'/b.pdf','b.pdf','application/pdf',99999999); r:=r||E'FAIL oversize\n'; exception when others then r:=r||E'ok: oversize evidence rejected\n'; end;
  begin insert into public.case_evidence(case_id,user_id,storage_path,file_name,content_type,size_bytes) values (c,a,a||'/'||c||'/m.exe','m.exe','application/x-msdownload',10); r:=r||E'FAIL mime\n'; exception when others then r:=r||E'ok: bad MIME rejected\n'; end;
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  select (select count(*) from public.cases)+(select count(*) from public.case_events)+(select count(*) from public.case_evidence)+(select count(*) from public.profiles where id=a) into n;
  r := r||'user B sees A data rows='||n||E' (expect 0)\n';
  begin perform public.add_case_reference(c,'forged'); r:=r||E'FAIL B reference\n'; exception when others then r:=r||E'ok: B cannot write to A case\n'; end;
  begin insert into public.case_evidence(case_id,user_id,storage_path,file_name,content_type,size_bytes) values (c,b,b||'/'||c||'/z.png','z.png','image/png',10); r:=r||E'FAIL B evidence\n'; exception when others then r:=r||E'ok: B cannot add evidence to A case\n'; end;
  begin perform public.handle_new_user(); r:=r||E'FAIL handle_new_user callable\n'; exception when others then r:=r||E'ok: handle_new_user not callable\n'; end;
  reset role; set local role anon;
  begin perform 1 from public.cases; r:=r||E'FAIL anon read\n'; exception when others then r:=r||E'ok: anon cannot read cases\n'; end;
  reset role;
  raise exception E'RESULTS\n%', r;
end $$;
