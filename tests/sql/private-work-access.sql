-- Run against a test tenant with three active accounts. Everything rolls back.
BEGIN;
CREATE TEMP TABLE private_work_fixture AS
WITH members AS (SELECT id,restaurant_id,auth_user_id,row_number() OVER(PARTITION BY restaurant_id ORDER BY (role::text='restaurant_admin') DESC,id) n FROM public.staff WHERE is_active AND auth_user_id IS NOT NULL),
tenant AS (SELECT restaurant_id FROM members GROUP BY restaurant_id HAVING count(DISTINCT auth_user_id)>=3 LIMIT 1)
SELECT gen_random_uuid() task_id,a.restaurant_id,a.id creator,b.id assignee,c.id outsider,a.auth_user_id creator_user,b.auth_user_id assignee_user,c.auth_user_id outsider_user
FROM members a JOIN members b ON b.restaurant_id=a.restaurant_id AND b.n=2 JOIN members c ON c.restaurant_id=a.restaurant_id AND c.n=3 JOIN tenant t ON t.restaurant_id=a.restaurant_id WHERE a.n=1;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM private_work_fixture) THEN RAISE EXCEPTION 'Three active accounts required'; END IF; END $$;
GRANT SELECT ON private_work_fixture TO authenticated;
INSERT INTO public.work_tasks(id,restaurant_id,title,category,priority,status,created_by_staff_id,assigned_staff_id,is_private,requires_approval,approval_status,approval_staff_id)
SELECT task_id,restaurant_id,'Private work regression fixture','task','normal','open',creator,assignee,true,true,'pending',creator FROM private_work_fixture;
INSERT INTO public.work_task_activity(task_id,restaurant_id,actor_staff_id,action,note)
SELECT task_id,restaurant_id,creator,'comment','Private comment fixture' FROM private_work_fixture;
-- Even an incorrectly targeted notification cannot expose a private ticket.
INSERT INTO public.in_app_notifications(restaurant_id,staff_id,kind,title,body,source_type,source_id)
SELECT restaurant_id,outsider,'task','Private fixture','Private body','work_task',task_id FROM private_work_fixture;
-- Exercise the manager bypass explicitly; the transaction restores this role.
UPDATE public.staff SET role='restaurant_admin' WHERE id=(SELECT outsider FROM private_work_fixture);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',(SELECT creator_user::text FROM private_work_fixture),true);
-- Client inserts cannot opt out of privacy, even without the new UI flag.
INSERT INTO public.work_tasks(restaurant_id,title,category,priority,status,created_by_staff_id,assigned_staff_id,requires_approval)
SELECT restaurant_id,'Client private insert fixture','task','normal','open',creator,assignee,true FROM private_work_fixture;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.work_tasks WHERE restaurant_id=(SELECT restaurant_id FROM private_work_fixture) AND title='Client private insert fixture' AND is_private AND approval_status='pending' AND approval_staff_id=created_by_staff_id) THEN RAISE EXCEPTION 'Client insert privacy failed'; END IF; END $$;

DO $$ BEGIN IF (SELECT count(*) FROM public.work_tasks WHERE id=(SELECT task_id FROM private_work_fixture))<>1 THEN RAISE EXCEPTION 'Creator visibility failed'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub',(SELECT assignee_user::text FROM private_work_fixture),true);
DO $$ BEGIN
IF (SELECT count(*) FROM public.work_tasks WHERE id=(SELECT task_id FROM private_work_fixture))<>1 THEN RAISE EXCEPTION 'Assignee visibility failed'; END IF;
BEGIN UPDATE public.work_tasks SET title='Forbidden edit' WHERE id=(SELECT task_id FROM private_work_fixture); RAISE EXCEPTION 'Forbidden edit succeeded'; EXCEPTION WHEN OTHERS THEN IF sqlerrm='Forbidden edit succeeded' THEN RAISE; END IF; END;
BEGIN UPDATE public.work_tasks SET approval_status='approved',status='completed' WHERE id=(SELECT task_id FROM private_work_fixture); RAISE EXCEPTION 'Approval bypass succeeded'; EXCEPTION WHEN OTHERS THEN IF sqlerrm='Approval bypass succeeded' THEN RAISE; END IF; END;
END $$;
UPDATE public.work_tasks SET status='waiting_approval' WHERE id=(SELECT task_id FROM private_work_fixture);
SELECT set_config('request.jwt.claim.sub',(SELECT outsider_user::text FROM private_work_fixture),true);
DO $$ BEGIN
IF (SELECT count(*) FROM public.work_tasks WHERE id=(SELECT task_id FROM private_work_fixture))<>0 THEN RAISE EXCEPTION 'Manager ticket leak'; END IF;
IF (SELECT count(*) FROM public.work_task_activity WHERE task_id=(SELECT task_id FROM private_work_fixture))<>0 THEN RAISE EXCEPTION 'Manager comment leak'; END IF;
IF (SELECT count(*) FROM public.in_app_notifications WHERE source_id=(SELECT task_id FROM private_work_fixture))<>0 THEN RAISE EXCEPTION 'Manager notification leak'; END IF;
IF app.can_approve_work_task((SELECT task_id FROM private_work_fixture)) THEN RAISE EXCEPTION 'Manager approval bypass'; END IF;
BEGIN PERFORM public.archive_work_task((SELECT task_id FROM private_work_fixture)); RAISE EXCEPTION 'Archive bypass succeeded'; EXCEPTION WHEN OTHERS THEN IF sqlerrm='Archive bypass succeeded' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub',(SELECT creator_user::text FROM private_work_fixture),true);
SELECT public.action_work_approval((SELECT task_id FROM private_work_fixture),'approve',NULL);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.work_tasks WHERE id=(SELECT task_id FROM private_work_fixture) AND approval_status='approved' AND status='completed') THEN RAISE EXCEPTION 'Creator approval failed'; END IF; END $$;
UPDATE public.work_tasks SET assigned_staff_id=(SELECT outsider FROM private_work_fixture) WHERE id=(SELECT task_id FROM private_work_fixture);
SELECT set_config('request.jwt.claim.sub',(SELECT assignee_user::text FROM private_work_fixture),true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.work_tasks WHERE id=(SELECT task_id FROM private_work_fixture)) OR EXISTS(SELECT 1 FROM public.in_app_notifications WHERE source_id=(SELECT task_id FROM private_work_fixture)) THEN RAISE EXCEPTION 'Former assignee retains access'; END IF; END $$;
ROLLBACK;
SELECT 'PASS: creator, assignee, manager isolation, comments, notifications, protected edits, approvals, archive and reassignment; fixtures rolled back' result;
