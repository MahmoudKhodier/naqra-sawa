/* Public settings for this deployment. Everything here is safe to publish:
   the Supabase anon key is meant to be public — Row Level Security protects the data. */
window.QS_CONFIG = {
  supabaseUrl: 'https://ecptsvagvauqpxtapwst.supabase.co',
  supabaseAnonKey: 'sb_publishable_zeF3lqeFoGOLcfZNbeOh3Q_U2CMhTdN', // public publishable key
  vapidPublicKey: '', // optional: enables push reminders in the installed web app
  apkUrl: 'https://github.com/MahmoudKhodier/naqra-sawa/releases/download/android-latest/naqra-sawa.apk',
  storageLimitMB: 1024, // free Supabase plan: 1 GB of file storage
};
// Optional: a free Google Books API key (console.cloud.google.com → APIs → Books API) for book search.
window.QS_CONFIG.googleBooksKey = '';
