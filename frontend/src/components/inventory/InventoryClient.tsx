"use client";

import { useEffect, useMemo, useState } from "react";
import { InvEquipmentRow, createEquipment, deleteEquipment, fetchEquipment, updateEquipment } from "./api";

const SUBTYPES: Record<"지멘스" | "타사", string[]> = {
  지멘스: ["장비", "EKG", "프로브"],
  타사: ["신품", "중고", "데모"],
};

function emptyRow(category: "지멘스" | "타사", itemType: string): Omit<InvEquipmentRow, "id"> {
  return {
    category, item_type: itemType, grade: null, name: "", serial_no: null, location: null,
    notes: null, manufacture_date: null, manufacturer: null, purchase_price: null,
    purchase_from: null, is_opened: false,
  };
}

export default function InventoryClient({ category }: { category: "지멘스" | "타사" }) {
  const [rows, setRows] = useState<InvEquipmentRow[]>([]);
  const [itemType, setItemType] = useState(SUBTYPES[category][0]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetchEquipment(category).then(setRows).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (r.item_type !== itemType) return false;
        if (!query) return true;
        const hay = `${r.name} ${r.location || ""} ${r.serial_no || ""} ${r.notes || ""} ${r.manufacturer || ""}`;
        return hay.includes(query);
      }),
    [rows, itemType, query]
  );

  async function saveRow(row: InvEquipmentRow) {
    const { id, ...payload } = row;
    if (id < 0) {
      const created = await createEquipment(payload);
      setRows((prev) => prev.map((r) => (r.id === id ? created : r)));
    } else {
      await updateEquipment(id, payload);
    }
  }

  function updateCell(id: number, key: keyof InvEquipmentRow, value: string | boolean) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  }

  async function toggleOpened(row: InvEquipmentRow) {
    const updated = { ...row, is_opened: !row.is_opened };
    setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    if (row.id > 0) {
      const { id, ...payload } = updated;
      await updateEquipment(id, payload);
    }
  }

  function addRow() {
    setRows((prev) => [...prev, { ...emptyRow(category, itemType), id: -Date.now() }]);
  }

  async function removeRow(row: InvEquipmentRow) {
    if (!confirm("삭제하시겠습니까?")) return;
    if (row.id > 0) await deleteEquipment(row.id);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  }

  // 지멘스(장비/EKG/프로브)는 모두 동일한 컬럼 구성(등급·개봉 포함), 타사는 제조사·매입정보 표시
  const showGrade = category === "지멘스";
  const showOpened = category === "지멘스";
  const showManufacturer = category === "타사";

  const cell = (row: InvEquipmentRow, key: keyof InvEquipmentRow, placeholder = "", widthClass = "min-w-[80px]") => (
    <input
      value={(row[key] as string) || ""}
      onChange={(e) => updateCell(row.id, key, e.target.value)}
      onBlur={() => saveRow(row)}
      placeholder={placeholder}
      className={`w-full ${widthClass} bg-transparent px-1.5 py-2.5 text-sm focus:rounded focus:bg-brand-50 focus:outline-none dark:focus:bg-brand-500/10`}
    />
  );

  const GRADE_COLOR: Record<string, string> = {
    L: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
    H: "bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400",
  };

  const gradeCell = (row: InvEquipmentRow) => (
    <input
      value={row.grade || ""}
      onChange={(e) => updateCell(row.id, "grade", e.target.value)}
      onBlur={() => saveRow(row)}
      placeholder="L/H"
      className={`w-14 rounded-md px-1.5 py-1 text-center text-xs font-bold focus:outline-none ${
        row.grade && GRADE_COLOR[row.grade] ? GRADE_COLOR[row.grade] : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
      }`}
    />
  );

  // 두 재고 페이지(초음파=지멘스 / 장비=타사)가 색이 같아 구분이 안 된다는 요청 → 카테고리별 강조색 부여.
  const ac = category === "지멘스"
    ? { tab: "bg-brand-500", add: "bg-brand-500 hover:bg-brand-600", head: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300", rowHover: "hover:bg-brand-50/60 dark:hover:bg-brand-500/[0.06]", bar: "border-t-4 border-brand-500" }
    : { tab: "bg-teal-500", add: "bg-teal-500 hover:bg-teal-600", head: "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300", rowHover: "hover:bg-teal-50/60 dark:hover:bg-teal-500/[0.06]", bar: "border-t-4 border-teal-500" };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]">
          {SUBTYPES[category].map((t) => (
            <button
              key={t}
              onClick={() => setItemType(t)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${itemType === t ? `${ac.tab} text-white` : "text-gray-500"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름/위치/시리얼/비고 검색..."
          className="w-56 rounded-full border border-gray-300 bg-gray-50 px-3.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        />
        <button onClick={addRow} className={`ml-auto rounded-full ${ac.add} px-4 py-1.5 text-xs font-bold text-white`}>
          + 행 추가
        </button>
      </div>

      <div className={`overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${ac.bar}`}>
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b-2 border-gray-200 text-left text-xs font-bold uppercase tracking-wide dark:border-gray-800 ${ac.head}`}>
                {showGrade && <th className="w-16 px-2 py-3">등급</th>}
                <th className="w-32 px-2 py-3">이름</th>
                {showManufacturer && <th className="w-28 px-2 py-3">제조사</th>}
                <th className="w-32 px-2 py-3">S/N</th>
                <th className={`${category === "지멘스" ? "w-[160px]" : ""} px-2 py-3`}>비고</th>
                <th className={`${category === "지멘스" ? "w-[150px]" : "w-32"} px-2 py-3`}>위치</th>
                <th className={`${category === "지멘스" ? "w-[140px]" : "w-24"} px-2 py-3`}>제조년월</th>
                {showManufacturer && <th className="w-24 px-2 py-3">매입가</th>}
                {showManufacturer && <th className="w-28 px-2 py-3">매입처</th>}
                {showOpened && <th className="w-14 px-2 py-3">개봉</th>}
                <th className="w-8 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <tr
                  key={row.id}
                  className={`border-b border-gray-100 dark:border-gray-800 ${
                    idx % 2 === 1 ? "bg-gray-50/60 dark:bg-white/[0.015]" : ""
                  } ${ac.rowHover}`}
                >
                  {showGrade && <td className="px-2 py-1">{gradeCell(row)}</td>}
                  <td className="px-2 py-1 font-medium text-gray-700 dark:text-gray-200">{cell(row, "name", "장비명", "min-w-[60px]")}</td>
                  {showManufacturer && <td className="px-2 py-1">{cell(row, "manufacturer", "", "min-w-[80px]")}</td>}
                  <td className="px-2 py-1 font-mono text-xs">{cell(row, "serial_no", "", "min-w-[80px]")}</td>
                  <td className="px-2 py-1 text-gray-500 dark:text-gray-400">{cell(row, "notes", "", category === "지멘스" ? "min-w-[160px]" : "min-w-[180px]")}</td>
                  <td className="px-2 py-1">{cell(row, "location", "", category === "지멘스" ? "min-w-[150px]" : "min-w-[90px]")}</td>
                  <td className="px-2 py-1">{cell(row, "manufacture_date", "", category === "지멘스" ? "min-w-[140px]" : "min-w-[70px]")}</td>
                  {showManufacturer && <td className="px-2 py-1">{cell(row, "purchase_price", "", "min-w-[70px]")}</td>}
                  {showManufacturer && <td className="px-2 py-1">{cell(row, "purchase_from", "", "min-w-[80px]")}</td>}
                  {showOpened && (
                    <td className="px-2 py-1 text-center">
                      <button
                        onClick={() => toggleOpened(row)}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          row.is_opened
                            ? "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400"
                            : "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400"
                        }`}
                        title="클릭하여 개봉 상태 변경"
                      >
                        {row.is_opened ? "개봉" : "미개봉"}
                      </button>
                    </td>
                  )}
                  <td className="px-2 py-1 text-center">
                    <button onClick={() => removeRow(row)} className="text-error-500">×</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-xs text-gray-400">
                    항목이 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
