/**
 * 로컬(기기 시간대 = 한국이면 KST) 기준 YYYY-MM-DD 문자열.
 *
 * `new Date().toISOString().slice(0,10)`은 UTC로 변환되므로 한국(UTC+9)에서는 자정~오전 9시 사이에
 * 날짜가 하루 전으로 밀린다. "오늘/이 달" 같은 로컬 캘린더 날짜에는 항상 이 함수를 사용한다.
 */
export function localISODate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
