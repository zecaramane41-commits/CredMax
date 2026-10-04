export function downloadTextFile(filename: string, content: string, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function toCsv(rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) return "";
  let companyName = "Empresa";
  let userName = "Sistema";
  let userRole = "-";
  try {
    const userRaw = localStorage.getItem("microcredit_user");
    const companyRaw = localStorage.getItem("microcredit_company_profile");
    if (userRaw) {
      const user = JSON.parse(userRaw) as { fullName?: string; role?: string; companyName?: string };
      userName = user?.fullName || userName;
      userRole = user?.role || userRole;
      companyName = user?.companyName || companyName;
    }
    if (companyRaw) {
      const company = JSON.parse(companyRaw) as { name?: string };
      companyName = company?.name || companyName;
    }
  } catch {
    // keep defaults
  }
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const lines = [
    `"# Empresa: ${String(companyName)}"`,
    `"# Gerado por: ${String(userName)}"`,
    `"# Funcao: ${String(userRole)}"`,
    `"# Data/Hora: ${new Date().toLocaleString("pt-PT")}"`,
    "",
    headers.join(","),
  ];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h] ?? "")).join(","));
  }
  return lines.join("\n");
}
