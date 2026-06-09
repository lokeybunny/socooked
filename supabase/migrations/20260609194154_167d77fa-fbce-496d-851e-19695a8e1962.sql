-- Attach the existing trigger functions so the signed-proposal -> deposit-email flow actually fires.
DROP TRIGGER IF EXISTS trg_documents_mark_proposal_signed ON public.documents;
CREATE TRIGGER trg_documents_mark_proposal_signed
AFTER UPDATE OF status ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.auto_mark_proposal_signed();

DROP TRIGGER IF EXISTS trg_proposals_send_deposit ON public.proposals;
CREATE TRIGGER trg_proposals_send_deposit
AFTER UPDATE OF status ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.auto_send_deposit_on_proposal_signed();

DROP TRIGGER IF EXISTS trg_proposals_enqueue_production ON public.proposals;
CREATE TRIGGER trg_proposals_enqueue_production
AFTER UPDATE OF status ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.auto_enqueue_production_on_signed();

DROP TRIGGER IF EXISTS trg_proposals_star_sms_contact ON public.proposals;
CREATE TRIGGER trg_proposals_star_sms_contact
AFTER UPDATE OF status ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.star_sms_contact_on_proposal_signed();