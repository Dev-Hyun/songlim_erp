"use client";
import React, { useEffect, useRef, useState,useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import { useAuth } from "../context/AuthContext";
import {
  BoxCubeIcon,
  BoxIconLine,
  CalenderIcon,
  ChatIcon,
  ChevronDownIcon,
  DollarLineIcon,
  FolderIcon,
  GroupIcon,
  HorizontaLDots,
  InfoIcon,
  MailIcon,
  PieChartIcon,
  TaskIcon,
  TimeIcon,
  UserCircleIcon,
} from "../icons/index";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  adminOnly?: boolean;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

const navItems: NavItem[] = [
  {
    icon: <PieChartIcon />,
    name: "영업",
    subItems: [
      { name: "영업지도", path: "/sales-map", pro: false },
      { name: "영업지도 통계", path: "/sales-map/stats", pro: false },
    ],
  },
  {
    icon: <BoxCubeIcon />,
    name: "계약 및 재고",
    subItems: [
      { name: "계약 진행 현황", path: "/contracts", pro: false },
      { name: "초음파 & 유지보수 현황", path: "/deliveries", pro: false },
      { name: "초음파 재고 관리", path: "/inventory/ultrasound", pro: false },
      { name: "장비 재고 관리", path: "/inventory/equipment", pro: false },
    ],
  },
  {
    icon: <CalenderIcon />,
    name: "캘린더",
    path: "/calendar",
  },
  {
    icon: <ChatIcon />,
    name: "커뮤니티",
    subItems: [
      { name: "병원 공지사항", path: "/notices/hospital", pro: false },
      { name: "회사 공지사항", path: "/notices/internal", pro: false },
      { name: "CS", path: "/cs", pro: false },
      { name: "의료소식", path: "/news", pro: false },
      { name: "입찰정보", path: "/bids", pro: false },
      { name: "공동구매", path: "/group-buy", pro: false },
      { name: "중고기기", path: "/used-equipment", pro: false },
    ],
  },
  {
    icon: <FolderIcon />,
    name: "사내 정보",
    subItems: [
      { name: "자료실", path: "/storage", pro: false },
      { name: "사내 문서 서식", path: "/documents", pro: false },
      { name: "커뮤니티", path: "/community", pro: false },
    ],
  },
  {
    icon: <DollarLineIcon />,
    name: "소모품 발주 내역",
    path: "/supply-orders",
  },
];

// 병원 계정 전용 — 영업/사내 관리 메뉴는 노출하지 않고 이 6개만 보여준다
const hospitalNavItems: NavItem[] = [
  { icon: <InfoIcon />, name: "병원 공지사항", path: "/notices/hospital" },
  { icon: <MailIcon />, name: "의료소식", path: "/news" },
  { icon: <GroupIcon />, name: "공동구매", path: "/group-buy" },
  { icon: <BoxIconLine />, name: "중고기기", path: "/used-equipment" },
  { icon: <ChatIcon />, name: "CS접수", path: "/cs" },
  { icon: <DollarLineIcon />, name: "소모품 발주", path: "/supply" },
  { icon: <DollarLineIcon />, name: "내 발주 내역 보기", path: "/my/supply-orders" },
];

const othersItems: NavItem[] = [
  {
    icon: <TaskIcon />,
    name: "영업노트",
    path: "/my/sales-notes",
  },
  {
    icon: <TimeIcon />,
    name: "운행일지",
    path: "/mileage",
  },
  {
    icon: <UserCircleIcon />,
    name: "관리자페이지",
    path: "/admin",
    adminOnly: true,
  },
  {
    icon: <BoxCubeIcon />,
    name: "소모품 관리",
    path: "/admin/supply-catalog",
  },
  {
    icon: <BoxCubeIcon />,
    name: "병원 관리",
    path: "/admin/hospitals",
  },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleMobileSidebar } = useSidebar();
  const { user } = useAuth();
  const pathname = usePathname();

  // 모바일에서 메뉴를 선택하면 사이드바를 자동으로 닫아 선택한 화면이 꽉 차게 보이도록 함
  function handleNavClick() {
    if (isMobileOpen) toggleMobileSidebar();
  }

  const isHospital = user?.role === "hospital";
  // 병원 계정은 영업/사내 전용 메뉴 전체를 대체하는 별도의 6개 메뉴만 본다
  const visibleNavItems = useMemo(() => (isHospital ? hospitalNavItems : navItems), [isHospital]);
  // 관리자 전용 메뉴(관리자페이지)는 is_admin 계정에게만 노출
  const visibleOthersItems = useMemo(
    () => othersItems.filter((item) => !item.adminOnly || user?.is_admin),
    [user]
  );

  const renderMenuItems = (
    navItems: NavItem[],
    menuType: "main" | "others"
  ) => (
    <ul className="flex flex-col gap-4">
      {navItems.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index, menuType)}
              className={`menu-item group  ${
                openSubmenu?.type === menuType && openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } cursor-pointer ${
                !isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "lg:justify-start"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center ${
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className={`menu-item-text`}>{nav.name}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ml-auto w-5 h-5 transition-transform duration-200  ${
                    openSubmenu?.type === menuType &&
                    openSubmenu?.index === index
                      ? "rotate-180 text-brand-500"
                      : ""
                  }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                href={nav.path}
                onClick={handleNavClick}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center ${
                    isActive(nav.path)
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className={`menu-item-text`}>{nav.name}</span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              ref={(el) => {
                subMenuRefs.current[`${menuType}-${index}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? `${subMenuHeight[`${menuType}-${index}`]}px`
                    : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      href={subItem.path}
                      onClick={handleNavClick}
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      }`}
                    >
                      {subItem.name}
                      <span className="flex items-center gap-1 ml-auto">
                        {subItem.new && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge `}
                          >
                            new
                          </span>
                        )}
                        {subItem.pro && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge `}
                          >
                            pro
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main" | "others";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
    {}
  );
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // const isActive = (path: string) => path === pathname;
   const isActive = useCallback((path: string) => path === pathname, [pathname]);

  useEffect(() => {
    // Check if the current path matches any submenu item
    let submenuMatched = false;
    ["main", "others"].forEach((menuType) => {
      const items = menuType === "main" ? navItems : othersItems;
      items.forEach((nav, index) => {
        if (nav.subItems) {
          nav.subItems.forEach((subItem) => {
            if (isActive(subItem.path)) {
              setOpenSubmenu({
                type: menuType as "main" | "others",
                index,
              });
              submenuMatched = true;
            }
          });
        }
      });
    });

    // If no submenu item matches, close the open submenu
    if (!submenuMatched) {
      setOpenSubmenu(null);
    }
  }, [pathname,isActive]);

  useEffect(() => {
    // Set the height of the submenu items when the submenu is opened
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (index: number, menuType: "main" | "others") => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 dark:text-gray-300 h-[calc(100dvh-4rem)] lg:h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200
        ${
          isExpanded || isMobileOpen
            ? "w-[290px]"
            : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-8 flex  ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <Link href="/">
          {isExpanded || isHovered || isMobileOpen ? (
            <span className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              SONGLIM <span className="text-brand-500">MEDICAL</span>
            </span>
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-extrabold text-white">
              S
            </span>
          )}
        </Link>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-8 duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Menu"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems(visibleNavItems, "main")}
            </div>

            {!isHospital && (
              <div className="">
                <h2
                  className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                    !isExpanded && !isHovered
                      ? "lg:justify-center"
                      : "justify-start"
                  }`}
                >
                  {isExpanded || isHovered || isMobileOpen ? (
                    "MYPAGE"
                  ) : (
                    <HorizontaLDots />
                  )}
                </h2>
                {renderMenuItems(visibleOthersItems, "others")}
              </div>
            )}
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
