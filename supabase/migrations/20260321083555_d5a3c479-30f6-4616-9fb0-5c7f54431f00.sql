UPDATE site_configs 
SET content = content - 'last_message_id' 
WHERE site_id = 'smm-auto-shill' 
AND section = 'NysonBlack';