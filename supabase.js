// ANTA Chat - Supabase Client Konfigürasyonu
// Dosya Yolu: anta-chat/supabase.js

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Kendi Supabase panelinizden aldığınız bilgileri buraya yapıştırın.
// Dashboard > Settings > API
const SUPABASE_URL = 'https://gogsivgxggllujlsifgh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvZ3Npdmd4Z2dsbHVqbHNpZmdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTcxNjksImV4cCI6MjA5NzI3MzE2OX0.WG-jxAwzMYatzXtKvGmi5boHTfJbi6L-X0c_oQLjNOU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
