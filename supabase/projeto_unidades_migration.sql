-- Frações/unidades por Projeto (para ver custo por unidade nas estimativas)
ALTER TABLE projetos ADD COLUMN IF NOT EXISTS unidades jsonb;
