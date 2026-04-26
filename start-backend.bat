@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%"
set "MODERATION_DIR=%ROOT_DIR%moderation_service"
set "SSL_DIR=%ROOT_DIR%.dev-ssl"
set "SSL_KEYSTORE=%SSL_DIR%\backend-local.p12"
set "PYTHON_EXE=%ROOT_DIR%.venv\Scripts\python.exe"

echo Starting Login Auth backend and AI moderation service...

if not exist "%PYTHON_EXE%" (
	echo [ERROR] Python virtual environment not found at:
	echo         %PYTHON_EXE%
	echo Create it first, then re-run this script.
	pause
	exit /b 1
)

if not exist "%SSL_DIR%" (
	mkdir "%SSL_DIR%"
)

if not exist "%SSL_KEYSTORE%" (
	echo Generating local HTTPS keystore for Spring Boot...
	keytool -genkeypair -alias auth-local -keyalg RSA -keysize 2048 -storetype PKCS12 -keystore "%SSL_KEYSTORE%" -storepass changeit -keypass changeit -dname "CN=localhost, OU=Dev, O=ai-pro, L=Local, S=Local, C=US" -validity 3650 -ext SAN=dns:localhost,ip:127.0.0.1
	if errorlevel 1 (
		echo [ERROR] Failed to generate the local HTTPS keystore.
		pause
		exit /b 1
	)
)

echo Starting AI Moderation Service in background (same terminal session)...
start "" /b cmd /c "cd /d %BACKEND_DIR% && %PYTHON_EXE% -m pip show uvicorn >nul 2>&1 || %PYTHON_EXE% -m pip install -r %MODERATION_DIR%\requirements.txt && %PYTHON_EXE% -m uvicorn moderation_service.app.main:app --host 127.0.0.1 --port 8000 --no-access-log"

echo Starting Spring Backend in foreground...
cd /d "%BACKEND_DIR%"
mvnw.cmd spring-boot:run

endlocal
