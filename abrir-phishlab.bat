@echo off
rem ---------------------------------------------------------------------------
rem  PhishLab - lanzador
rem
rem  Doble clic. Arranca el servidor local y abre el navegador.
rem  Para parar: cierra esta ventana negra.
rem
rem  Node es lo que hace falta. Con Python la biblioteca se ve y se exporta
rem  igual, pero no se puede importar un .eml ni guardar plantillas propias:
rem  eso lo hace la API local, que corre sobre Node.
rem ---------------------------------------------------------------------------

setlocal
cd /d "%~dp0"

set PUERTO=8080
if not "%~1"=="" set PUERTO=%~1

echo.
echo   PhishLab - biblioteca para simulaciones autorizadas
echo   --------------------------------------------------
echo   Abriendo http://127.0.0.1:%PUERTO%/
echo.
echo   Deja esta ventana abierta mientras lo uses.
echo   Cierrala para parar el servidor.
echo.

where node >nul 2>&1
if %errorlevel%==0 (
    start "" "http://127.0.0.1:%PUERTO%/"
    node tools\servidor.js %PUERTO%
    goto :fin
)

where python >nul 2>&1
if %errorlevel%==0 (
    echo   AVISO: no hay Node en este equipo, se arranca con Python.
    echo   Funciona todo menos importar correos y guardar plantillas propias.
    echo.
    start "" "http://127.0.0.1:%PUERTO%/"
    python -m http.server %PUERTO% --bind 127.0.0.1
    goto :fin
)

echo   ERROR: no se ha encontrado Node en este equipo.
echo   Instalalo desde https://nodejs.org y vuelve a intentarlo.
echo.
pause

:fin
endlocal
