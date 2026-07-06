// Supabase istemcisi + oturum yardımcıları (Faz 1).
// URL/anahtar build sırasında .env'den gömülür (VITE_*). Anahtar publishable
// tiptir: tarayıcıya gömülmesi tasarım gereği güvenlidir, veriyi RLS korur.
// Yapılandırma yoksa (env boş) uygulama localStorage moduna düşer — store.js bakar.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

export const supabase = (url && key) ? createClient(url, key) : null;
export function isCloud() { return supabase !== null; }

// Girişli kullanıcının profili: { user_id, full_name, role } | null
export async function getProfile() {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data, error } = await supabase
        .from('profiles').select('*').eq('user_id', session.user.id).maybeSingle();
    if (error) throw new Error(error.message);
    // Profili henüz açılmamış kullanıcı: e-postayı ad say, rol=uretim (en dar yetki)
    return data ?? { user_id: session.user.id, full_name: session.user.email, role: 'uretim' };
}

export async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return getProfile();
}

export async function signOut() {
    if (supabase) await supabase.auth.signOut();
}

// PostgREST hata sarmalayıcı — çağrı yerlerini sadeleştirir
export function unwrap({ data, error }) {
    if (error) throw new Error(error.message);
    return data;
}
