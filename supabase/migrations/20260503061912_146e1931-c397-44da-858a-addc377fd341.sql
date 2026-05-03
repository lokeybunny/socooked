DROP TRIGGER IF EXISTS trg_auto_send_deposit_on_proposal_signed ON public.proposals;

CREATE TRIGGER trg_auto_send_deposit_on_proposal_signed
AFTER UPDATE OF status ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.auto_send_deposit_on_proposal_signed();