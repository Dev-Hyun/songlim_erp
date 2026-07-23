"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Button from "@/components/ui/button/Button";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "@/icons";
import Link from "next/link";
import React, { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

const DEPARTMENTS = ["관리자", "총무팀", "동물사업부", "초음파임상팀", "영업팀", "기술팀"];
const POSITIONS = ["회장", "사장", "상무", "이사", "부장", "과장", "팀장", "대리", "주임", "사원"];
const HOSPITAL_TYPES = ["의원", "병원", "대학병원", "동물병원"];

type Role = "songrim" | "hospital";

interface HospitalSearchResult {
  name: string;
  tel: string | null;
  sido: string;
  sigungu: string;
  ykiho: string;
}

export default function SignUpForm() {
  const [role, setRole] = useState<Role>("songrim");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // 송림 직원
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [position, setPosition] = useState(POSITIONS[0]);

  // 병원 회원 — 병원명 검색(심평원/동물병원 API) 자동완성. 매칭 시 이름/전화번호만 자동입력, 나머지는 수동입력 (DB구성요청서 3-1)
  const [hospitalType, setHospitalType] = useState(HOSPITAL_TYPES[0]);
  const [hospitalName, setHospitalName] = useState("");
  const [hospitalDept, setHospitalDept] = useState("");
  const [hospitalAddress, setHospitalAddress] = useState("");
  const [hospitalTel, setHospitalTel] = useState("");
  const [businessRegNo, setBusinessRegNo] = useState("");
  const [ceoName, setCeoName] = useState("");
  const [ceoPhone, setCeoPhone] = useState("");
  const [matchedYkiho, setMatchedYkiho] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<HospitalSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function searchHospital() {
    if (!hospitalName.trim()) return;
    setSearching(true);
    setMatchedYkiho(null);
    try {
      const params = new URLSearchParams({ q: hospitalName.trim(), hospital_type: hospitalType });
      const res = await fetch(`${API}/api/hospital-search?${params.toString()}`, { credentials: "include" });
      const data = res.ok ? await res.json() : [];
      setSearchResults(data);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function selectHospital(h: HospitalSearchResult) {
    setHospitalName(h.name);
    if (h.tel) setHospitalTel(h.tel);
    setMatchedYkiho(h.ykiho || null);
    setSearchResults(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = role === "songrim" ? "/api/auth/register/staff" : "/api/auth/register/hospital";
      const body =
        role === "songrim"
          ? { username, password, display_name: displayName, phone, email, department, position }
          : {
              username,
              password,
              display_name: displayName,
              phone,
              hospital_name: hospitalName,
              hospital_type: hospitalType,
              hospital_dept: hospitalDept,
              hospital_address: hospitalAddress,
              hospital_tel: hospitalTel,
              business_reg_no: businessRegNo,
              ceo_name: ceoName,
              ceo_phone: ceoPhone,
              matched_ykiho: matchedYkiho,
            };
      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "회원가입에 실패했습니다");
        return;
      }
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-1 w-full items-center justify-center lg:w-1/2">
        <div className="w-full max-w-md text-center">
          <h1 className="mb-3 text-title-sm font-semibold text-gray-800 dark:text-white/90">
            회원가입 신청 완료
          </h1>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            관리자 승인 후 로그인하실 수 있습니다. 승인은 송림 담당자가 확인 후 처리합니다.
          </p>
          <Link
            href="/signin"
            className="inline-block rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
          >
            로그인 페이지로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full overflow-y-auto no-scrollbar">
      <div className="w-full max-w-md sm:pt-10 mx-auto mb-5">
        <Link
          href="/signin"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeftIcon />
          로그인으로
        </Link>
      </div>
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              회원가입
            </h1>
          </div>

          <div className="mb-5 flex rounded-lg bg-gray-100 p-1 dark:bg-white/[0.04]">
            <button
              type="button"
              onClick={() => setRole("songrim")}
              className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                role === "songrim" ? "bg-white shadow dark:bg-gray-800 dark:text-white" : "text-gray-500"
              }`}
            >
              송림 직원
            </button>
            <button
              type="button"
              onClick={() => setRole("hospital")}
              className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                role === "hospital" ? "bg-white shadow dark:bg-gray-800 dark:text-white" : "text-gray-500"
              }`}
            >
              병원 회원
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-5">
              {error && (
                <div className="rounded-lg bg-error-50 px-4 py-2 text-sm text-error-600 dark:bg-error-500/15 dark:text-error-400">
                  {error}
                </div>
              )}

              {role === "hospital" && (
                <>
                  <div>
                    <Label>병원 종류</Label>
                    <Select
                      options={HOSPITAL_TYPES.map((v) => ({ value: v, label: v }))}
                      defaultValue={hospitalType}
                      onChange={(v) => {
                        setHospitalType(v);
                        setMatchedYkiho(null);
                        setSearchResults(null);
                      }}
                    />
                  </div>
                  <div className="relative">
                    <Label>병원명</Label>
                    <div className="flex gap-2">
                      <Input
                        value={hospitalName}
                        onChange={(e) => {
                          setHospitalName(e.target.value);
                          setMatchedYkiho(null);
                        }}
                        placeholder="병원명을 입력하고 검색해주세요"
                      />
                      <button
                        type="button"
                        onClick={searchHospital}
                        disabled={searching || !hospitalName.trim()}
                        className="shrink-0 rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-600 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
                      >
                        {searching ? "검색 중..." : "검색"}
                      </button>
                    </div>
                    {matchedYkiho && (
                      <p className="mt-1 text-xs text-success-600 dark:text-success-400">✓ 검색결과에서 선택됨 — 영업지도에 회원 배지로 표시됩니다</p>
                    )}
                    {searchResults !== null && (
                      <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                        {searchResults.length === 0 ? (
                          <div className="px-4 py-3 text-xs text-gray-400">검색결과 없음, 직접 입력해주세요</div>
                        ) : (
                          searchResults.map((h, i) => (
                            <button
                              type="button"
                              key={`${h.ykiho}-${i}`}
                              onClick={() => selectHospital(h)}
                              className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-white/5"
                            >
                              <div className="font-semibold text-gray-800 dark:text-white/90">{h.name}</div>
                              <div className="text-xs text-gray-400">{h.sido} {h.sigungu}{h.tel ? ` · ${h.tel}` : ""}</div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>과 (선택)</Label>
                    <Input value={hospitalDept} onChange={(e) => setHospitalDept(e.target.value)} placeholder="예: 영상의학과" />
                  </div>
                  <div>
                    <Label>병원 주소</Label>
                    <Input value={hospitalAddress} onChange={(e) => setHospitalAddress(e.target.value)} placeholder="병원 주소" />
                  </div>
                  <div>
                    <Label>병원 전화번호</Label>
                    <Input value={hospitalTel} onChange={(e) => setHospitalTel(e.target.value)} placeholder="02-000-0000" />
                  </div>
                  <div>
                    <Label>사업자 등록번호</Label>
                    <Input value={businessRegNo} onChange={(e) => setBusinessRegNo(e.target.value)} placeholder="000-00-00000" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>원장님 이름</Label>
                      <Input value={ceoName} onChange={(e) => setCeoName(e.target.value)} placeholder="원장님 이름" />
                    </div>
                    <div>
                      <Label>원장님 번호</Label>
                      <Input value={ceoPhone} onChange={(e) => setCeoPhone(e.target.value)} placeholder="010-0000-0000" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>담당자 이름</Label>
                      <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="담당자 이름" />
                    </div>
                    <div>
                      <Label>담당자 번호</Label>
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" />
                    </div>
                  </div>
                </>
              )}

              {role === "songrim" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>이름</Label>
                      <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="이름" />
                    </div>
                    <div>
                      <Label>휴대폰 번호</Label>
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" />
                    </div>
                  </div>
                  <div>
                    <Label>이메일</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@songrim.com" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>부서</Label>
                      <Select options={DEPARTMENTS.map((v) => ({ value: v, label: v }))} defaultValue={department} onChange={setDepartment} />
                    </div>
                    <div>
                      <Label>직급</Label>
                      <Select options={POSITIONS.map((v) => ({ value: v, label: v }))} defaultValue={position} onChange={setPosition} />
                    </div>
                  </div>
                </>
              )}

              <div>
                <Label>
                  아이디 <span className="text-error-500">*</span>
                </Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="로그인에 사용할 아이디" />
              </div>
              <div>
                <Label>
                  비밀번호 <span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호"
                  />
                  <span
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                  >
                    {showPassword ? (
                      <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                    ) : (
                      <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                    )}
                  </span>
                </div>
              </div>

              <div>
                <Button className="w-full" size="sm" disabled={loading}>
                  {loading ? "가입 중..." : "회원가입"}
                </Button>
              </div>
            </div>
          </form>

          <div className="mt-5">
            <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
              이미 계정이 있으신가요?{" "}
              <Link href="/signin" className="text-brand-500 hover:text-brand-600 dark:text-brand-400">
                로그인
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
