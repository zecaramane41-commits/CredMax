# Plano de Continuidade (BCP/DR)

## Objetivos
- RPO alvo: 15 minutos.
- RTO alvo: 2 horas.

## Rotina operacional
1. Backup incremental: a cada 15 minutos.
2. Backup full: diario (fora do horario de pico).
3. Teste de restore: semanal, com checklist funcional.
4. Drill de continuidade: mensal, com registo em `system_backup_jobs`.

## Passos de recuperacao
1. Isolar incidente e congelar alteracoes.
2. Restaurar ultimo backup valido:
   - `powershell -ExecutionPolicy Bypass -File backend/scripts/restore.ps1 -BackupFile <arquivo.sql>`
3. Executar validacao:
   - login + dashboard risco
   - listagem de clientes/emprestimos
   - conciliacao externa
4. Reabrir operacao e monitorar por 24h.

## Evidencias obrigatorias
- ID do job em `system_backup_jobs`.
- Tempo real de restore.
- Resultado dos testes de validacao.
- Acoes corretivas quando houver falha.

