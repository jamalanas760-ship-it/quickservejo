CREATE OR REPLACE FUNCTION app.guard_private_work() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 actor := app.current_staff_id(NEW.restaurant_id);
 IF TG_OP='INSERT' THEN
   IF NEW.source_type IS NOT NULL AND NOT NEW.is_private THEN RETURN NEW; END IF;
   NEW.is_private:=true;
   NEW.approval_status:=CASE WHEN NEW.requires_approval THEN 'pending' ELSE 'not_required' END;
   IF actor IS NULL OR NEW.created_by_staff_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Ticket creator must be the current staff member'; END IF;
 ELSE
   IF OLD.is_private AND current_user NOT IN ('postgres','service_role','supabase_admin') THEN
     IF NEW.approval_status IS DISTINCT FROM OLD.approval_status OR NEW.approved_by_staff_id IS DISTINCT FROM OLD.approved_by_staff_id OR NEW.approval_note IS DISTINCT FROM OLD.approval_note OR NEW.approval_action_at IS DISTINCT FROM OLD.approval_action_at OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN RAISE EXCEPTION 'Use the approval action'; END IF;
     IF NEW.requires_approval AND NEW.status='completed' AND NEW.approval_status<>'approved' THEN RAISE EXCEPTION 'Creator approval required'; END IF;
   END IF;
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
