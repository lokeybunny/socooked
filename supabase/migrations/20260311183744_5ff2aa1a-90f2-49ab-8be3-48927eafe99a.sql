ALTER TABLE bookings DROP CONSTRAINT bookings_meeting_id_fkey;
ALTER TABLE bookings ADD CONSTRAINT bookings_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE;