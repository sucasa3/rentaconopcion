CREATE TABLE public.professional_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_context text NOT NULL DEFAULT 'agent_invites_professional',
  inviter_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  invited_professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  invited_email_normalized text NOT NULL,
  related_resource_relationship_id uuid REFERENCES public.relationships(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  sent_at timestamptz,
  last_sent_at timestamptz,
  send_count integer NOT NULL DEFAULT 0,
  accepted_at timestamptz,
  accepted_by_user_id uuid,
  declined_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '21 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professional_invitations_status_check
    CHECK (status IN ('pending','sent','accepted','declined','revoked')),
  CONSTRAINT professional_invitations_context_check
    CHECK (invitation_context IN ('agent_invites_professional'))
);

GRANT SELECT, INSERT, UPDATE ON public.professional_invitations TO authenticated;
GRANT ALL ON public.professional_invitations TO service_role;

ALTER TABLE public.professional_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inviting workspace members can read their invitations"
  ON public.professional_invitations FOR SELECT TO authenticated
  USING (public.is_lender_member(auth.uid(), inviter_org_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Inviting workspace managers can create invitations"
  ON public.professional_invitations FOR INSERT TO authenticated
  WITH CHECK (public.is_lender_member(auth.uid(), inviter_org_id));

CREATE POLICY "Inviting workspace managers can update their invitations"
  ON public.professional_invitations FOR UPDATE TO authenticated
  USING (public.is_lender_member(auth.uid(), inviter_org_id))
  WITH CHECK (public.is_lender_member(auth.uid(), inviter_org_id));

-- At most one live invitation per workspace + professional + purpose.
CREATE UNIQUE INDEX professional_invitations_one_active
  ON public.professional_invitations (inviter_org_id, invited_professional_id, invitation_context)
  WHERE status IN ('pending','sent');

CREATE INDEX professional_invitations_professional_idx
  ON public.professional_invitations (invited_professional_id, status);
CREATE INDEX professional_invitations_email_idx
  ON public.professional_invitations (invited_email_normalized);

CREATE TRIGGER trg_professional_invitations_updated
  BEFORE UPDATE ON public.professional_invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.homeowner_relationship_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id uuid NOT NULL,
  relationship_id uuid NOT NULL REFERENCES public.relationships(id) ON DELETE CASCADE,
  outcome text NOT NULL,
  requested_at timestamptz,
  responded_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT homeowner_relationship_validations_outcome_check
    CHECK (outcome IN ('confirmed','rejected','unknown')),
  CONSTRAINT homeowner_relationship_validations_unique
    UNIQUE (homeowner_id, relationship_id)
);

GRANT SELECT, INSERT, UPDATE ON public.homeowner_relationship_validations TO authenticated;
GRANT ALL ON public.homeowner_relationship_validations TO service_role;

ALTER TABLE public.homeowner_relationship_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Homeowners read their own validations"
  ON public.homeowner_relationship_validations FOR SELECT TO authenticated
  USING (homeowner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Homeowners record their own validations"
  ON public.homeowner_relationship_validations FOR INSERT TO authenticated
  WITH CHECK (homeowner_id = auth.uid());

CREATE POLICY "Homeowners update their own validations"
  ON public.homeowner_relationship_validations FOR UPDATE TO authenticated
  USING (homeowner_id = auth.uid())
  WITH CHECK (homeowner_id = auth.uid());

CREATE TRIGGER trg_homeowner_relationship_validations_updated
  BEFORE UPDATE ON public.homeowner_relationship_validations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();