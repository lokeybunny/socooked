ALTER TABLE conversation_threads 
DROP CONSTRAINT conversation_threads_channel_check;

ALTER TABLE conversation_threads 
ADD CONSTRAINT conversation_threads_channel_check 
CHECK (channel IN ('chat', 'email', 'call', 'sms', 'meeting', 'v0-designer', 'other'));