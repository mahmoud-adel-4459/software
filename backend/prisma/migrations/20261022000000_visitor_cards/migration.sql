ALTER TABLE visitor_visits ADD COLUMN card_no INTEGER CHECK (card_no IS NULL OR card_no BETWEEN 1 AND 24);
CREATE UNIQUE INDEX visitor_card_open_visit ON visitor_visits(card_no) WHERE check_out IS NULL AND voided = 0;
