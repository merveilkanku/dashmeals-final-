import { createClient } from '@supabase/supabase-js';

// URL de votre projet Supabase
const DEFAULT_URL = 'https://xistgrankjxcaqypncar.supabase.co';
const supabaseUrl = (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) || import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
const supabaseKey = (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) || import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpc3RncmFua2p4Y2FxeXBuY2FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNDQ0NzIsImV4cCI6MjA4NjcyMDQ3Mn0.ApIRZ1awMUn2bqX8fIR5z28_XeMPDDs3_dI6MEAGSgo';

export const isDefaultProject = false;
// Note: Si vous recevez l'erreur "captcha verification process failed", 
// vous devez désactiver "Enable Captcha protection" dans votre dashboard Supabase :
// Authentication > Settings > Enable Captcha protection (à décocher)
export const supabase = createClient(supabaseUrl, supabaseKey);
