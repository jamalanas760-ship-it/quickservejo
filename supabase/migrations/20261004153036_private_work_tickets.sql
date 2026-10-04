-- New user-created work is private; existing automated role queues retain their access.
ALTER TABLE public.work_tasks ADD COLUMN is_private boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION app.work_ticket_visible(_task_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.work_tasks t WHERE t.id=_task_id
 AND app.has_restaurant_access(t.restaurant_id)
 AND (NOT t.is_private OR EXISTS(SELECT 1 FROM public.staff s
 WHERE s.restaurant_id=t.restaurant_id AND s.is_active AND s.auth_user_id=(SELECT auth.uid())
 AND s.id IN(t.created_by_staff_id,t.assigned_staff_id))))
$$;
REVOKE ALL ON FUNCTION app.work_ticket_visible(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION app.work_ticket_visible(uuid) TO authenticated;
CREATE POLICY private_work_select ON public.work_tasks AS RESTRICTIVE FOR SELECT TO authenticated USING(app.work_ticket_visible(id));
CREATE POLICY private_work_update ON public.work_tasks AS RESTRICTIVE FOR UPDATE TO authenticated USING(app.work_ticket_visible(id)) WITH CHECK(app.work_ticket_visible(id));
CREATE POLICY private_work_delete ON public.work_tasks AS RESTRICTIVE FOR DELETE TO authenticated USING(app.work_ticket_visible(id));
CREATE POLICY private_work_insert ON public.work_tasks AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(is_private);
-- Creators can update their own private tickets, including tickets assigned elsewhere.
CREATE POLICY creator_private_work_update ON public.work_tasks FOR UPDATE TO authenticated
USING(is_private AND created_by_staff_id=app.current_staff_id(restaurant_id))
WITH CHECK(is_private AND created_by_staff_id=app.current_staff_id(restaurant_id));
CREATE OR REPLACE FUNCTION app.guard_private_work() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 actor := app.current_staff_id(NEW.restaurant_id);
 IF TG_OP='INSERT' THEN
   IF NEW.source_type IS NOT NULL AND NOT NEW.is_private THEN RETURN NEW; END IF;
   NEW.is_private:=true;
   IF actor IS NULL OR NEW.created_by_staff_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Ticket creator must be the current staff member'; END IF;
 ELSE
   IF NEW.is_private IS DISTINCT FROM OLD.is_private OR NEW.created_by_staff_id IS DISTINCT FROM OLD.created_by_staff_id OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id THEN RAISE EXCEPTION 'Ticket ownership cannot be changed'; END IF;
   IF OLD.is_private AND actor IS DISTINCT FROM OLD.created_by_staff_id AND
      (NEW.assigned_staff_id IS DISTINCT FROM OLD.assigned_staff_id OR NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description OR NEW.priority IS DISTINCT FROM OLD.priority OR NEW.due_at IS DISTINCT FROM OLD.due_at OR NEW.requires_approval IS DISTINCT FROM OLD.requires_approval OR NEW.approval_staff_id IS DISTINCT FROM OLD.approval_staff_id) THEN RAISE EXCEPTION 'Only the creator can edit ticket details or assignment'; END IF;
 END IF;
 IF NEW.is_private THEN
   IF NEW.assigned_role IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.staff s WHERE s.id=NEW.assigned_staff_id AND s.restaurant_id=NEW.restaurant_id AND s.is_active) THEN RAISE EXCEPTION 'Private tickets require one active assignee in the same restaurant'; END IF;
   IF NEW.requires_approval THEN NEW.approval_staff_id:=NEW.created_by_staff_id; NEW.approval_role:=NULL; END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.guard_private_work() FROM public,anon,authenticated;
CREATE TRIGGER private_work_guard BEFORE INSERT OR UPDATE ON public.work_tasks FOR EACH ROW EXECUTE FUNCTION app.guard_private_work();
-- Activity policies already inherit work_tasks visibility. Notifications must too.
CREATE POLICY private_work_notifications ON public.in_app_notifications AS RESTRICTIVE FOR SELECT TO authenticated
USING(source_type IS DISTINCT FROM 'work_task' OR app.work_ticket_visible(source_id));
CREATE OR REPLACE FUNCTION app.can_approve_work_task(_task_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.work_tasks t WHERE t.id=_task_id AND t.requires_approval AND t.approval_status='pending'
 AND app.has_restaurant_access(t.restaurant_id) AND app.work_ticket_visible(t.id)
 AND ((t.is_private AND t.created_by_staff_id=app.current_staff_id(t.restaurant_id)) OR
 (NOT t.is_private AND (app.is_super_admin() OR EXISTS(SELECT 1 FROM public.staff s WHERE s.restaurant_id=t.restaurant_id AND s.auth_user_id=(SELECT auth.uid()) AND s.is_active AND app.has_capability(t.restaurant_id,'approve_work') AND (t.approval_staff_id IS NULL OR t.approval_staff_id=s.id) AND (t.approval_role IS NULL OR t.approval_role=s.role::text))))))
$$;
CREATE OR REPLACE FUNCTION public.archive_work_task(_task_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rid uuid; sid uuid;
BEGIN
 IF NOT app.work_ticket_visible(_task_id) THEN RAISE EXCEPTION 'Work item not found'; END IF;
 SELECT restaurant_id INTO rid FROM public.work_tasks WHERE id=_task_id AND deleted_at IS NULL;
 IF rid IS NULL THEN RAISE EXCEPTION 'Work item not found'; END IF;
 IF NOT app.is_super_admin() AND NOT EXISTS(SELECT 1 FROM public.staff s WHERE s.restaurant_id=rid AND s.auth_user_id=(SELECT auth.uid()) AND s.is_active AND s.role::text='restaurant_admin') THEN RAISE EXCEPTION 'Only the Restaurant Manager can delete work items'; END IF;
 sid:=app.current_staff_id(rid);
 UPDATE public.work_tasks SET deleted_at=now(),deleted_by_staff_id=sid,updated_at=now() WHERE id=_task_id AND deleted_at IS NULL;
END;
$$;
