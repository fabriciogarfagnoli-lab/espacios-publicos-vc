// ===================================================================
// Configuración — completá con los datos de tu proyecto de Supabase
// (Supabase › Project Settings › API). La "anon key" es pública por
// diseño: la seguridad la dan las reglas (RLS) del archivo SQL.
// Si los dejás vacíos, la plataforma abre en MODO DEMOSTRACIÓN
// (solo lectura, con los datos de data/espacios.json).
// ===================================================================
window.VC_CONFIG = {
  SUPABASE_URL: "https://vdqjpxeijeqiqjqllbgo.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_eaIUN3qxYANt3qAX5ZrFaA_FqbjUAtu",
  TITULO: "Espacios Públicos",
  SUBTITULO: "Villa Constitución · estado de situación y mantenimiento",
  CENTRO: [-33.2335, -60.3255],
  ZOOM: 14
  // El PIN de edición NO va acá: se fija en Supabase con
  // select public.cambiar_pin('TU_PIN');  (ver 03_pin.sql)
};
