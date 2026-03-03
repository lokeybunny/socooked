CREATE TRIGGER on_top_gainer_flag
AFTER UPDATE ON public.market_cap_alerts
FOR EACH ROW
EXECUTE FUNCTION public.notify_top_gainer();