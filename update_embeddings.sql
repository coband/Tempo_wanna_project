-- SQL-Skript zur Rücksetzung aller Embeddings
UPDATE books SET embedding = NULL;
-- Alternativ: UPDATE books SET embedding = NULL WHERE publisher LIKE '%Carlsen%';
