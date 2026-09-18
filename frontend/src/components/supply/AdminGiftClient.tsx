"use client";

import { useEffect, useState } from "react";
import {
  AdminGiftTier,
  GradeRow,
  adminAddGiftItem,
  adminCreateGiftGrade,
  adminCreateGiftTier,
  adminDeleteGiftItem,
  adminDeleteGiftTier,
  adminDeleteGrade,
  adminFetchGiftTiers,
  fetchGrades,
} from "./api";

const inputCls = "field";

export default function AdminGiftClient() {
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [tiers, setTiers] = useState<AdminGiftTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGrade, setNewGrade] = useState({ grade_code: "", label: "" });
  const [newThreshold, setNewThreshold] = useState("");
  const [newItemName, setNewItemName] = useState<Record<number, string>>({});

  function load() {
    setLoading(true);
    Promise.all([fetchGrades(), adminFetchGiftTiers()])
      .then(([g, t]) => { setGrades(g.filter((r) => r.grade_type === "gift")); setTiers(t); })
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function addGiftGrade() {
    if (!newGrade.grade_code || !newGrade.label) return;
    await adminCreateGiftGrade(newGrade);
    setNewGrade({ grade_code: "", label: "" });
    load();
  }

  async function deleteGiftGrade(code: string) {
    if (!confirm("삭제하시겠습니까? 이 등급을 사용 중인 병원의 사은품 지정이 해제됩니다.")) return;
    await adminDeleteGrade(code);
    load();
  }

  async function addTier() {
    const amount = Number(newThreshold);
    if (!amount || amount <= 0) return;
    await adminCreateGiftTier({ threshold_amount: amount, sort_order: tiers.length });
    setNewThreshold("");
    load();
  }

  async function deleteTier(id: number) {
    if (!confirm("이 구간과 구간에 속한 사은품이 모두 삭제됩니다. 삭제하시겠습니까?")) return;
    await adminDeleteGiftTier(id);
    load();
  }

  async function addItem(tierId: number) {
    const name = (newItemName[tierId] || "").trim();
    if (!name) return;
    const tier = tiers.find((t) => t.id === tierId);
    await adminAddGiftItem(tierId, { name, sort_order: tier?.items.length || 0 });
    setNewItemName((prev) => ({ ...prev, [tierId]: "" }));
    load();
  }

  async function deleteItem(id: number) {
    await adminDeleteGiftItem(id);
    load();
  }

  if (loading) return <div className="empty-state">불러오는 중...</div>;

  const sortedTiers = [...tiers].sort((a, b) => a.threshold_amount - b.threshold_amount);

  return (
    <div className="space-y-4">
      <div className="surface-card p-3">
        <h3 className="card-title mb-1">사은품 대상 등급</h3>
        <p className="mb-3 fg-subtle text-ui-xs">
          병원 관리 화면에서 병원별로 지정하는 &quot;사은품 등급&quot; 목록입니다. 이 등급이 지정된 병원만 발주 시 사은품을 선택할 수 있습니다.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {grades.map((g) => (
            <span key={g.grade_code} className="chip">
              {g.label} ({g.grade_code})
              <button onClick={() => deleteGiftGrade(g.grade_code)} className="text-error-600 dark:text-error-400">×</button>
            </span>
          ))}
          {grades.length === 0 && <span className="fg-subtle text-ui-xs">등록된 사은품 등급이 없습니다</span>}
        </div>
        <div className="flex gap-2">
          <input value={newGrade.grade_code} onChange={(e) => setNewGrade({ ...newGrade, grade_code: e.target.value })} placeholder="코드 (예: GIFT1)" className={inputCls} />
          <input value={newGrade.label} onChange={(e) => setNewGrade({ ...newGrade, label: e.target.value })} placeholder="라벨 (예: 사은품 대상)" className={inputCls} />
          <button onClick={addGiftGrade} className="btn btn-default">등급 추가</button>
        </div>
      </div>

      <div className="surface-card p-3">
        <h3 className="card-title mb-1">사은품 구간 설정</h3>
        <p className="mb-3 fg-subtle text-ui-xs">
          발주 합계금액이 구간 금액 이상이면 그 구간 이하 모든 구간의 사은품이 선택지에 합류합니다 (예: 30만원 구간에는 10만원 구간 사은품도 포함).
        </p>
        <div className="mb-4 flex gap-2">
          <input
            type="number"
            value={newThreshold}
            onChange={(e) => setNewThreshold(e.target.value)}
            placeholder="구간 금액 (예: 100000)"
            className={inputCls + " w-48"}
          />
          <button onClick={addTier} className="btn btn-default">구간 추가</button>
        </div>

        {sortedTiers.length === 0 ? (
          <div className="empty-state">등록된 사은품 구간이 없습니다</div>
        ) : (
          <div className="space-y-3">
            {sortedTiers.map((t) => (
              <div key={t.id} className="surface-sub hairline rounded-card border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="fg-strong text-ui font-medium tabular-nums">{t.threshold_amount.toLocaleString()}원 이상</span>
                  <button onClick={() => deleteTier(t.id)} className="text-ui-sm font-medium text-error-600 hover:underline dark:text-error-400">구간 삭제</button>
                </div>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {t.items.map((it) => (
                    <span key={it.id} className="chip">
                      🎁 {it.name}
                      <button onClick={() => deleteItem(it.id)} className="text-error-600 dark:text-error-400">×</button>
                    </span>
                  ))}
                  {t.items.length === 0 && <span className="fg-subtle text-ui-xs">등록된 사은품이 없습니다</span>}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newItemName[t.id] || ""}
                    onChange={(e) => setNewItemName((prev) => ({ ...prev, [t.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addItem(t.id); }}
                    placeholder="사은품 이름 입력"
                    className={inputCls + " flex-1"}
                  />
                  <button onClick={() => addItem(t.id)} className="btn btn-default">추가</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
