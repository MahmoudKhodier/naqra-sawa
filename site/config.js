/* Public settings for this deployment. Everything here is safe to publish:
   the Supabase anon key is meant to be public — Row Level Security protects the data. */
window.QS_CONFIG = {
  supabaseUrl: '', // e.g. https://abcdefgh.supabase.co
  supabaseAnonKey: '', // the project's public "anon" key
  vapidPublicKey: '', // optional: enables push reminders in the installed web app
  apkUrl: '', // optional: link to the Android APK download
  storageLimitMB: 1024, // free Supabase plan: 1 GB of file storage
};
// Optional: a free Google Books API key (console.cloud.google.com → APIs → Books API) for book search.
window.QS_CONFIG.googleBooksKey = '';
