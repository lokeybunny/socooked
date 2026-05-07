UPDATE powerdial_queue SET note = CASE phone
  WHEN '+16153471592' THEN 'Prices'
  WHEN '+18505270221' THEN 'Cool. I am looking for some photography/videography help now...do you do anything else besides AI videos?'
  WHEN '+17068103581' THEN 'Send some examples'
  WHEN '+17016405281' THEN 'Where are you located'
  WHEN '+17022745430' THEN 'Do you have two numbers?'
  WHEN '+19417258626' THEN 'Send us a sample'
  WHEN '+14065800622' THEN 'How much'
  WHEN '+12017413177' THEN 'Thank you for reaching out. Please send your company''s information and pricing to my email so I have the information for future reference. kathryngritz@kw.com'
  WHEN '+15052696217' THEN 'Thank you Warren'
  WHEN '+13862335900' THEN 'You say you''re local but I''m in three states where are you?'
  WHEN '+18036082911' THEN 'Local with out of State phone number? We are in SC'
END
WHERE campaign_id = '3eda95af-ff3f-4c43-a848-86b7354f8299';