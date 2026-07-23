import { SupplyOrder } from "./api";

export function printOrder(order: SupplyOrder, hospitalName?: string) {
  const win = window.open("", "_blank", "width=720,height=900");
  if (!win) return;

  const rows = order.items
    .map(
      (it) => `
      <tr>
        <td>${it.name}</td>
        <td style="text-align:right">${it.unit_price.toLocaleString()}원</td>
        <td style="text-align:right">${it.qty}${it.unit}</td>
        <td style="text-align:right">${it.subtotal.toLocaleString()}원</td>
      </tr>`
    )
    .join("");

  win.document.write(`
    <!DOCTYPE html>
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <title>발주서 #${order.id}</title>
        <style>
          body { font-family: "Malgun Gothic", sans-serif; padding: 32px; color: #111; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          .meta { color: #555; font-size: 13px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th, td { border-bottom: 1px solid #ddd; padding: 8px 6px; }
          th { text-align: left; background: #f5f5f5; }
          .total { text-align: right; font-size: 16px; font-weight: bold; margin-top: 16px; }
        </style>
      </head>
      <body>
        <h1>발주서 #${order.id}</h1>
        <div class="meta">
          ${hospitalName ? `병원명: ${hospitalName}<br/>` : ""}
          발주일: ${order.created_at?.slice(0, 10)}<br/>
          상태: ${order.status}${order.tracking_number ? ` · 송장번호 ${order.tracking_number}` : ""}
        </div>
        <table>
          <thead>
            <tr><th>품목</th><th style="text-align:right">단가</th><th style="text-align:right">수량</th><th style="text-align:right">소계</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="total">합계: ${order.total_amount.toLocaleString()}원</div>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}
