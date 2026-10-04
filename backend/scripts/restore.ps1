param(
  [Parameter(Mandatory = $true)][string]$BackupFile
)

if (-not (Test-Path $BackupFile)) {
  Write-Error "Arquivo de backup nao encontrado: $BackupFile"
  exit 1
}

psql `
  --host=$env:DB_HOST `
  --port=$env:DB_PORT `
  --username=$env:DB_USER `
  --dbname=$env:DB_NAME `
  --file=$BackupFile

if ($LASTEXITCODE -ne 0) {
  Write-Error "Falha no restore."
  exit $LASTEXITCODE
}

Write-Output "Restore concluido com sucesso."

