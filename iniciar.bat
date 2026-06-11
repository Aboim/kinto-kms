@echo off
title KINTO KMS - Dashboard
echo ===================================================
echo Iniciando o Servidor (API + Base de Dados)...
start "KINTO Backend" cmd /c "node server.js & pause"
echo Iniciando a aplicacao KINTO KMS (Frontend)...
echo A sua janela no navegador vai abrir automaticamente.
echo ===================================================
npm run dev -- --open
pause
