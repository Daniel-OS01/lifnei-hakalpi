# לפני הקלפי / Before the Ballot

**עברית.** מדריך בחירות אזרחי, ניטרלי ומבוסס מקורות. אתר סטטי (Vite) שנבנה מתצלום מאומת של מאגר המקור ומקבצי נתונים שנכתבים ביד, כל ערך עם קישור למקור. אין עוגיות, אנליטיקה או בקשות לצד שלישי.

**English.** A neutral, source-based Hebrew voter guide for Israeli elections. A static Vite site built from a hash-verified snapshot of the source database plus hand-curated files; every value links to its source. No cookies, analytics or third-party requests.

## Quick start

```
npm ci
npm run dev          # build data, start the dev server
npm test             # unit tests
npm run check        # dashes, election-agnostic code, data validation
npm run build        # production build into dist/
docker compose up --build   # serve on http://localhost:8080
```

Node 22 or newer.

## Docs

- [Architecture](docs/architecture.md)
- [Deploy (Dokploy, Docker, headers, rollback)](docs/deploy.md)
- [Update runbook (refresh data, add a statement, open the next election)](docs/update-runbook.md)
- [Repository settings (branch protection)](docs/repo-settings.md)
- [CHANGELOG](CHANGELOG.md)

Found a wrong statement? Open an issue with the form "דיווח על הצהרה שגויה".
