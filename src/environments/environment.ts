export const environment = {
  production: true,
  supabaseUrl: 'https://mjumxfgmipbdlhtlkxdv.supabase.co',
  supabaseAnonKey: 'sb_publishable_dbc6MXXszAU8wNGsK-pmZA_M0JG2Irv',
  // Chiave pubblica VAPID per le notifiche push (PWA): pubblica per
  // definizione, la privata sta solo nei secret delle Edge Function — vedi
  // database/38_push_subscriptions.sql. Vuota = notifiche push nascoste.
  vapidPublicKey: 'BFMzpk12qun0Fc78xN32gG9eSrmyWT-C49YnmpVpyqErY0ma2LVFnttN7Gl1e0cSF_Hz-VU8EwFGnSZMHgMNoJE',
};
