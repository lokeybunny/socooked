-- Drop the update-only trigger if it exists
DROP TRIGGER IF EXISTS on_top_gainer_flag ON public.market_cap_alerts;

-- Create trigger on INSERT to catch new top gainers
CREATE TRIGGER on_top_gainer_insert
AFTER INSERT ON public.market_cap_alerts
FOR EACH ROW
WHEN (NEW.is_top_gainer = true)
EXECUTE FUNCTION public.notify_top_gainer();

-- Also keep update trigger for when cleanup resets and re-flags
CREATE TRIGGER on_top_gainer_update
AFTER UPDATE ON public.market_cap_alerts
FOR EACH ROW
EXECUTE FUNCTION public.notify_top_gainer();