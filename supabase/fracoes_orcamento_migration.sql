-- ============================================================
-- Frações por Proposta (unidades com m² para custo por fração)
-- Corre no Supabase SQL Editor (seguro correr múltiplas vezes)
-- ============================================================

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS fracoes jsonb;
