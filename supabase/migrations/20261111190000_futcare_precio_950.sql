-- FutCare: el precio vigente vuelve a $950 anuales (antes $800 desde 2-oct-2026).
-- programs.default_premium es lo que muestra el corporativo y lo que usan los nuevos planes de pago.
UPDATE public.programs
SET default_premium = 950
WHERE upper(code) = 'FUTCARE';
