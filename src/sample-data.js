function tokyoDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  return values.year + "-" + values.month + "-" + values.day;
}

function dateAfter(days) {
  const values = tokyoDateKey().split("-").map(Number);
  const date = new Date(Date.UTC(values[0], values[1] - 1, values[2] + days));
  return date.toISOString().slice(0, 10);
}

export const SAMPLE_EVENTS = [
  { id: "sample-fps-1", title: "FPS大会A・グループステージ", genre: "fps", genreLabel: "FPS・eスポーツ", date: dateAfter(3), startTime: "14:00", endTime: "16:00", description: "架空の大会サンプルです。検索結果から日付と時間を引き継いで登録できます。" },
  { id: "sample-mahjong-1", title: "麻雀リーグB・第3節", genre: "mahjong", genreLabel: "麻雀リーグ", date: dateAfter(3), startTime: "19:00", endTime: "21:00", description: "架空のリーグ戦サンプルです。実在の対戦カードや日程ではありません。" },
  { id: "sample-fps-2", title: "FPS大会A・プレーオフ", genre: "fps", genreLabel: "FPS・eスポーツ", date: dateAfter(7), startTime: "15:00", endTime: "17:00", description: "架空の大会サンプルです。" },
  { id: "sample-mahjong-2", title: "麻雀リーグB・注目カード", genre: "mahjong", genreLabel: "麻雀リーグ", date: dateAfter(7), startTime: "20:00", endTime: "22:00", description: "架空のリーグ戦サンプルです。" },
  { id: "sample-fps-3", title: "FPS大会C・決勝戦", genre: "fps", genreLabel: "FPS・eスポーツ", date: dateAfter(14), startTime: "15:00", endTime: "17:00", description: "架空の決勝戦サンプルです。" },
  { id: "sample-mahjong-3", title: "麻雀リーグB・第4節", genre: "mahjong", genreLabel: "麻雀リーグ", date: dateAfter(14), startTime: "20:00", endTime: "22:00", description: "架空のリーグ戦サンプルです。" },
  { id: "sample-fps-4", title: "FPS大会C・ファイナルウィーク", genre: "fps", genreLabel: "FPS・eスポーツ", date: dateAfter(21), startTime: "14:00", endTime: "16:00", description: "架空の大会サンプルです。" },
  { id: "sample-mahjong-4", title: "麻雀リーグD・シーズンマッチ", genre: "mahjong", genreLabel: "麻雀リーグ", date: dateAfter(22), startTime: "19:00", endTime: "21:00", description: "架空のリーグ戦サンプルです。" }
];

export const SAMPLE_BUSY_BLOCKS = [
  { date: dateAfter(3), start: "09:00", end: "12:00" },
  { date: dateAfter(3), start: "17:00", end: "18:30" },
  { date: dateAfter(7), start: "10:00", end: "13:00" },
  { date: dateAfter(7), start: "17:30", end: "19:30" },
  { date: dateAfter(14), start: "09:00", end: "12:00" },
  { date: dateAfter(14), start: "17:00", end: "19:00" },
  { date: dateAfter(21), start: "09:00", end: "13:00" },
  { date: dateAfter(21), start: "18:00", end: "20:00" },
  { date: dateAfter(22), start: "09:00", end: "18:30" }
];

export const SAMPLE_AVAILABILITY_DATES = [3, 7, 14, 21, 22].map(dateAfter);
