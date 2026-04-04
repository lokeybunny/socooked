
## Videography B2B Outreach Hub

### 1. Database — `videography_prospects` table
- Columns: business_name, phone, address, website, contact_name, contact_role, contact_email, contact_phone, pipeline_stage (new → contacted → meeting_set → agreement_sent → contracted → active), agreement_doc_id, notes, next_followup_at, last_contacted_at, meta (jsonb), created/updated_at
- RLS: authenticated full access
- Seed with the 28 funeral homes/mortuaries from CSV

### 2. Frontend — `/videography` page
- Card-based prospect list with pipeline stage badges
- Click-to-call with phone dialer integration
- "Establish Contact" flow — set point of contact name/role/phone/email
- "Send Agreement" button — triggers the existing agreement workflow
- Pipeline stage progression buttons
- 7-day followup indicator (overdue = red badge)
- Bulk import option for future CSVs

### 3. Sidebar — Add "Videography" as standalone top-level item (Camera icon, green highlight like Real Estate/Websites)

### 4. Automated 7-day Reminders
- pg_cron job that checks `next_followup_at` daily
- Fires telegram-notify + creates activity_log entries for in-app notifications
- Auto-sets next_followup_at when contact is established

### 5. Inbound Pipeline
- Each contracted business gets a unique phone forwarding setup note
- Track which businesses are actively sending jobs
