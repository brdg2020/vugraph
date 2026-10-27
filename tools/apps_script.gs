/**
 * briçskor günlük güncelleme zamanlayıcısı (Google Apps Script)
 *
 * Bilgisayar açık olmadan çalışır: Google, belirlenen saatte GitHub Actions'taki
 * "Günlük skor güncellemesi" iş akışını başlatır. Asıl iş (vugraph'tan çekme,
 * double dummy, Firebase'e yayın) GitHub'ın sunucularında yapılır.
 *
 * Kurulum:
 *  1. Proje Ayarları → Saat dilimi: (GMT+03:00) İstanbul
 *  2. Proje Ayarları → Komut dosyası özellikleri → GITHUB_TOKEN = <GitHub token>
 *  3. "kur" fonksiyonunu bir kez çalıştırın (izin isteyecek, onaylayın)
 *  4. Test için "calistir" fonksiyonunu bir kez çalıştırın
 */
const OWNER = 'brdg2020';
const REPO = 'vugraph';
const WORKFLOW = 'gunluk.yml';

/** GitHub'daki güncelleme iş akışını başlatır. */
function calistir() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN tanımlı değil (Proje Ayarları → Komut dosyası özellikleri)');
  const res = UrlFetchApp.fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
      payload: JSON.stringify({ ref: 'main', inputs: { months: '2', en_cok: '60' } }),
      muteHttpExceptions: true,
    });
  const code = res.getResponseCode();
  console.log('GitHub yanıtı: ' + code + ' ' + res.getContentText());
  if (code !== 204) {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      'briçskor güncellemesi başlatılamadı',
      'GitHub yanıtı: ' + code + '\n' + res.getContentText() +
      '\n\nToken süresi dolmuş olabilir; yeni token alıp GITHUB_TOKEN özelliğini güncelleyin.');
  }
}

/** Zamanlayıcıları kurar: her gün 17:30, salı ayrıca 23:45 (İstanbul). Bir kez çalıştırın. */
function kur() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('calistir').timeBased()
    .everyDays(1).atHour(17).nearMinute(30).inTimezone('Europe/Istanbul').create();
  ScriptApp.newTrigger('calistir').timeBased()
    .onWeekDay(ScriptApp.WeekDay.TUESDAY).atHour(23).nearMinute(45).inTimezone('Europe/Istanbul').create();
  console.log('Kuruldu: her gün 17:30, salı 23:45');
}
