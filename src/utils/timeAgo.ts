// Hien thi thoi gian theo NHIEU BAC do chi tiet khac nhau, cang cu cang bot
// chi tiet - giong cach Google Drive/Slack lam. Ban truoc chi co 2 bac (phut,
// gio) nen file sua 4 ngay truoc hien ra "98 giờ trước": dung ve mat so hoc
// nhung nguoi doc phai tu nham tinh ra bao nhieu ngay.
//
// Cac bac:
//   < 1 phut        -> "Vừa xong"
//   < 60 phut       -> "5 phút trước"
//   < 24 gio        -> "3 giờ trước"
//   < 7 ngay        -> "4 ngày trước"
//   cung nam        -> "2 thg 8"
//   khac nam        -> "2 thg 8, 2025"
//
// Moc 7 ngay: qua moc nay thi "12 ngày trước" khong con giup dinh vi duoc nua,
// mot ngay thang cu the de doi chieu hon.
//
// "now" nhan vao duoc (mac dinh la hien tai) de test co the co dinh moc thoi
// gian, khong phu thuoc luc chay.
export function timeAgo(date: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);

  // Thoi gian am (dong ho may lech, hoac ban ghi tu server o mui khac) - coi
  // nhu vua xong, KHONG hien "-3 phút trước".
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;

  const ngayThang = `${date.getDate()} thg ${date.getMonth() + 1}`;
  // Chi kem nam khi KHAC nam hien tai - trong cung nam thi nam la thua.
  return date.getFullYear() === now.getFullYear()
    ? ngayThang
    : `${ngayThang}, ${date.getFullYear()}`;
}

/**
 * Moc thoi gian day du - dung cho tooltip, vi timeAgo() la ban rut gon co chu y.
 * Ghep tay thay vi de toLocaleString() tu quyet dinh thu tu: voi locale "vi-VN"
 * no tra ve "09:05 02/08/2026" (gio truoc ngay), doc kho hon.
 */
export function fullTimestamp(date: Date): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(date.getDate())}/${p2(date.getMonth() + 1)}/${date.getFullYear()}`
    + ` ${p2(date.getHours())}:${p2(date.getMinutes())}`;
}
