import { OrderItem, SupplyOrder } from "./api";

const VAT_RATE = 0.1;

function packUnitLabel(it: OrderItem) {
  return it.pack_size > 1 ? `${it.pack_size}입/${it.unit}` : it.unit;
}

function formatDateTime(iso?: string) {
  if (!iso) return "-";
  return iso.replace("T", " ").slice(0, 16);
}

function renderInvoiceHtml(items: OrderItem[], meta: { hospitalLabel: string; dateLabel: string; statusLabel: string }) {
  const rows = items
    .map((it) => {
      const supply = it.subtotal;
      const vat = Math.round(supply * VAT_RATE);
      const total = supply + vat;
      return `
      <tr>
        <td>${it.name}</td>
        <td style="text-align:right">${it.qty}</td>
        <td style="text-align:center">${packUnitLabel(it)}</td>
        <td style="text-align:right">${supply.toLocaleString()}원</td>
        <td style="text-align:right">${vat.toLocaleString()}원</td>
        <td style="text-align:right">${total.toLocaleString()}원</td>
      </tr>`;
    })
    .join("");

  const supplySum = items.reduce((s, it) => s + it.subtotal, 0);
  const vatSum = items.reduce((s, it) => s + Math.round(it.subtotal * VAT_RATE), 0);
  const totalSum = supplySum + vatSum;

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
        </style>
      </head>
      <body>
        <h1>발 주 서</h1>
        <div class="meta">
          <div class="date-row">발주일시: ${meta.dateLabel}</div>
          <div>병원명: ${meta.hospitalLabel}</div>
          <div>상태: ${meta.statusLabel}</div>
        </div>
        <table>
          <thead>
            <tr><th>품목</th><th style="text-align:right">수량</th><th style="text-align:center">개수단위/단위</th><th style="text-align:right">금액</th><th style="text-align:right">부가세</th><th style="text-align:right">총액</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totals">
          <div><span>공급가액 합계</span><span>${supplySum.toLocaleString()}원</span></div>
          <div><span>부가세 합계</span><span>${vatSum.toLocaleString()}원</span></div>
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
  const html = renderInvoiceHtml(items, {
    hospitalLabel: hospitalNames.join(", "),
    dateLabel: dateLabels,
    statusLabel: statuses.join(", "),
  });
  openAndPrint(html);
}
