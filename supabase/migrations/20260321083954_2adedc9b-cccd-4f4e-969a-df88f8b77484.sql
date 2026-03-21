UPDATE site_configs 
SET content = jsonb_build_object(
  'campaign_url', content->>'campaign_url',
  'discord_app_id', content->>'discord_app_id',
  'discord_channel_id', '1484699554271072257',
  'discord_reply_channel_id', '1484830617966481512',
  'discord_public_key', content->>'discord_public_key',
  'enabled', (content->>'enabled')::boolean,
  'retweet_accounts', content->'retweet_accounts',
  'team_accounts', content->'team_accounts',
  'ticker', content->>'ticker'
)
WHERE site_id = 'smm-auto-shill' 
AND section = 'NysonBlack';