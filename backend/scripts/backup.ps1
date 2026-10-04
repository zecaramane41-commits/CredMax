param(
  [Parameter(Mandatory = $true)][string]$OutputDir,
  [Parameter(Mandatory = $false)][string]$FilePrefix = "microcredit"
)

if (-not (Test-Path $OutputDir)) {
  New-Item -Path $OutputDir -ItemType Directory | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$file = Join-Path $OutputDir "$FilePrefix-$timestamp.sql"

pg_dump `
  --host=$env:DB_HOST `
  --port=$env:DB_PORT `
  --username=$env:DB_USER `
  --dbname=$env:DB_NAME `
  --format=plain `
  --file=$file

if ($LASTEXITCODE -ne 0) {
  Write-Error "Falha no backup."
  exit $LASTEXITCODE
}

Write-Output "Backup concluido: $file"

