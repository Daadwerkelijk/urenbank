// Publieke gegevens van het Supabase-project. De publishable key is bedoeld om openbaar te zijn:
// de data is beschermd met rijbeveiliging (iedere gebruiker ziet alleen zijn eigen rijen).
export const SUPABASE_URL = 'https://wvtvcfmdkyzuptnuawuy.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_7EU_azIeiW6MaJoQ6y9qnQ_TrtuNbTN';
export const SCHEMA = 'urenbank';
// Agenda-abonnement (Edge Function 'urenbank-agenda'); de geheime token komt erachter.
export const AGENDA_FEED_URL = `${SUPABASE_URL}/functions/v1/urenbank-agenda?token=`;
