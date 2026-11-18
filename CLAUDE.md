# Investment Tool – Hinweise für Claude

- Jede Zahl kommt aus `src/lib/model/calc.ts`. Änderungen an Rechenregeln immer auch in `src/lib/export/excel.ts` nachziehen und `npm test` + `npm run verify:excel` laufen lassen.
- Kaufpreis ist die einzige gespeicherte Preisgröße (Regler-Kopplung über `kaufpreisFrom`).
- Oberfläche auf Deutsch, Zahlen deutsch formatiert (`src/lib/format.ts`).
- Daten liegen nur im localStorage des Browsers.
