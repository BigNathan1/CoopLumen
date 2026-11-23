const fs = require('node:fs');

const reportPath = process.argv[2] ?? 'zap-report/report.json';
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const alerts = (report.site ?? []).flatMap((site) => site.alerts ?? []);
const blocking = alerts.filter((alert) => Number(alert.riskcode) >= 2);

for (const alert of blocking) {
  console.error(`[${alert.riskdesc ?? alert.riskcode}] ${alert.name ?? alert.alert}`);
}

if (blocking.length > 0) {
  console.error(`ZAP found ${blocking.length} medium-or-higher alert(s).`);
  process.exit(1);
}

console.log(`ZAP gate passed: ${alerts.length} alert(s), none medium or higher.`);
