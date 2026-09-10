@echo off
rem ---------------------------------------------------------------------------
rem  PhishLab - lanzador
rem
rem  Doble clic. Arranca el servidor local y abre el navegador.
rem  Usa Python si esta instalado; si no, Node. Con cualquiera de los dos basta.
rem  Para parar: cierra esta ventana negra.
rem ---------------------------------------------------------------------------

setlocal
cd /d "%~dp0"

set PUERTO=8080
if not "%~1"=="" set PUERTO=%~1

echo.
echo   PhishLab - simulaciones de phishing autorizadas
echo   ----------------------------------------------
echo   Abriendo http://127.0.0.1:%PUERTO%/
echo.
echo   Deja esta ventana abierta mientras lo uses.
echo   Cierrala para parar el servidor.
echo.

start "" "http://127.0.0.1:%PUERTO%/"

where python >nul 2>&1
if %errorlevel%==0 (
    python -m http.server %PUERTO% --bind 127.0.0.1
    goto :fin
)

where node >nul 2>&1
if %errorlevel%==0 (
    node tools\servidor.js %PUERTO%
    goto :fin
)

echo   ERROR: no se ha encontrado ni Python ni Node en este equipo.
echo   Instala cualquiera de los dos y vuelve a intentarlo.
echo.
pause

:fin
endlocal
