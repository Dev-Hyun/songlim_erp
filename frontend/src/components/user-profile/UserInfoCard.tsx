"use client";
import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useModal } from "../../hooks/useModal";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Label from "../form/Label";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-800 dark:text-white/90">{value || "-"}</p>
    </div>
  );
}

export default function UserInfoCard() {
  const { user, refresh } = useAuth();
  const { isOpen, openModal, closeModal } = useModal();
  const [saving, setSaving] = useState(false);
  const isHospital = user?.role === "hospital";

  const [form, setForm] = useState({
    display_name: "",
    phone: "",
    email: "",
    department: "",
    position: "",
    hospital_dept: "",
    hospital_address: "",
    hospital_tel: "",
    ceo_name: "",
    ceo_phone: "",
  });

  function openEdit() {
    setForm({
      display_name: user?.display_name || "",
      phone: user?.phone || "",
      email: user?.email || "",
      department: user?.department || "",
      position: user?.position || "",
      hospital_dept: user?.hospital_dept || "",
      hospital_address: user?.hospital_address || "",
      hospital_tel: user?.hospital_tel || "",
      ceo_name: user?.ceo_name || "",
      ceo_phone: user?.ceo_phone || "",
    });
    openModal();
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`${API}/api/auth/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      await refresh();
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="w-full">
          <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-6">
            {isHospital ? "병원 정보" : "담당자 정보"}
          </h4>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7 2xl:gap-x-32">
            <Field label="담당자 이름" value={user?.display_name} />
            <Field label="연락처" value={user?.phone} />
            {isHospital ? (
              <>
                <Field label="병원명" value={user?.hospital_name} />
                <Field label="병원 구분" value={user?.hospital_type} />
                <Field label="담당 부서" value={user?.hospital_dept} />
                <Field label="병원 주소" value={user?.hospital_address} />
                <Field label="병원 전화" value={user?.hospital_tel} />
                <Field label="사업자등록번호" value={user?.business_reg_no} />
                <Field label="대표자명" value={user?.ceo_name} />
                <Field label="대표자 연락처" value={user?.ceo_phone} />
              </>
            ) : (
              <>
                <Field label="이메일" value={user?.email} />
                <Field label="부서" value={user?.department} />
                <Field label="직급" value={user?.position} />
              </>
            )}
          </div>
        </div>

        <button
          onClick={openEdit}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200 lg:inline-flex lg:w-auto"
        >
          수정
        </button>
      </div>

      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[700px] m-4">
        <div className="no-scrollbar relative w-full max-w-[700px] overflow-y-auto rounded-3xl bg-white p-4 dark:bg-gray-900 lg:p-11">
          <div className="px-2 pr-14">
            <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              정보 수정
            </h4>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 lg:mb-7">
              회원가입 시 입력한 정보를 최신 상태로 수정할 수 있습니다.
            </p>
          </div>
          <div className="flex flex-col">
            <div className="custom-scrollbar h-[450px] overflow-y-auto px-2 pb-3">
              <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                <div>
                  <Label>담당자 이름</Label>
                  <Input
                    type="text"
                    value={form.display_name}
                    onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>연락처</Label>
                  <Input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>

                {isHospital ? (
                  <>
                    <div>
                      <Label>담당 부서</Label>
                      <Input
                        type="text"
                        value={form.hospital_dept}
                        onChange={(e) => setForm({ ...form, hospital_dept: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>병원 전화</Label>
                      <Input
                        type="text"
                        value={form.hospital_tel}
                        onChange={(e) => setForm({ ...form, hospital_tel: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>병원 주소</Label>
                      <Input
                        type="text"
                        value={form.hospital_address}
                        onChange={(e) => setForm({ ...form, hospital_address: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>대표자명</Label>
                      <Input
                        type="text"
                        value={form.ceo_name}
                        onChange={(e) => setForm({ ...form, ceo_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>대표자 연락처</Label>
                      <Input
                        type="text"
                        value={form.ceo_phone}
                        onChange={(e) => setForm({ ...form, ceo_phone: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <Label>이메일</Label>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>부서</Label>
                      <Input
                        type="text"
                        value={form.department}
                        onChange={(e) => setForm({ ...form, department: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>직급</Label>
                      <Input
                        type="text"
                        value={form.position}
                        onChange={(e) => setForm({ ...form, position: e.target.value })}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 px-2 mt-6 lg:justify-end">
              <Button size="sm" variant="outline" onClick={closeModal}>
                취소
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
