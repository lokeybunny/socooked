UPDATE site_configs 
SET content = jsonb_set(
  jsonb_set(content::jsonb, '{discord_listen_channel_id}', '"1486405756591935508"'),
  '{discord_channel_id}', '"1486405756591935508"'
)
WHERE site_id = 'smm-auto-shill' AND section = 'NysonBlack';