# DWB Frontend

React frontend aplikacija za DWB projekat.

## Pokretanje

Instalirajte dependencies:
```bash
npm install
# ili
yarn
```

Pokrenite development server:
```bash
npm start
# ili
yarn start
```

Aplikacija će biti dostupna na [http://localhost:3000](http://localhost:3000).

## Dostupne komande

- `npm start` / `yarn start` - Pokretanje development servera
- `npm test` / `yarn test` - Pokretanje testova
- `npm run build` / `yarn build` - Kreiranje production build-a
- `npm run eject` / `yarn eject` - Eject iz Create React App (OPREZ: ova komanda je nepovratna!)

## Struktura foldera

```
src/
  App.js          # Glavna App komponenta
  App.css         # Stilovi za App komponentu
  index.js        # Entry point aplikacije
  index.css       # Globalni stilovi
  App.test.js     # Testovi za App komponentu
  reportWebVitals.js  # Web vitals reporting
  setupTests.js   # Test setup
  logo.svg        # React logo
public/
  index.html      # HTML template
  manifest.json   # Web app manifest
```
