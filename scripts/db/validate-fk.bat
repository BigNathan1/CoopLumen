@echo off
REM Usage: validate-fk.bat [database-url]
REM Validates all foreign key constraints have explicit ON DELETE behaviors

setlocal enabledelayedexpansion

REM Check if .env file exists and source it
if exist "..\backend\.env" (
    for /f "usebackq tokens=*" %%i in ("..\backend\.env") do (
        set "line=%%i"
        if not "!line:~0,1!"=="#" (
            set "var=!line:~0,1!"
            for /f "tokens=1,* delims==" %%a in ("!line!") do (
                set "%%a=%%b"
            )
        )
    )
)

REM Get database URL from argument or environment
if not "%1"=="" (
    set DATABASE_URL=%1
)

if "%DATABASE_URL%"=="" (
    echo DATABASE_URL is not set or provided as argument
    exit /b 1
)

echo Validating foreign key constraints in database...
echo Using DATABASE_URL: %DATABASE_URL%
echo.

REM Run the validation SQL script
psql "%DATABASE_URL%" -f "%~dp0validate-foreign-keys.sql"
if errorlevel 1 (
    echo Failed to validate foreign keys
    exit /b 1
)

echo.
echo Foreign key validation complete.
echo Review the output above for any warnings or recommendations.