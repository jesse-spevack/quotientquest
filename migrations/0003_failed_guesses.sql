CREATE TABLE failed_guesses (
  key TEXT PRIMARY KEY,
  day INTEGER NOT NULL,
  count INTEGER NOT NULL
);

CREATE INDEX failed_guesses_by_day ON failed_guesses (day);
