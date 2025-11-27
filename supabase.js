// frontend/supabase.js
// Конфигурация Supabase
const SUPABASE_URL = 'https://ryfzkqcijklmehxxtgtd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5ZnprcWNpamtsbWVoeHh0Z3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMjEyNTUsImV4cCI6MjA3ODg5NzI1NX0.YaLDvrdnxicdew9FiPl5THOWxrX5smtA6qgVAAighvE';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
