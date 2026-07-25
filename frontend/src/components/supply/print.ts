import { OrderItem, SupplyOrder } from "./api";

// 카탈로그 단가(따라서 it.subtotal, order.total_amount)는 부가세가 포함된 "실제 결제 금액" 기준이다.
// 즉 총액 = 11a, 공급가액 = 10a, 부가세 = a (a = 총액 / 11). 이전 코드는 반대로 subtotal을
// 부가세 "제외" 금액으로 보고 10%를 더 얹어(총액 = subtotal*1.1) 실제 청구액보다 부풀려 계산했었다.
function splitVat(totalInclusive: number): { supply: number; vat: number } {
  const supply = Math.round(totalInclusive / 1.1);
  return { supply, vat: totalInclusive - supply };
}

function formatDateTime(iso?: string) {
  if (!iso) return "-";
  return iso.replace("T", " ").slice(0, 16);
}

function renderInvoiceHtml(
  items: OrderItem[],
  meta: { hospitalLabel: string; dateLabel: string; statusLabel: string; orderRequest?: string | null; trueTotal: number }
) {
  const rows = items
    .map((it) => {
      const { supply, vat } = splitVat(it.subtotal);
      return `
      <tr>
        <td>${it.name}</td>
        <td>${it.manufacturer || "-"}</td>
        <td>${it.spec || "-"}</td>
        <td style="text-align:center">${it.unit}</td>
        <td style="text-align:right">${it.qty}</td>
        <td style="text-align:right">${supply.toLocaleString()}원</td>
        <td style="text-align:right">${vat.toLocaleString()}원</td>
        <td style="text-align:right">${it.subtotal.toLocaleString()}원</td>
      </tr>`;
    })
    .join("");

  // 품목별 금액을 그대로 합산한 값(itemTotalSum)과 실제 청구액(meta.trueTotal)이 다를 수 있다 —
  // 병원 등급 할인이 주문 전체에 적용된 경우. 이 경우 차액을 "할인 적용" 줄로 명시해서, 인쇄된
  // 발주서의 "총 합계"가 항상 실제 결제 금액(발주내역에 찍히는 금액)과 일치하도록 만든다.
  const itemTotalSum = items.reduce((s, it) => s + it.subtotal, 0);
  const { supply: supplySum, vat: vatSum } = splitVat(itemTotalSum);
  const discountAmount = itemTotalSum - meta.trueTotal;
  const totalSum = meta.trueTotal;

  return `
    <!DOCTYPE html>
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <title>발주서</title>
        <style>
          body { font-family: "Malgun Gothic", sans-serif; padding: 32px; color: #111; }
          h1 { font-size: 24px; text-align: center; margin-bottom: 20px; letter-spacing: 4px; }
          .meta { border-top: 2px solid #111; border-bottom: 1px solid #ccc; padding: 14px 4px; margin-bottom: 20px; font-size: 13px; }
          .meta .date-row { font-size: 15px; font-weight: bold; margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th, td { border-bottom: 1px solid #ddd; padding: 8px 6px; }
          th { text-align: left; background: #f5f5f5; }
          .totals { margin-top: 16px; margin-left: auto; width: 260px; font-size: 13px; }
          .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
          .totals .grand { font-size: 17px; font-weight: bold; border-top: 2px solid #111; margin-top: 4px; padding-top: 8px; }
          .request { margin: 14px 0; padding: 12px 14px; border: 2px solid #465fff; border-radius: 8px; background: #f5f7ff; }
          .request .label { font-size: 12px; font-weight: bold; color: #465fff; }
          .request .body { font-size: 18px; font-weight: bold; margin-top: 4px; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <h1>발 주 서</h1>
        <div class="meta">
          <div class="date-row">발주일시: ${meta.dateLabel}</div>
          <div>병원명: ${meta.hospitalLabel}</div>
          <div>상태: ${meta.statusLabel}</div>
        </div>
        ${meta.orderRequest ? `<div class="request"><div class="label">📌 병원 요청사항</div><div class="body">${meta.orderRequest.replace(/</g, "&lt;")}</div></div>` : ""}
        <table>
          <thead>
            <tr><th>품목</th><th>제조사</th><th>규격</th><th style="text-align:center">단위</th><th style="text-align:right">수량</th><th style="text-align:right">금액</th><th style="text-align:right">부가세</th><th style="text-align:right">총액</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totals">
          <div><span>공급가액 합계</span><span>${supplySum.toLocaleString()}원</span></div>
          <div><span>부가세 합계</span><span>${vatSum.toLocaleString()}원</span></div>
          ${discountAmount !== 0 ? `<div><span>할인 적용</span><span>-${discountAmount.toLocaleString()}원</span></div>` : ""}
          <div class="grand"><span>총 합계</span><span>${totalSum.toLocaleString()}원</span></div>
        </div>
      </body>
    </html>
  `;
}

function openAndPrint(html: string) {
  const win = window.open("", "_blank", "width=760,height=920");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

export function printOrder(order: SupplyOrder, hospitalName?: string) {
  const html = renderInvoiceHtml(order.items, {
    hospitalLabel: hospitalName || order.hospital_name || "-",
    dateLabel: formatDateTime(order.created_at),
    statusLabel: order.status,
    orderRequest: order.order_request,
    trueTotal: order.total_amount,
  });
  openAndPrint(html);
}

/** 선택한 여러 발주 건을 하나의 발주서로 묶어서 출력 (품목을 전부 합산). */
export function printOrders(orders: SupplyOrder[], hospitalName?: string) {
  if (orders.length === 0) return;
  if (orders.length === 1) {
    printOrder(orders[0], hospitalName);
    return;
  }
  const items = orders.flatMap((o) => o.items);
  const hospitalNames = Array.from(new Set(orders.map((o) => hospitalName || o.hospital_name || "-")));
  const dateLabels = orders.map((o) => formatDateTime(o.created_at)).join(", ");
  const statuses = Array.from(new Set(orders.map((o) => o.status)));
  const requests = orders.map((o) => o.order_request).filter(Boolean).join("\n---\n");
  const html = renderInvoiceHtml(items, {
    hospitalLabel: hospitalNames.join(", "),
    dateLabel: dateLabels,
    statusLabel: statuses.join(", "),
    orderRequest: requests || null,
    trueTotal: orders.reduce((s, o) => s + o.total_amount, 0),
  });
  openAndPrint(html);
}
