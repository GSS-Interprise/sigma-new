-- Enable realtime for leads table to allow real-time status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;