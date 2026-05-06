-- Adiciona coluna para orçamento predefinido
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS projeto_default text;
