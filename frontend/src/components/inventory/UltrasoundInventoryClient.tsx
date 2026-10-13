"use client";

import { useState } from "react";
import InventoryClient, { SUBTYPES } from "./InventoryClient";
import CountClient from "./CountClient";
import { COUNT_ITEMS, CountItem } from "./api";

const TABS: string[] = [...SUBTYPES["지멘스"], ...COUNT_ITEMS];
const isCount = (t: string): t is CountItem => (COUNT_ITEMS as string[]).includes(t);

/** 초음파 재고 관리 = 장비 / 프로브 / ECG CABLE (표·카드) + LUMOS · 쉬스 (개수 카운터). */
export default function UltrasoundInventoryClient() {
  const [tab, setTab] = useState<string>(TABS[0]);

  return (
    <div className="space-y-3">
      <div className="seg w-full overflow-x-auto sm:w-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`seg-item flex-1 justify-center whitespace-nowrap sm:flex-none ${tab === t ? "seg-item-on" : ""}`}
          >
            {t}
          </button>
        ))}
      </div>
      {isCount(tab) ? <CountClient key={tab} item={tab} /> : <InventoryClient category="지멘스" itemType={tab} />}
    </div>
  );
}
