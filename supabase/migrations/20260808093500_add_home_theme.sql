ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS home_theme text NOT NULL DEFAULT 'automatic';

ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS user_settings_home_theme_check;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_home_theme_check
  CHECK (
    home_theme IN (
      'automatic',
      'summer',
      'winter',
      'spring',
      'autumn',
      'easter',
      'christmas',
      'halloween',
      'classic'
    )
  );
