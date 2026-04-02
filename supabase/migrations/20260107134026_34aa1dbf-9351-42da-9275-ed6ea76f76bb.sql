-- Enable realtime for chips table
ALTER TABLE public.chips REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chips;