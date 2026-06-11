# KINTO KMS

Dashboard de gestao de quilometragem para contratos KINTO de leasing automovel.

## Stack

- **Frontend:** TypeScript, Chart.js, CSS customizado
- **Backend:** Express 5, SQLite (node:sqlite)
- **Desktop:** Electron
- **Mobile:** Capacitor (Android)
- **OCR:** Tesseract.js (leitura de odometro por foto)
- **Export:** jsPDF + jspdf-autotable (PDF), xlsx (Excel)

## Funcionalidades

- Multi-veiculos com gestao por matricula
- Registo de quilometragem com data
- Leitura OCR de odometro via foto (Tesseract.js)
- Grafico de uso mensal (Chart.js)
- Analise de sazonalidade (este ano vs ano anterior)
- Projecoes de fim de contrato com custo de excesso
- Gestao de contratos (matricula, inicio, duracao, limite KM)
- Renovacao de contrato com preservacao de historico
- Export: JSON, PDF, Excel
- Sincronizacao entre dispositivos (export/import JSON com merge)
- Alertas inteligentes de aproximacao de limite
- Toggle tema claro/escuro
- Detecao de offline

## Instalacao

```bash
npm install
```

## Executar

```bash
npm run dev
```

## Estrutura

| Ficheiro | Descricao |
|----------|-----------|
| `src/main.ts` | Logica principal (999 linhas) |
| `src/types.ts` | Tipos TypeScript |
| `src/api.ts` | Comunicacao com backend |
| `src/calculations.ts` | Projecoes e estatisticas |
| `server.js` | Backend Express + API |
| `electron-main.cjs` | Electron main process |
