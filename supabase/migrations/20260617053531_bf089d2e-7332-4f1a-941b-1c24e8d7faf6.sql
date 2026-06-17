
REVOKE EXECUTE ON FUNCTION public.get_dashboard_kpis(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_top_debtors(uuid,int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_policy_distribution() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_action_items(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_recent_activity(uuid,int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_dashboard_mvs() FROM PUBLIC;
