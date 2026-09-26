import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nxmcutaokxyrnvhyjvsj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_t-kse4BP5x_GuHSAP-UwiQ_auOcZ4Qz';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
